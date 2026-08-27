import asyncio
import time

from app.core.logger_handler import logger


class _BackgroundInitManager:
    """后台初始化管理器

    在 FastAPI 启动后通过 start() 在后台异步初始化所有重型资源，
    避免模块级导入阻塞 uvicorn 启动。
    每个组件初始化完成后设置对应的 Event。
    """

    def __init__(self):
        self._started = False
        self._start_time = 0.0
        # 持有后台初始化任务的引用，防止被垃圾回收（未持有引用的 Task 可能被 GC 取消）
        self._init_task: asyncio.Task | None = None

        # 各组件的初始化状态事件
        self.models_ready = asyncio.Event()
        self.note_service_ready = asyncio.Event()
        self.reranker_ready = asyncio.Event()

        # 初始化后的实例（初始化完成前为 None）
        self.chat_model = None
        self.embed_model = None
        self.vision_model = None
        self.note_service = None
        self.reorder_service = None

    async def start(self):
        """启动后台初始化（不阻塞主事件循环）"""
        if self._started:
            return
        self._started = True
        self._start_time = time.time()
        self._init_task = asyncio.create_task(self._initialize_all())

    async def _initialize_all(self):
        """后台执行所有重型初始化"""
        try:
            logger.info("🔄 开始后台初始化...")

            # 1. AI 模型与重排序并行加载（互不依赖，减少启动耗时；
            #    reranker 失败不影响模型初始化，反之亦然）
            results = await asyncio.gather(
                self._init_models(),
                self._init_reranker(),
                return_exceptions=True,
            )
            for r in results:
                if isinstance(r, BaseException):
                    logger.error(f"后台初始化子任务失败: {r}", exc_info=r)

            # 2. ChromaDB（NoteService，依赖 embed_model）
            await self._init_note_service()

            elapsed = time.time() - self._start_time
            logger.info(f"✅ 后台初始化完成，耗时 {elapsed:.1f} 秒")

        except Exception as e:
            logger.error(f"❌ 后台初始化失败: {e}", exc_info=True)

    async def _init_models(self):
        """初始化 AI 模型（三件套并行；任一失败不阻塞其余初始化）"""
        from app.utils.factory import ChatModelFactory, EmbedModelFactory, VisionModelFactory

        async def _safe_init(name: str, factory):
            try:
                model = await asyncio.to_thread(lambda: factory.generator())
                logger.info(f"✅ {name} 初始化完成")
                return model
            except Exception as e:
                logger.error(f"❌ {name} 初始化失败: {e}", exc_info=True)
                return None

        chat_model, embed_model, vision_model = await asyncio.gather(
            _safe_init("chat_model", ChatModelFactory()),
            _safe_init("embed_model", EmbedModelFactory()),
            _safe_init("vision_model", VisionModelFactory()),
        )
        self.chat_model = chat_model
        self.embed_model = embed_model
        self.vision_model = vision_model

        # 无论成败都置位，避免依赖方（note_service）永久挂起
        self.models_ready.set()

    async def _init_note_service(self):
        """初始化 NoteService（ChromaDB，依赖 embed_model）"""
        await self.models_ready.wait()

        if self.embed_model is None:
            logger.error("❌ embed_model 初始化失败，跳过 NoteService（ChromaDB）初始化")
            return

        from app.services.note_service import NoteService

        self.note_service = await asyncio.to_thread(
            lambda: NoteService(embed_model=self.embed_model)
        )
        logger.info("✅ NoteService（ChromaDB）初始化完成")
        self.note_service_ready.set()

    async def _init_reranker(self):
        """检查并初始化重排序模型（触发 torch 等重型框架加载）"""
        from app.rag.reorder_service import ReorderService, check_and_download_reranker_model

        await asyncio.to_thread(check_and_download_reranker_model)
        logger.info("✅ 重排序模型检查完成")

        self.reorder_service = ReorderService()
        logger.info("✅ ReorderService 初始化完成")
        self.reranker_ready.set()


# 全局单例
init_manager = _BackgroundInitManager()
