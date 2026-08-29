"""
笔记管理 API 路由 —— CRUD、搜索、自动标签、内联补全、写作辅助。
"""

from fastapi import Depends, Query, Request
from fastapi.responses import Response, StreamingResponse
from fastapi.routing import APIRouter
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.background_init import init_manager
from app.core.logger_handler import logger
from app.core.rate_limit import rate_limit
from app.core.success_response import success_response
from app.db.db_config import get_db
from app.models.note import Note
from app.schemas.models import (
    BatchCategoryRequest,
    BatchIdsRequest,
    BatchPinRequest,
    NoteCreate,
    NoteListResponse,
    NoteUpdate,
)
from app.utils.auth_utils import get_current_user_id

note_router = APIRouter(prefix="/note", tags=["note"])


async def ensure_note_service():
    """依赖：等待 NoteService 后台初始化完成后再处理请求。"""
    await init_manager.note_service_ready.wait()
    return init_manager.note_service


note_router.dependencies = [Depends(ensure_note_service)]


@note_router.post("/create")
async def create_note(
    payload: NoteCreate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(rate_limit(limit=120, window=60)),
):
    """
    创建笔记：
    1. MySQL 写入 + ChromaDB 向量化
    2. 立即返回笔记（tags/category 初始为空）
    3. 后台异步生成标签和回顾记录
    """
    note = await init_manager.note_service.create_note(db, user_id, payload)
    return success_response(message="笔记创建成功", data=note)


@note_router.get("/list")
async def list_notes(
    request: Request,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    category: str = Query(None),
    tag: str = Query(None),
    sort_by: str = Query("updated_at", pattern="^(updated_at|created_at|title)$"),
):
    """
    笔记列表：分页查询，支持按分类筛选和排序（tag 过滤已下沉 SQL，分页基于过滤后数据）。
    客户端缓存：private 30s + ETag 版本化（304 短路），写操作自动失效。
    """
    from app.core.http_cache import apply_http_cache, is_not_modified
    if await is_not_modified(request, "note", user_id):
        return Response(status_code=304)

    notes, total = await init_manager.note_service.list_notes(db, user_id, page, page_size, category, tag, sort_by)
    response = success_response(data=NoteListResponse(notes=notes, total_count=total))
    return await apply_http_cache(request, response, "note", user_id, max_age=30)


@note_router.get("/search")
async def search_notes(
    q: str = Query(..., description="搜索关键词"),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """
    全文语义搜索：走 ChromaDB notes_collection 向量检索，
    返回当前用户的语义相似笔记。
    """
    notes = await init_manager.note_service.search_notes(db, user_id, q)
    return success_response(data=NoteListResponse(notes=notes, total_count=len(notes)))


@note_router.post("/batch/delete")
async def batch_delete_notes(
    payload: BatchIdsRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(rate_limit(limit=120, window=60)),
):
    """
    批量删除笔记：按 ID 列表删除笔记及其向量。
    """
    deleted = await init_manager.note_service.batch_delete_notes(db, user_id, payload.ids)
    return success_response(message=f"成功删除 {deleted} 篇笔记")


@note_router.post("/batch/download")
async def batch_download_notes(
    payload: BatchIdsRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(rate_limit(limit=10, window=60)),
):
    """
    批量下载笔记为 ZIP 压缩包（内含 .md 文件）。
    """
    from urllib.parse import quote
    from datetime import datetime

    zip_bytes = await init_manager.note_service.batch_export_zip(db, user_id, payload.ids)
    date_str = datetime.now().strftime("%Y%m%d")
    filename = f"notes_{date_str}.zip"
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={
            "Content-Disposition": f"attachment; filename=\"{filename}\"; filename*=UTF-8''{quote(filename)}",
        }
    )


@note_router.put("/batch/category")
async def batch_update_category(
    payload: BatchCategoryRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(rate_limit(limit=120, window=60)),
):
    """
    批量更新笔记分类。
    """
    updated = await init_manager.note_service.batch_update_category(db, user_id, payload.ids, payload.category)
    return success_response(message=f"成功更新 {updated} 篇笔记的分类")


@note_router.put("/batch/pin")
async def batch_pin_notes(
    payload: BatchPinRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(rate_limit(limit=120, window=60)),
):
    """
    批量置顶/取消置顶笔记。
    """
    updated = await init_manager.note_service.batch_update_pin(db, user_id, payload.ids, payload.is_pinned)
    return success_response(message=f"成功更新 {updated} 篇笔记的置顶状态")


