import hashlib
import os
from typing import Any

from dotenv import load_dotenv

from app.core.logger_handler import logger

# 加载环境变量
load_dotenv()


def find_model_path(base_path: str) -> str:
    if os.path.exists(os.path.join(base_path, 'config.json')):
        return base_path

    for root, dirs, files in os.walk(base_path):
        if 'config.json' in files:
            return root

    logger.info(f"✅ 模型路径：{base_path}")
    logger.info(f"✅ 模型路径：{root}")
    return base_path


def _model_files_complete(base_path: str) -> bool:
    """模型目录是否完整：存在 config.json 且包含 model_type 字段。"""
    if not os.path.isdir(base_path):
        return False
    for root, _dirs, files in os.walk(base_path):
        if 'config.json' in files:
            try:
                import json as _json
                with open(os.path.join(root, 'config.json'), 'r', encoding='utf-8') as f:
                    cfg = _json.load(f)
                if isinstance(cfg, dict) and cfg.get('model_type'):
                    return True
            except Exception:
                continue
    return False


def check_and_download_reranker_model() -> None:
    """检查并重排序模型，在FastAPI启动时执行"""
    from modelscope import snapshot_download
    from tqdm import tqdm

    LOCAL_MODEL_PATH = os.getenv("RERANKER_MODEL_PATH", r"D:\Hugging_Face\models\bge-reranker-v2-m3")
    MODELSCOPE_MODEL_NAME = "BAAI/bge-reranker-v2-m3"

    try:
        if _model_files_complete(LOCAL_MODEL_PATH):
            logger.info(f"✅ 检测到本地重排序模型：{LOCAL_MODEL_PATH}")
        else:
            if os.path.isdir(LOCAL_MODEL_PATH):
                logger.warning(f"⚠️  本地模型目录存在但文件不完整（缺少 config.json 或 model_type）：{LOCAL_MODEL_PATH}")
                logger.warning("🔄 将重新从魔搭社区下载完整模型（建议先手动删除该目录）")
            else:
                logger.warning(f"⚠️  本地模型未找到：{LOCAL_MODEL_PATH}")
                logger.info(f"🔄 开始从魔搭社区下载模型：{MODELSCOPE_MODEL_NAME}")

            os.makedirs(LOCAL_MODEL_PATH, exist_ok=True)

            with tqdm(total=100, desc='下载模型', leave=True, bar_format='{l_bar}{bar}| {n_fmt}%') as pbar:
                pbar.update(10)
                snapshot_download(
                    model_id=MODELSCOPE_MODEL_NAME,
                    cache_dir=LOCAL_MODEL_PATH,
                    revision='master'
                )
                pbar.update(90)

            logger.info(f"✅ 模型下载完成，保存路径：{LOCAL_MODEL_PATH}")

    except Exception as e:
        logger.error(f"❌ 模型检查失败: {str(e)}")
        raise RuntimeError(f"重排序模型检查失败: {str(e)}")


class ReorderService:
    """文档重排序服务"""

    def __init__(self):
        import torch

        self.LOCAL_MODEL_PATH = os.getenv("RERANKER_MODEL_PATH", r"D:\Hugging_Face\models\bge-reranker-v2-m3")
        self.MODELSCOPE_MODEL_NAME = "BAAI/bge-reranker-v2-m3"
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self._model = None

    async def _get_model(self):
        """懒加载模型实例"""
        from sentence_transformers import CrossEncoder

        if self._model is None:
            actual_model_path = find_model_path(self.LOCAL_MODEL_PATH)
            logger.info(f"✅ 加载重排序模型：{actual_model_path}")
            self._model = CrossEncoder(
                actual_model_path,
                max_length=512,
                device=self.device,
                local_files_only=True
            )
            self._model.eval()
            logger.info(f"✅ 模型加载成功，使用设备：{self.device}")
        return self._model

    @property
    async def model(self):
        """获取模型实例（懒加载）"""
        return await self._get_model()

    async def reorder_documents(self, query: str, documents: list[str], thinking_callback=None) -> dict[str, Any]:
        """
        对文档进行重排序
        :param query: 查询语句
        :param documents: 文档列表
        :param thinking_callback: 思考过程回调函数
        :return: 包含重排序结果的字典，格式为：
                 {"success": bool, "documents": List[Dict], "error": str}
        """
        try:
            if not documents:
                return {
                    "success": True,
                    "documents": [],
                    "error": ""
                }

            # 重排序结果缓存：相同 query + 文档集直接命中（CPU 推理是热点，TTL 10 分钟）
            from app.db.redis_config import get_redis_cache_json, set_redis_cache
            cache_key = "rerank:" + hashlib.md5(
                (query + "\x00" + "\x01".join(documents)).encode("utf-8")
            ).hexdigest()
            cached = await get_redis_cache_json(cache_key)
            if cached is not None and cached.get("success"):
                logger.debug(f"【重排序服务】缓存命中：{len(cached['documents'])} 个文档")
                return cached

            if thinking_callback:
                await thinking_callback({
                    "type": "thinking",
                    "stage": "reorder",
                    "content": f"正在计算 {len(documents)} 个文档的相关性分数..."
                })

            # 构造查询+文档对
            pairs = [(query, doc) for doc in documents]

            # 批量预测（batch_size=8：CrossEncoder 内部按批次 padding，比逐条推理快数倍）
            model = await self.model
            # 禁用梯度计算，提高推理性能
            import torch
            with torch.no_grad():
                scores = model.predict(pairs, batch_size=8)

            # 构建结果列表
            scored_documents = []
            for doc, score in zip(documents, scores):
                scored_documents.append({
                    "document": doc,
                    "similarity": float(score)
                })
                logger.info(f"【重排序服务】文档相似度分数: {score:.4f}")

            if thinking_callback:
                score_details = []
                for i, (doc, score) in enumerate(zip(documents, scores), 1):
                    score_details.append({
                        "index": i,
                        "score": round(float(score), 4),
                        "preview": doc[:100] + "..." if len(doc) > 100 else doc
                    })
                await thinking_callback({
                    "type": "thinking",
                    "stage": "reorder",
                    "content": f"已计算完成 {len(documents)} 个文档的相关性分数，按分数降序排序",
                    "details": {
                        "scores": score_details
                    }
                })

            # 按相似度分数降序排序
            sorted_docs = sorted(scored_documents, key=lambda x: x["similarity"], reverse=True)
            logger.info(f"【重排序服务】文档重排序成功，返回 {len(sorted_docs)} 个文档")

            result = {
                "success": True,
                "documents": sorted_docs,
                "error": ""
            }
            # Redis 不可用时 set_redis_cache 自动降级，不影响主流程
            await set_redis_cache(cache_key, result, expire=600)
            return result
        except Exception as e:
            error_msg = str(e)
            logger.error(f"【重排序服务】重排序失败: {error_msg}")
            return {
                "success": False,
                "documents": [],
                "error": error_msg
            }

    @staticmethod
    async def format_reorder_result(sorted_docs: list[dict]) -> str:
        """
        格式化重排序结果
        :param sorted_docs: 重排序后的文档列表
        :return: 格式化后的字符串
        """
        formatted_result = "重排序后的文档列表：\n"
        for i, doc in enumerate(sorted_docs, 1):
            formatted_result += f"{i}. 相似度: {doc.get('similarity', 0):.4f}\n"
            formatted_result += f"   内容: {doc.get('document', '')}\n\n"
        return formatted_result


# 全局重排序服务实例
reorder_service = ReorderService()
