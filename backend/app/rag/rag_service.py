import asyncio

from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import PromptTemplate

from app.core.background_init import init_manager
from app.core.logger_handler import logger
from app.rag.vector_store import VectorStoreService
from app.utils.prompt_loader import load_prompt

# HyDE 生成等待上限（秒）：HyDE 生成是 DeepSeek 云端调用（限长后 ~1.7s，偶发 5s+）。
# 超过上限仍未返回时直接用「直接检索」结果返回，保证 RAG 前置管线延迟有界
# （P0-3 双路并行：HyDE 生成期间已并行完成直接检索）。
_HYDE_WAIT_CAP = 2.5


class RagService:
    def __init__(self, user_id: str = None, thinking_callback=None):
        self.vector_store = VectorStoreService()
        self.note_service = init_manager.note_service
        self.retriever = None
        self.user_id = user_id
        self.prompt_text = load_prompt(prompt_type="rag_summary_prompt")
        self.prompt_template = PromptTemplate.from_template(self.prompt_text)
        self.chat_model = init_manager.chat_model
        self.chain = self._init_chain()
        self.hyde_prompt_template = PromptTemplate.from_template(
            "基于以下问题，生成一个简短的假设性回答（150字以内），"
            "我会根据你的这个假设性回答在向量数据库里检索文档：\n\n问题：{query}\n\n假设性回答："
        )
        self.thinking_callback = thinking_callback

    async def initialize_retriever(self, query: str = None):
        """
        初始化检索器
        :param query: 查询语句，用于动态调整权重
        """
        if self.retriever is None:
            # 获取动态权重信息
            weights = await self.vector_store.get_dynamic_weights(query)

            if self.thinking_callback:
                await self.thinking_callback({
                    "type": "thinking",
                    "stage": "retrieval",
                    "content": f"初始化检索器（向量权重: {weights[0]:.1f}, BM25权重: {weights[1]:.1f}）",
                    "details": {
                        "vector_weight": weights[0],
                        "bm25_weight": weights[1]
                    }
                })

            self.retriever = await self.vector_store.get_retriever(query, self.user_id)


    def _init_chain(self):
        """初始化链"""
        chain = (
                self.prompt_template
                | self.chat_model
                | StrOutputParser()
        )
        return chain

    async def generate_hypothetical_document(self, query: str) -> str:
        """
        使用HyDE技术生成假设性文档
        :param query: 用户查询
        :return: 假设性文档内容
        """
        try:
            hyde_chain = (
                self.hyde_prompt_template
                # 限长：HyDE 仅为检索服务，无需长文。不限长时 DeepSeek 会生成
                # 1000~2000 字假设文档耗时 8~40s，max_tokens=150 实测降至 ~1.7s
                | self.chat_model.bind(max_tokens=150)
                | StrOutputParser()
            )
            hypothetical_doc = await hyde_chain.ainvoke({"query": query})
            logger.info(f"【HyDE】生成的假设性文档:\n{hypothetical_doc}")
            return hypothetical_doc
        except Exception as e:
            logger.error(f"【HyDE】生成假设性文档失败: {e}")
            return query

    async def retrieve_document(self, query: str) -> list:
        """使用HyDE技术 从向量数据库里检索文档（P0-3 双路并行）

        并行策略：HyDE 生成（DeepSeek，限长后 ~1.7s，偶发慢）期间，
        先用原始查询并行完成「直接检索」（本地向量库，快）；HyDE 在等待上限
        （_HYDE_WAIT_CAP）内返回则再做一次增强检索并与直接结果合并去重
        （召回更全、重排序候选更多），超过上限则直接用直接检索结果（延迟有界）。
        """
        if not self.user_id:
            logger.warning("【HyDE】user_id为空，不进行任何检索")
            return []

        try:
            # 确保检索器已初始化，传递query参数（两条检索路径共用同一检索器）
            if self.retriever is None:
                await self.initialize_retriever(query)

            if self.thinking_callback:
                await self.thinking_callback({
                    "type": "thinking",
                    "stage": "hyde",
                    "content": f"正在并行执行双路检索：生成假设性文档 + 直接检索「{query}」..."
                })

            async def _search(text: str) -> tuple[list, list]:
                """单路检索：知识库混合检索 + 笔记库检索（来源标记由合并函数统一处理）"""
                kb_docs = await self.retriever.ainvoke(text)
                note_docs = []
                try:
                    note_docs = await asyncio.to_thread(
                        self.note_service.notes_store.similarity_search,
                        text, k=3,
                        filter={"user_id": self.user_id}
                    )
                except Exception as e:
                    logger.error(f"【RAG】检索笔记失败: {e}")
                return kb_docs, note_docs

            def _merge(direct: tuple[list, list], enhanced: tuple[list, list] | None) -> list:
                """合并两路结果：笔记在前、知识库在后，各自按内容去重，标记来源"""
                note_docs = list(direct[1])
                kb_docs = list(direct[0])
                if enhanced is not None:
                    seen_notes = {d.page_content for d in note_docs}
                    for doc in enhanced[1]:
                        if doc.page_content not in seen_notes:
                            note_docs.append(doc)
                            seen_notes.add(doc.page_content)
                    seen_kb = {d.page_content for d in kb_docs}
                    for doc in enhanced[0]:
                        if doc.page_content not in seen_kb:
                            kb_docs.append(doc)
                            seen_kb.add(doc.page_content)
                for doc in kb_docs:
                    doc.metadata["source_type"] = "knowledge_base"
                for doc in note_docs:
                    doc.metadata["source_type"] = "note"
                return note_docs + kb_docs

            # ── 并行：HyDE 生成（后台任务）与直接检索（立即执行，不等待 LLM）──
            logger.info(f"【HyDE】开始处理查询: {query}（双路并行）")
            hyde_task = asyncio.create_task(self.generate_hypothetical_document(query))
            kb_direct, note_direct = await _search(query)

            if self.thinking_callback:
                await self.thinking_callback({
                    "type": "thinking",
                    "stage": "retrieval",
                    "content": f"直接检索完成，找到 {len(kb_direct)} 篇知识库文档, {len(note_direct)} 篇笔记"
                })

            # 直接检索无任何结果（如知识库为空）：增强检索同样无结果，无需等待 HyDE
            if not kb_direct and not note_direct:
                hyde_task.cancel()
                # 消费取消，避免 asyncio 打印 "Task exception was never retrieved"
                hyde_task.add_done_callback(lambda t: t.cancelled() or t.exception())
                return []

            # 等待 HyDE 生成（有上限：慢调用不拖住管线，超过上限直接返回）
            done, _ = await asyncio.wait({hyde_task}, timeout=_HYDE_WAIT_CAP)
            if hyde_task in done:
                hypothetical_doc = hyde_task.result()
                if self.thinking_callback:
                    await self.thinking_callback({
                        "type": "thinking",
                        "stage": "hyde",
                        "content": "假设性文档生成完成，正在执行增强检索...",
                        "details": {
                            "hypothetical_doc_preview": hypothetical_doc[:200] + "..." if len(hypothetical_doc) > 200 else hypothetical_doc
                        }
                    })

                # 使用假设性文档进行增强检索
                logger.info("【HyDE】使用假设性文档进行增强检索")
                kb_hyde, note_hyde = await _search(hypothetical_doc)
                all_documents = _merge((kb_direct, note_direct), (kb_hyde, note_hyde))
                logger.info(
                    f"【HyDE】双路检索合并完成：直接 {len(kb_direct)}+{len(note_direct)}，"
                    f"增强 {len(kb_hyde)}+{len(note_hyde)}，去重后共 {len(all_documents)} 篇"
                )
            else:
                # HyDE 生成超过等待上限：直接使用直接检索结果（取消慢调用，释放资源）
                all_documents = _merge((kb_direct, note_direct), None)
                hyde_task.cancel()
                # 消费取消/异常，避免 asyncio 打印 "Task exception was never retrieved"
                hyde_task.add_done_callback(lambda t: t.cancelled() or t.exception())
                logger.warning(f"【HyDE】生成超过 {_HYDE_WAIT_CAP}s 等待上限，使用直接检索结果（共 {len(all_documents)} 篇）")

            if self.thinking_callback:
                doc_previews = []
                for i, doc in enumerate(all_documents, 1):
                    preview = doc.page_content[:150] + "..." if len(doc.page_content) > 150 else doc.page_content
                    if doc.metadata.get("source_type") == "note":
                        source = f"笔记《{doc.metadata.get('title', '无标题')}》"
                    else:
                        source = doc.metadata.get("original_filename", doc.metadata.get("source", "unknown"))
                    doc_previews.append({
                        "index": i,
                        "preview": preview,
                        "source": source,
                    })
                note_count = sum(1 for d in all_documents if d.metadata.get("source_type") == "note")
                kb_count = len(all_documents) - note_count
                await self.thinking_callback({
                    "type": "thinking",
                    "stage": "retrieval",
                    "content": f"检索到 {note_count} 篇相关笔记, {kb_count} 篇知识库文档",
                    "details": {
                        "documents": doc_previews
                    }
                })

            return all_documents
        except Exception as e:
            logger.error(f"【HyDE】检索文档失败: {e}")
            return []

    async def reorder_documents(self, query: str, documents: list) -> list:
        """
        对文档进行重排序
        :param query: 查询语句
        :param documents: 文档列表
        :return: 重排序后的文档列表
        """
        if self.thinking_callback:
            await self.thinking_callback({
                "type": "thinking",
                "stage": "reorder",
                "content": f"正在对 {len(documents)} 个文档进行重排序..."
            })

        result = await init_manager.reorder_service.reorder_documents(query, documents, thinking_callback=self.thinking_callback)
        if result["success"]:
            # 提取重排序后的文档内容
            reordered_documents = [doc.get("document", "") for doc in result["documents"]]
            logger.info(f"【RAG】文档重排序成功，返回 {len(reordered_documents)} 个文档")

            if self.thinking_callback:
                score_details = []
                for i, doc in enumerate(result["documents"], 1):
                    score_details.append({
                        "rank": i,
                        "score": round(doc.get("similarity", 0), 4),
                        "preview": doc.get("document", "")[:100] + "..." if len(doc.get("document", "")) > 100 else doc.get("document", "")
                    })
                await self.thinking_callback({
                    "type": "thinking",
                    "stage": "reorder",
                    "content": f"重排序完成，返回 {len(reordered_documents)} 个文档",
                    "details": {
                        "scores": score_details
                    }
                })

            return reordered_documents
        else:
            logger.warning(f"【RAG】重排序失败: {result['error']}")
            return documents

    async def get_documents_and_summary(self, query: str) -> dict:
        """
        获取文档列表和摘要
        :param query: 查询语句
        :return: 包含文档列表和摘要的字典
        """
        if not self.user_id:
            logger.warning("【RAG】user_id为空，不返回任何文档")
            return {
                "documents": [],
                "summary": "抱歉，我没有找到相关的信息。"
            }

        try:
            documents = await self.retrieve_document(query)

            # 提取文档内容列表，附上来源标记供 LLM 引用
            def _format_doc(doc):
                if doc.metadata.get("source_type") == "note":
                    title = doc.metadata.get("title", "无标题")
                    return f"[来源：笔记《{title}》]\n{doc.page_content}"
                else:
                    filename = doc.metadata.get("original_filename", "知识库文档")
                    return f"[来源：知识库《{filename}》]\n{doc.page_content}"

            document_contents = [_format_doc(doc) for doc in documents]

            # 对文档进行重排序
            reordered_documents = await self.reorder_documents(query, document_contents)

            # 如果没有检索到文档
            if not reordered_documents:
                return {
                    "documents": [],
                    "summary": "抱歉，我没有找到相关的信息。"
                }

            # 使用合并总结策略：一次 LLM 调用完成
            # （原实现：逐文档总结 3 次 + 合并总结 1 次 = 4 次串行 LLM 调用，延迟高）
            try:
                max_documents = 3  # 使用前3个最相关的文档

                if self.thinking_callback:
                    await self.thinking_callback({
                        "type": "thinking",
                        "stage": "summarize",
                        "content": f"正在基于前 {min(max_documents, len(reordered_documents))} 个相关文档生成回答..."
                    })

                # 拼接参考资料（每个文档截断，防止上下文超限）
                combined_parts = []
                for i, doc in enumerate(reordered_documents[:max_documents], 1):
                    combined_parts.append(f"【参考资料{i}】:{doc[:1500]}")
                combined_context = "\n\n".join(combined_parts)

                import time
                start_time = time.time()
                final_summary = await asyncio.wait_for(
                    self.chain.ainvoke({"input": query, "context": combined_context}),
                    timeout=30.0  # 生成回答超时时间
                )
                end_time = time.time()
                logger.info(f"【RAG】生成回答耗时: {end_time - start_time:.2f}秒")

                logger.info("【RAG】生成回答成功")
                return {
                    "documents": reordered_documents,
                    "summary": final_summary
                }
            except TimeoutError:
                logger.error("【RAG】生成回答超时")
                return {
                    "documents": reordered_documents,
                    "summary": "抱歉，生成回答超时，请稍后再试。"
                }
        except Exception as e:
            logger.error(f"【RAG】生成摘要失败: {e}", exc_info=True)
            return {
                "documents": [],
                "summary": "抱歉，处理您的请求时出现了错误。"
            }

    async def rag_summary(self, query: str) -> str:
        """RAG 摘要"""
        result = await self.get_documents_and_summary(query)
        return result.get("summary", "抱歉，处理您的请求时出现了错误。")

if __name__ == '__main__':
    import asyncio

    async def main():
        service = RagService()
        await service.initialize_retriever()
        result = await service.rag_summary("小户型适合什么扫地机器人")
        logger.debug(f"RAG结果: {result}")

    asyncio.run(main())
