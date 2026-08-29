import asyncio
import json
import re
import uuid

from fastapi import Depends, Request
from fastapi.responses import StreamingResponse
from fastapi.routing import APIRouter

from app.agent.agent import get_agent_stream_response
from app.core.rate_limit import rate_limit
from app.core.success_response import success_response
from app.router.chat_service import ChatService, get_router_service
from app.schemas.models import QueryRequest, RAGRequest, RAGResponse, ReorderRequest, ReorderResponse, SessionResponse, SessionUpdateRequest
from app.utils.auth_utils import get_current_user_id

chat_router = APIRouter(prefix="/chat", tags=["chat"])

# 自我认知/闲聊类查询：向量分数对闲聊与知识问题无区分度（实测 0.54~0.59 重叠），
# 这类问题没有知识库检索价值，直接跳过 RAG 前置管线
_SELF_INTRO_RE = re.compile(r"(你是谁|介绍一下你(自己)?|你能(做|干)什么|你的(功能|名字|能力)|自我(介绍)?)")


def _should_skip_rag(query: str) -> str | None:
    """启发式判断是否跳过 RAG 前置管线；返回跳过原因，不跳过返回 None"""
    q = (query or "").strip()
    if not q:
        return "空查询"
    if len(q) <= 4:
        return "查询过短"
    if _SELF_INTRO_RE.search(q):
        return "自我认知类问题"
    return None


@chat_router.post("/agent/query/stream")
async def query_stream(
        request: QueryRequest,
        user_id: str = Depends(get_current_user_id),
        _: None = Depends(rate_limit(limit=120, window=60))
):
    """查询Agent流式响应"""
    session_id = request.session_id or str(uuid.uuid4())

    from app.core.logger_handler import logger
    from app.rag.vector_store import VectorStoreService

    vector_store = VectorStoreService()

    # ---- 路由判断（快速，~50ms）----
    # 一次 similarity_search 同时产出路由分数与 Top-1 日志信息
    # （原实现 compute_route_score + top1 检索 = 两次 embedding + 两次 Chroma 查询）
    try:
        top1_docs = await asyncio.to_thread(
            vector_store.vectors_store.similarity_search_with_score,
            request.query, k=1, filter={"user_id": user_id}
        )
    except Exception as e:
        logger.error(f"【路由判断】检索失败: {e}")
        top1_docs = []

    score = 1 / (1 + top1_docs[0][1]) if top1_docs else 0.0
    skip_reason = _should_skip_rag(request.query)
    use_rag = score > 0.5 and not skip_reason

    if top1_docs:
        top1_doc, top1_distance = top1_docs[0]
        source_type = "笔记库" if top1_doc.metadata.get("source_type") == "note" else "知识库"
        source_name = top1_doc.metadata.get("title") or top1_doc.metadata.get("original_filename", "未知")
        preview = top1_doc.page_content[:80].replace("\n", " ")
        logger.info(
            f"【路由决策】查询: 「{request.query}」 | "
            f"score: {score:.4f} (距离: {top1_distance:.4f}) | "
            f"Top-1来源: {source_type}《{source_name}》 | "
            f"预览: {preview}... | "
            f"决策: {'→ RAG 前置管线' if use_rag else '→ 跳过 RAG' + (f'（{skip_reason}）' if skip_reason else '')}"
        )
    else:
        logger.info(
            f"【路由决策】查询: 「{request.query}」 | "
            f"score: {score:.4f} | "
            f"Top-1: 无文档 | "
            f"决策: → 跳过 RAG"
        )

    async def stream_with_rag_thinking():
        """包装生成器：整条管线（RAG 前置 + Agent 生成 + 会话落库）在独立后台任务中执行，
        本生成器只负责实时转发事件——客户端断开（切出页面/刷新）不影响管线继续完成入库"""
        pipeline_queue = asyncio.Queue()
        pipeline_done = asyncio.Event()

        async def run_pipeline():
            """后台执行完整管线：RAG 前置（如命中）→ Agent 流式（内部含会话落库）"""
            try:
                rag_context = ""

                if use_rag:
                    try:
                        from app.rag.rag_service import RagService

                        async def thinking_callback(data: dict):
                            await pipeline_queue.put(data)

                        rag_service = RagService(user_id, thinking_callback=thinking_callback)
                        documents = await rag_service.retrieve_document(request.query)

                        def _format_doc(doc):
                            if doc.metadata.get("source_type") == "note":
                                title = doc.metadata.get("title", "无标题")
                                return f"[来源：笔记《{title}》]\n{doc.page_content}"
                            else:
                                filename = doc.metadata.get("original_filename", "知识库文档")
                                return f"[来源：知识库《{filename}》]\n{doc.page_content}"

                        doc_contents = [_format_doc(doc) for doc in documents]
                        reordered = await rag_service.reorder_documents(request.query, doc_contents)
                        # 注入 Agent 前每文档截断至 600 字（重排序仍用全文参与评分），
                        # 控制 system prompt 规模，降低 Agent 首轮 LLM 调用延迟
                        rag_context = "\n\n".join(doc[:600] for doc in reordered[:3])
                        logger.info(f"【RAG前置】检索到 {len(documents)} 个文档，重排序后取前 {min(3, len(reordered))} 个注入 Agent")
                    except Exception as e:
                        # RAG 前置失败不阻断 Agent（rag_context 保持为空）
                        logger.error(f"【RAG前置】管线执行失败: {e}", exc_info=True)

                # Agent 流式：解析其 SSE 帧为事件后转发
                # （get_agent_stream_response 内部 run_agent 独立任务负责回答落库，
                #   本任务不依赖客户端连接，断开后仍会跑完）
                async for chunk in get_agent_stream_response(
                    request.query, session_id, user_id, rag_context=rag_context
                ):
                    if chunk.startswith("data: "):
                        try:
                            event = json.loads(chunk[6:])
                            await pipeline_queue.put(event)
                        except Exception:
                            continue
            except Exception as e:
                logger.error(f"【AI管线】执行失败: {e}", exc_info=True)
            finally:
                pipeline_done.set()

        # 启动完整管线（独立任务：客户端断开不影响其完成）
        pipeline_task = asyncio.create_task(run_pipeline())

        # 实时转发队列事件，直到管线完成
        while not pipeline_done.is_set() or not pipeline_queue.empty():
            try:
                event = pipeline_queue.get_nowait()
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
                pipeline_queue.task_done()
            except asyncio.QueueEmpty:
                try:
                    event = await asyncio.wait_for(pipeline_queue.get(), timeout=0.1)
                    yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
                    pipeline_queue.task_done()
                except (asyncio.TimeoutError, asyncio.QueueEmpty):
                    continue

        # 管线完成，drain 一次防止竞态丢失事件
        await pipeline_task
        while not pipeline_queue.empty():
            event = pipeline_queue.get_nowait()
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
            pipeline_queue.task_done()

    return StreamingResponse(
        stream_with_rag_thinking(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive"
        }
    )


