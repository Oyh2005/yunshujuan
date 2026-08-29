import asyncio

from sqlalchemy import func, select

from app.core.logger_handler import logger
from app.db.db_config import AsyncSessionLocal
from app.models.chat_history import ChatMessage, ChatSession

# 单次加载的最大消息条数（30 轮对话）：防止超长会话全量加载拖慢请求并撑爆 LLM 上下文
MAX_HISTORY_MESSAGES = 60


class DatabaseSessionManager:
    """基于数据库的会话管理器"""

    def __init__(self):
        """初始化会话管理器"""
        self._lock = asyncio.Lock()

    @classmethod
    async def create(cls) -> "DatabaseSessionManager":
        """
        异步创建并初始化 DatabaseSessionManager
        :return: 初始化完成的 DatabaseSessionManager 实例
        """
        instance = cls()
        logger.info("【数据库会话管理】初始化完成")
        return instance

    async def get_session(self, session_id: str, user_id: str) -> dict:
        """获取会话"""
        async with AsyncSessionLocal() as db:
            # 尝试查找会话，验证属于该用户
            result = await db.run_sync(
                lambda session: session.query(ChatSession).filter(ChatSession.id == session_id, ChatSession.user_id == user_id).first()
            )

            if result:
                # 获取会话历史（只取最近 MAX_HISTORY_MESSAGES 条）：
                # 子查询按时间倒序取最近 N 条 id（同秒用 id 兜底保证稳定），
                # 外层再按时间正序返回，保持 user/assistant 配对顺序不变。
                subq = (
                    select(ChatMessage.id)
                    .where(ChatMessage.session_id == result.id)
                    .order_by(ChatMessage.created_at.desc(), ChatMessage.id.desc())
                    .limit(MAX_HISTORY_MESSAGES)
                    .subquery()
                )
                messages = await db.run_sync(
                    lambda session: session.query(ChatMessage)
                    .filter(ChatMessage.id.in_(select(subq.c.id)))
                    .order_by(ChatMessage.created_at.asc(), ChatMessage.id.asc())
                    .all()
                )
                # 转换为 (user_message, assistant_message) 格式
                history = []
                i = 0
                while i < len(messages):
                    if messages[i].role == "user" and i + 1 < len(messages) and messages[i+1].role == "assistant":
                        history.append((messages[i].content, messages[i+1].content))
                        i += 2
                    else:
                        i += 1
                return {"history": history}
            else:
                # 检查会话id是否存在
                existing_session = await db.run_sync(
                    lambda session: session.query(ChatSession).filter(ChatSession.id == session_id).first()
                )

                if existing_session:
                    # 会话存在但不属于当前用户
                    logger.warning(f"【数据库会话管理】会话 {session_id} 不属于用户 {user_id}")
                    from fastapi import HTTPException, status
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="当前会话不属于你"
                    )
                else:
                    # 会话不存在，创建一个新的
                    new_session = ChatSession(
                        id=session_id,
                        user_id=user_id,
                        title="新的对话"
                    )
                    db.add(new_session)
                    await db.commit()
                    await db.refresh(new_session)
                    logger.info(f"【数据库会话管理】创建新会话: {session_id} 属于用户: {user_id}")
                    return {"history": []}

    async def add_message(self, session_id: str, user_id: str, user_message: str, assistant_message: str):
        """添加消息并保存到数据库"""
        async with AsyncSessionLocal() as db:
            # 检查会话id是否存在
            existing_session = await db.run_sync(
                lambda session: session.query(ChatSession).filter(ChatSession.id == session_id).first()
            )

            if existing_session:
                # 检查会话是否属于当前用户
                if existing_session.user_id != user_id:
                    # 会话存在但不属于当前用户，不添加消息
                    logger.warning(f"【数据库会话管理】会话 {session_id} 不属于用户 {user_id}，无法添加消息")
                    from fastapi import HTTPException, status
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="当前会话不属于你，无法添加消息"
                    )
                session = existing_session
            else:
                # 会话不存在，创建一个新的
                session = ChatSession(
                    id=session_id,
                    user_id=user_id,
                    title="新的对话"
                )
                db.add(session)
                await db.commit()
                await db.refresh(session)

            # 检查是否是新会话且标题为默认值，如果是则更新为用户的第一个问题
            if session.title == "新的对话":
                # 生成用户问题的摘要作为标题（截取前30个字符）
                title_summary = user_message[:30].strip()
                if len(user_message) > 30:
                    title_summary += "..."
                session.title = title_summary

            # 添加用户消息
            user_msg = ChatMessage(
                session_id=session.id,
                role="user",
                content=user_message
            )
            db.add(user_msg)

            # 添加助手消息
            assistant_msg = ChatMessage(
                session_id=session.id,
                role="assistant",
                content=assistant_message
            )
            db.add(assistant_msg)

            await db.commit()
            logger.info(f"【数据库会话管理】添加消息到会话: {session_id} 属于用户: {user_id}")
            # 会话列表 HTTP 缓存版本号递增（新会话/新消息都算列表变化）
            from app.core.http_cache import bump_domain_version
            await bump_domain_version("chat", user_id)

    async def get_history(self, session_id: str, user_id: str) -> list[tuple[str, str]]:
        """获取会话历史"""
        session_data = await self.get_session(session_id, user_id)
        return session_data.get("history", [])

    async def clear_session(self, session_id: str, user_id: str):
        """清除会话"""
        async with AsyncSessionLocal() as db:
            # 查找会话，验证属于该用户
            session = await db.run_sync(
                lambda session: session.query(ChatSession).filter(ChatSession.id == session_id, ChatSession.user_id == user_id).first()
            )

            if session:
                # 删除会话（级联删除消息）
                await db.delete(session)
                await db.commit()
                logger.info(f"【数据库会话管理】会话 {session_id} 已清除，属于用户: {user_id}")
                from app.core.http_cache import bump_domain_version
                await bump_domain_version("chat", user_id)

    async def get_all_session_ids(self, user_id: str | None = None) -> list[str]:
        """获取所有会话 ID，如果提供了 user_id，则只返回该用户的会话"""
        async with AsyncSessionLocal() as db:
            if user_id:
                sessions = await db.run_sync(
                    lambda session: session.query(ChatSession).filter(ChatSession.user_id == user_id).all()
                )
            else:
                sessions = await db.run_sync(
                    lambda session: session.query(ChatSession).all()
                )
            return [session.id for session in sessions]

    async def get_user_sessions(self, user_id: str) -> list[dict]:
        """获取用户所有会话详细信息：置顶优先（置顶组内按置顶时间降序），其余按更新时间降序"""
        async with AsyncSessionLocal() as db:
            sessions = await db.run_sync(
                lambda session: session.query(ChatSession)
                .filter(ChatSession.user_id == user_id)
                .all()
            )
            # 排序：置顶的在前（pinned_at 越新越前），非置顶按 updated_at 降序
            sessions.sort(key=lambda s: (
                not s.is_pinned,
                -(s.pinned_at.timestamp() if s.pinned_at else 0),
                -(s.updated_at.timestamp() if s.updated_at else 0),
            ))
            return [
                {
                    "id": session.id,
                    # 展示名：自定义名称优先，回退自动标题
                    "title": session.custom_title or session.title,
                    "custom_title": session.custom_title,
                    "is_pinned": session.is_pinned,
                    "pinned_at": session.pinned_at.isoformat() if session.pinned_at else None,
                    "created_at": session.created_at.isoformat() if session.created_at else None,
                    "updated_at": session.updated_at.isoformat() if session.updated_at else None
                }
                for session in sessions
            ]

    async def rename_session(self, session_id: str, user_id: str, title: str | None) -> dict:
        """重命名会话：写入 custom_title；传 None 或空字符串 = 清除自定义名称（回退自动标题）
        :return: {"custom_title": ..., "title": 展示名}
        """
        async with AsyncSessionLocal() as db:
            session = await db.run_sync(
                lambda s: s.query(ChatSession).filter(ChatSession.id == session_id, ChatSession.user_id == user_id).first()
            )
            if not session:
                from fastapi import HTTPException, status
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="会话不存在或不属于你")
            session.custom_title = (title or "").strip()[:255] or None
            await db.commit()
            logger.info(f"【数据库会话管理】重命名会话: {session_id} 属于用户: {user_id} -> {session.custom_title!r}")
            from app.core.http_cache import bump_domain_version
            await bump_domain_version("chat", user_id)
            return {
                "custom_title": session.custom_title,
                "title": session.custom_title or session.title,
            }

    async def set_session_pinned(self, session_id: str, user_id: str, is_pinned: bool):
        """置顶/取消置顶会话"""
        async with AsyncSessionLocal() as db:
            session = await db.run_sync(
                lambda s: s.query(ChatSession).filter(ChatSession.id == session_id, ChatSession.user_id == user_id).first()
            )
            if not session:
                from fastapi import HTTPException, status
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="会话不存在或不属于你")
            session.is_pinned = is_pinned
            session.pinned_at = func.now() if is_pinned else None
            await db.commit()
            await db.refresh(session)
            logger.info(f"【数据库会话管理】置顶状态: {session_id} 属于用户: {user_id} -> {is_pinned}")
            from app.core.http_cache import bump_domain_version
            await bump_domain_version("chat", user_id)
            return {
                "id": session.id,
                "is_pinned": session.is_pinned,
                "pinned_at": session.pinned_at.isoformat() if session.pinned_at else None,
            }


# 全局数据库会话管理器实例
database_session_manager = None

# 初始化数据库会话管理器
async def init_database_session_manager():
    """
    初始化数据库会话管理器
    :return: 初始化完成的 DatabaseSessionManager 实例
    """
    global database_session_manager
    database_session_manager = await DatabaseSessionManager.create()
    return database_session_manager
