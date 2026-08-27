import asyncio
import threading
import time

from langchain_chroma import Chroma
from langchain_classic.retrievers import EnsembleRetriever
from langchain_community.retrievers import BM25Retriever
from langchain_core.documents import Document
from langchain_core.retrievers import BaseRetriever

from app.utils.config import chroma_config

from .empty_retriever import EmptyRetriever

# BM25 索引缓存 TTL（秒）：覆盖"文档数量不变但内容更新"的罕见场景
_BM25_CACHE_TTL = 300


class HybridRetriever:
    """混合检索器（BM25 + 向量检索）"""

    def __init__(self, vectors_store: Chroma):
        self.vectors_store = vectors_store
        # BM25 索引缓存：user_id -> (文档数量, 缓存时间戳, retriever)
        # 知识库文档只增删不更新，用文档数量做失效校验即可；
        # 缓存命中时每次查询从"全量拉取重建"降为毫秒级 count 校验。
        self._bm25_cache: dict[str, tuple[int, float, object]] = {}
        self._bm25_lock = threading.Lock()

    async def get_bm25_retriever(self, user_id: str = None):
        """
        获取BM25检索器（带索引缓存，避免每次查询全量重建）
        :param user_id: 用户ID，必须提供，否则返回None
        :return: BM25Retriever实例
        """
        if not user_id:
            return None

        now = time.time()
        # 快速路径：TTL 内直接返回缓存（BM25 打分是只读操作，并发安全）
        with self._bm25_lock:
            cached = self._bm25_cache.get(user_id)
            if cached and now - cached[1] < _BM25_CACHE_TTL:
                return cached[2]

        # 慢路径：先用 Chroma count 校验文档数量是否变化（毫秒级，远快于全量拉取）
        try:
            count = await asyncio.to_thread(
                lambda: self.vectors_store._collection.count(where={"user_id": user_id})
            )
        except Exception:
            count = None  # count 失败则不信任缓存，走全量重建（保持原行为）

        with self._bm25_lock:
            cached = self._bm25_cache.get(user_id)
            if cached and count is not None and cached[0] == count:
                # 数量未变：刷新时间戳后复用，避免反复 count 后仍重建
                self._bm25_cache[user_id] = (count, now, cached[2])
                return cached[2]

        # 全量拉取重建索引
        all_docs_result = await asyncio.to_thread(
            self.vectors_store.get,
            include=['documents', 'metadatas'],
            where={'user_id': user_id}
        )
        documents = []
        for i, doc_content in enumerate(all_docs_result['documents']):
            metadata = all_docs_result['metadatas'][i] if i < len(all_docs_result['metadatas']) else {}
            documents.append(Document(page_content=doc_content, metadata=metadata))

        retriever = None
        if documents:
            retriever = BM25Retriever.from_documents(
                documents=documents,
                k=chroma_config['k']
            )

        with self._bm25_lock:
            self._bm25_cache[user_id] = (count, now, retriever)
        return retriever

    async def _get_all_documents(self) -> list[Document]:
        """
        获取向量库中的所有文档
        :return: 文档列表
        """
        all_docs = await asyncio.to_thread(
            self.vectors_store.get,
            include=['documents', 'metadatas']
        )
        documents = []
        for i, doc in enumerate(all_docs['documents']):
            metadata = all_docs['metadatas'][i] if i < len(all_docs['metadatas']) else {}
            documents.append(Document(page_content=doc, metadata=metadata))
        return documents

    async def get_retriever(self, query: str = None, user_id: str = None) -> BaseRetriever:
        """
        获取混合检索器（BM25 + 向量检索）
        :param query: 查询语句，用于动态调整权重
        :param user_id: 用户ID，用于过滤用户的文档，为空时不返回任何文档
        :return: EnsembleRetriever实例或单独的向量检索器
        """
        if not user_id:
            return EmptyRetriever()

        filter_dict = {'user_id': user_id}
        vector_retriever = self.vectors_store.as_retriever(
            search_type='similarity',
            search_kwargs={'k': chroma_config['k'], 'filter': filter_dict},
        )
        bm25_retriever = await self.get_bm25_retriever(user_id)

        if bm25_retriever:
            weights = await self.get_dynamic_weights(query)
            ensemble_retriever = EnsembleRetriever(
                retrievers=[vector_retriever, bm25_retriever],
                weights=weights
            )
            return ensemble_retriever
        else:
            return vector_retriever

    @staticmethod
    async def get_dynamic_weights(query: str = None):
        """
        根据查询动态调整权重
        :param query: 查询语句
        :return: 权重列表 [向量检索权重, BM25检索权重]
        """
        default_vector_weight = 0.5
        default_bm25_weight = 0.5

        if not query:
            return [default_vector_weight, default_bm25_weight]

        query_length = len(query)
        query_words = len(query.split())

        if query_length > 50:
            vector_weight = 0.7
            bm25_weight = 0.3
        elif query_length < 20:
            vector_weight = 0.3
            bm25_weight = 0.7
        else:
            vector_weight = default_vector_weight
            bm25_weight = default_bm25_weight

        if query_words > 0:
            word_density = query_words / query_length
            if word_density > 0.1:
                bm25_weight = min(bm25_weight + 0.1, 0.7)
                vector_weight = max(vector_weight - 0.1, 0.3)

        return [vector_weight, bm25_weight]