@chat_router.post("/rag/query", response_model=RAGResponse)
async def query_rag(
        request: RAGRequest,
        user_id: str = Depends(get_current_user_id),
        router_service: ChatService = Depends(get_router_service),
        _: None = Depends(rate_limit(limit=30, window=60))
):
    """RAG检索"""
    response = await router_service.handle_rag_query(request.query, user_id)
    return success_response(data=RAGResponse(response=response))


@chat_router.get("/session/{session_id}", response_model=SessionResponse)
async def get_session(session_id: str, user_id: str = Depends(get_current_user_id), router_service: ChatService = Depends(get_router_service)):
    """获取会话信息，使用user_id验证"""
    history = await router_service.handle_get_session(session_id, user_id)
    return success_response(data=SessionResponse(session_id=session_id, history=history))


@chat_router.delete("/session/{session_id}")
async def delete_session(session_id: str, user_id: str = Depends(get_current_user_id), router_service: ChatService = Depends(get_router_service)):
    """删除会话"""
    await router_service.handle_delete_session(session_id, user_id)
    return success_response(message=f"Session {session_id} deleted successfully")


@chat_router.patch("/session/{session_id}")
async def update_session(
    session_id: str,
    payload: SessionUpdateRequest,
    user_id: str = Depends(get_current_user_id),
    router_service: ChatService = Depends(get_router_service),
):
    """更新会话：重命名（title）或置顶切换（is_pinned），可同时传，只更新显式传入的字段"""
    result = await router_service.handle_update_session(session_id, user_id, payload)
    return success_response(message="会话已更新", data=result)


@chat_router.get("/sessions")
async def get_all_sessions(
    user_id: str = Depends(get_current_user_id),
    router_service: ChatService = Depends(get_router_service),
):
    """获取当前用户的所有会话ID（需 JWT 认证，仅返回本人会话）"""
    session_ids = await router_service.handle_get_all_sessions(user_id)
    return success_response(data={"sessions": session_ids})


@chat_router.get("/sessions/{user_id}")
async def get_user_sessions(
    request: Request,
    user_id: str,
    current_user_id: str = Depends(get_current_user_id),
    router_service: ChatService = Depends(get_router_service),
):
    """
    获取用户所有会话（客户端缓存：private 30s + ETag 版本化，
    会话写操作 add_message/重命名/置顶/删除 自动失效）。
    """
    from app.core.http_cache import apply_http_cache, is_not_modified
    if await is_not_modified(request, "chat", current_user_id):
        from fastapi.responses import Response
        return Response(status_code=304)

    session_ids = await router_service.handle_get_user_sessions(user_id, current_user_id)
    response = success_response(data={"sessions": session_ids})
    return await apply_http_cache(request, response, "chat", current_user_id, max_age=30)


@chat_router.post("/reorder", response_model=ReorderResponse)
async def reorder_documents(
        request: ReorderRequest,
        router_service: ChatService = Depends(get_router_service),
        _: None = Depends(rate_limit(limit=30, window=60))
):
    """使用Ollama本地的嵌入模型对文档进行中文重排序"""
    sorted_docs = await router_service.handle_reorder(request.query, request.documents)
    return success_response(data=ReorderResponse(documents=sorted_docs))