@note_router.get("/stats")
async def get_stats(
    request: Request,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """
    获取用户笔记分类统计。
    返回各分类下的笔记数量及总数。
    客户端缓存：private 60s + ETag 版本化。
    """
    from app.core.http_cache import apply_http_cache, is_not_modified
    if await is_not_modified(request, "note", user_id):
        return Response(status_code=304)

    stats = await init_manager.note_service.get_category_stats(db, user_id)
    response = success_response(data=stats)
    return await apply_http_cache(request, response, "note", user_id, max_age=60)


@note_router.get("/graph")
async def get_note_graph(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(50, ge=2, le=100),
    include_semantic: bool = Query(False, description="按需计算语义关联；默认仅查询已有双链"),
):
    """
    知识图谱数据（Top N 节点限制）：
    - nodes: 最近更新的笔记（id/title/category）
    - links: 已有双链；include_semantic=true 时额外计算语义关联
    - semantic_status: not_requested / complete / partial / unavailable

    注意：本路由必须注册在 /{note_id} 之前，否则会被路径参数吞掉。
    """
    from sqlalchemy import select

    from app.models.note_link import NoteLink

    # 1. 最近更新的 N 篇笔记作为节点
    stmt = (
        select(Note)
        .where(Note.user_id == user_id)
        .order_by(Note.updated_at.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    notes = result.scalars().all()

    nodes = [
        {"id": n.id, "title": n.title, "category": n.category}
        for n in notes
    ]
    node_ids = [n.id for n in notes]
    title_to_id = {n.title: n.id for n in notes}
    node_id_set = set(node_ids)

    seen_edges: set[tuple[str, str]] = set()
    links: list[dict] = []

    # 2. 双链边：note_links 中目标标题对应的笔记也在节点内
    link_stmt = select(NoteLink).where(
        NoteLink.user_id == user_id,
        NoteLink.note_id.in_(node_ids),
    )
    link_result = await db.execute(link_stmt)
    for nl in link_result.scalars().all():
        target_id = title_to_id.get(nl.linked_title)
        if target_id and target_id != nl.note_id:
            key = (nl.note_id, target_id)
            if key not in seen_edges:
                seen_edges.add(key)
                links.append({"source": nl.note_id, "target": target_id, "type": "link"})

    # 3. 默认不访问模型。手动加载时顺序查询，避免共享 AsyncSession 并发使用。
    # 首次失败即停止剩余请求，保留已有图谱，并明确报告降级状态。
    semantic_status = "not_requested"
    if include_semantic:
        semantic_status = "complete"
        completed = 0
        for note_id in node_ids if len(node_ids) > 1 else []:
            try:
                related = await init_manager.note_service.get_related_notes(
                    db, note_id, user_id, top_k=2, include_knowledge=False, raise_errors=True,
                )
                completed += 1
            except Exception as e:
                logger.warning(f"图谱语义检索已暂停（保留已有双链）note_id={note_id}: {type(e).__name__}")
                semantic_status = "partial" if completed else "unavailable"
                break
            for item in related:
                if item.get("source") != "note":
                    continue
                target_id = item.get("id")
                if target_id in node_id_set and target_id != note_id:
                    key = (note_id, target_id)
                    if key not in seen_edges:
                        seen_edges.add(key)
                        links.append({"source": note_id, "target": target_id, "type": "similar"})

    return success_response(data={"nodes": nodes, "links": links, "semantic_status": semantic_status})


@note_router.delete("/category/{category}")
async def delete_category(
    category: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(rate_limit(limit=10, window=60)),
):
    """
    删除某个分类及其下所有笔记。
    返回被删除的笔记数量。
    """
    deleted = await init_manager.note_service.delete_category(db, user_id, category)
    return success_response(data={"deleted_count": deleted}, message=f"成功删除分类「{category}」及其 {deleted} 篇笔记")


class AutocompleteRequest(BaseModel):
    """内联补全请求模型"""
    context: str


@note_router.post("/autocomplete")
async def autocomplete(
    payload: AutocompleteRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    AI 内联补全。基于光标前上下文，调用本地 Ollama qwen3:0.8b 快速返回续写文本。
    非流式，目标延迟 300-500ms。
    """
    result = await init_manager.note_service.autocomplete(payload.context)
    return success_response(data=result)


class AssistRequest(BaseModel):
    """写作辅助请求模型"""
    content: str
    action: str = "continue"


@note_router.post("/assist/stream")
async def assist_stream(
    payload: AssistRequest,
    user_id: str = Depends(get_current_user_id),
    _: None = Depends(rate_limit(limit=120, window=60)),
):
    """
    AI 写作辅助 SSE 流式输出。支持三种模式：
    - continue：续写
    - expand：扩写
    - summarize：缩写
    """
    return StreamingResponse(
        init_manager.note_service.assist_stream(payload.content, payload.action),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


@note_router.put("/{note_id}")
async def update_note(
    note_id: str,
    payload: NoteUpdate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(rate_limit(limit=120, window=60)),
):
    """
    更新笔记：修改 title/content，content 变更时同步更新 ChromaDB 向量。
    """
    note = await init_manager.note_service.update_note(db, note_id, user_id, payload)
    if not note:
        return success_response(message="笔记不存在")
    return success_response(message="笔记更新成功", data=note)


@note_router.put("/{note_id}/pin")
async def toggle_pin(
    note_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """
    切换笔记置顶状态。
    """
    note = await init_manager.note_service.get_note(db, note_id, user_id)
    if not note:
        return success_response(message="笔记不存在")
    new_pinned = not note.is_pinned
    updated = await init_manager.note_service.update_note(db, note_id, user_id, NoteUpdate(is_pinned=new_pinned))
    return success_response(message="置顶已更新", data=updated)


@note_router.delete("/{note_id}")
async def delete_note(
    note_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(rate_limit(limit=120, window=60)),
):
    """
    删除笔记：联删 MySQL 记录、ChromaDB 向量、以及级联的 review_records。
    """
    deleted = await init_manager.note_service.delete_note(db, note_id, user_id)
    if not deleted:
        return success_response(message="笔记不存在")
    return success_response(message="笔记删除成功")


@note_router.get("/{note_id}")
async def get_note(
    request: Request,
    note_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """
    获取笔记详情（5 分钟客户端缓存 + ETag 版本化，写操作自动失效；Redis 不可用时直查数据库）。
    """
    from app.cache.redis_decorator import RedisCache
    from app.core.http_cache import apply_http_cache, is_not_modified
    if await is_not_modified(request, "note", user_id):
        return Response(status_code=304)

    note = await RedisCache.get_or_set(
        f"note_detail:{user_id}:{note_id}",
        init_manager.note_service.get_note,
        db,
        note_id,
        user_id,
        expire=300,
    )
    if not note:
        return success_response(message="笔记不存在")
    response = success_response(data=note)
    return await apply_http_cache(request, response, "note", user_id, max_age=300)


@note_router.post("/{note_id}/auto-tag")
async def regenerate_tags(
    note_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """
    手动触发重新生成标签。
    """
    note = await init_manager.note_service.get_note(db, note_id, user_id)
    if not note:
        return success_response(message="笔记不存在")

    import asyncio
    task = asyncio.create_task(init_manager.note_service._auto_tag_and_review(note_id, user_id, note.content))
    # 持有引用防止任务被垃圾回收
    init_manager.note_service._background_tasks.add(task)
    task.add_done_callback(init_manager.note_service._background_tasks.discard)
    return success_response(message="标签生成任务已提交")


@note_router.get("/{note_id}/related")
async def get_related_notes(
    note_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """
    获取当前笔记的语义相似笔记和知识库文档（Top 3），
    标注来源：note（笔记库）或 knowledge_base（知识库）。
    """
    related = await init_manager.note_service.get_related_notes(db, note_id, user_id)
    return success_response(data=related)


@note_router.get("/{note_id}/backlinks")
async def get_backlinks(
    note_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """
    双链查询：
    - backlinks: 引用当前笔记标题（[[标题]]）的其他笔记列表
    - outlinks: 当前笔记引用的 [[标题]] 列表
    链接按标题精确匹配，限定当前用户。
    """
    from sqlalchemy import select

    from app.models.note_link import NoteLink

    note = await init_manager.note_service.get_note(db, note_id, user_id)
    if not note:
        return success_response(message="笔记不存在", data={"backlinks": [], "outlinks": []})

    # 反向链接：linked_title == 当前笔记标题（排除自身）
    stmt = (
        select(NoteLink.note_id, Note.title, Note.updated_at)
        .join(Note, Note.id == NoteLink.note_id)
        .where(
            NoteLink.user_id == user_id,
            NoteLink.linked_title == note.title,
        )
        .distinct()
    )
    result = await db.execute(stmt)
    backlinks = [
        {
            "note_id": row[0],
            "title": row[1],
            "updated_at": str(row[2]) if row[2] else None,
        }
        for row in result
        if row[0] != note_id
    ]

    # 正向引用：当前笔记中的 [[标题]]
    out_stmt = select(NoteLink.linked_title).where(
        NoteLink.note_id == note_id,
        NoteLink.user_id == user_id,
    )
    out_result = await db.execute(out_stmt)
    outlinks = [row[0] for row in out_result]

    return success_response(data={"backlinks": backlinks, "outlinks": outlinks})


@note_router.get("/{note_id}/export")
async def export_note(
    note_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """
    导出单篇笔记为 Markdown 格式纯文本。
    """
    md = await init_manager.note_service.export_note_markdown(db, note_id, user_id)
    if not md:
        return success_response(message="笔记不存在")
    return success_response(data={"markdown": md, "filename": f"{note_id}.md"})


@note_router.get("/{note_id}/download")
async def download_note(
    note_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """
    下载笔记为 Markdown 文件（浏览器触发下载）。
    返回 Content-Disposition: attachment 的 markdown 文件响应。
    """
    note = await init_manager.note_service.get_note(db, note_id, user_id)
    if not note:
        return success_response(message="笔记不存在")

    md = await init_manager.note_service.export_note_markdown(db, note_id, user_id)

    import re
    from urllib.parse import quote

    safe_title = re.sub(r'[\\/:*?"<>|]', '_', note.title or note_id)
    filename = f"{safe_title}.md"

    # RFC 5987: filename* 支持 UTF-8 非 ASCII 文件名
    # filename 作为 ASCII-only fallback（避免 latin-1 编码错误）
    return Response(
        content=md.encode("utf-8"),
        media_type="text/markdown; charset=utf-8",
        headers={
            "Content-Disposition": f"attachment; filename=\"{note_id}.md\"; filename*=UTF-8''{quote(filename, safe='')}",
        }
    )
