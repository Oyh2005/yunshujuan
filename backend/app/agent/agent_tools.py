import datetime
from collections.abc import Callable
from contextvars import ContextVar

from langchain_core.tools import tool

from app.core.background_init import init_manager
from app.core.logger_handler import logger
from app.db.db_config import AsyncSessionLocal
from app.services.review_service import review_service
from app.utils.auth_utils import decode_django_jwt

current_user_id_var: ContextVar[str] = ContextVar('current_user_id', default=None)
thinking_callback_var: ContextVar[Callable | None] = ContextVar('thinking_callback', default=None)

def set_current_user_id(user_id: str):
    """设置当前用户ID到上下文"""
    current_user_id_var.set(user_id)

def get_current_user_id_from_context() -> str:
    """从上下文获取当前用户ID"""
    return current_user_id_var.get()

def set_thinking_callback(callback):
    """设置思考过程回调到上下文"""
    thinking_callback_var.set(callback)

def get_thinking_callback_from_context():
    """从上下文获取思考过程回调"""
    return thinking_callback_var.get()

@tool(description="当用户明确问自己的ID和用户名时，从JWT中获取当前用户ID和用户名，参数为完整的JWT token字符串")
async def get_user_info_tools(token: str) -> str:
    """获取用户信息工具"""
    payload = decode_django_jwt(token)
    if payload:
        user_id = payload.get("user_id", "未知")
        # 兼容两种 claim 命名：本应用 generate_token 签发的是 username，
        # 部分外部/旧 token 使用 user_name。
        user_name = payload.get("user_name") or payload.get("username") or "未知"
        return f"用户信息：\n- 用户ID: {user_id}\n- 用户名: {user_name}"
    else:
        return "无法解析JWT token，无法获取用户信息"

@tool(description="用于获取当前年月日时分的工具")
async def what_time_is_now() -> str:
    """获取当前年月日时分的工具"""
    return f"当前时间是：{datetime.datetime.now().strftime('%Y-%m-%d %H:%M')}"

@tool(description="语义搜索用户的笔记，根据关键词返回最相关的笔记列表。参数 query 为搜索关键词，top_k 为返回结果数量（默认5）。")
async def search_notes_tool(query: str, top_k: int = 5) -> str:
    """搜索笔记工具"""
    user_id = get_current_user_id_from_context()
    if not user_id:
        return "错误: 无法确定用户身份"
    async with AsyncSessionLocal() as db:
        try:
            results = await init_manager.note_service.search_notes(db, user_id, query, top_k=top_k)
            if not results:
                return "未找到相关笔记"
            lines = [f"找到 {len(results)} 篇相关笔记：\n"]
            for i, note in enumerate(results, 1):
                lines.append(f"{i}. **{note.title}**")
                if note.category:
                    lines.append(f"   分类: {note.category}")
                if note.tags:
                    lines.append(f"   标签: {', '.join(note.tags)}")
                lines.append(f"   内容预览: {note.content[:200]}...\n")
            return "\n".join(lines)
        except Exception as e:
            logger.error(f"搜索笔记失败: {e}")
            return f"搜索笔记时出错: {str(e)}"

@tool(description="获取用户的笔记统计信息（笔记总数、各分类数量）以及知识库文档总数。注意：笔记与知识库文档是两个独立的数据源，本工具返回的知识库文档数来自知识库模块。")
async def get_note_stats_tool() -> str:
    """笔记统计工具"""
    user_id = get_current_user_id_from_context()
    if not user_id:
        return "错误: 无法确定用户身份"
    async with AsyncSessionLocal() as db:
        try:
            stats = await init_manager.note_service.get_category_stats(db, user_id)
            lines = ["📊 笔记统计\n"]
            lines.append(f"总笔记数: {stats['total']}\n")
            lines.append("各分类:")
            for cat in stats['categories']:
                emoji = {'work': '💼', 'study': '📖', 'life': '🏠', 'project': '🚀'}.get(cat['category'], '📄')
                lines.append(f"  {emoji} {cat['category']}: {cat['count']} 篇")
            if stats['uncategorized'] > 0:
                lines.append(f"  📄 未分类: {stats['uncategorized']} 篇")

            # 附带知识库文档数（与笔记独立的另一数据源）
            try:
                from app.router.knowledge_service import KnowledgeService
                docs = await KnowledgeService().handle_get_user_knowledge(user_id)
                lines.append(f"\n📚 知识库文档数: {len(docs)} 份（上传的资料，与笔记不同源）")
            except Exception as e:
                logger.warning(f"获取知识库文档数失败: {e}")

            return "\n".join(lines)
        except Exception as e:
            logger.error(f"获取笔记统计失败: {e}")
            return f"获取笔记统计时出错: {str(e)}"

@tool(description="获取今日待回顾的笔记列表。返回每篇笔记的标题、内容预览和回顾次数，帮助用户进行间隔重复复习。")
async def get_today_reviews_tool() -> str:
    """获取今日回顾列表工具"""
    user_id = get_current_user_id_from_context()
    if not user_id:
        return "错误: 无法确定用户身份"
    async with AsyncSessionLocal() as db:
        try:
            reviews = await review_service.get_today_reviews(db, user_id)
            if not reviews:
                return "今日没有待回顾的笔记，继续保持！"
            lines = [f"📅 今日待回顾笔记（共 {len(reviews)} 篇）\n"]
            for i, rv in enumerate(reviews, 1):
                lines.append(f"{i}. **{rv['title']}**")
                lines.append(f"   回顾次数: 第 {rv['review_count'] + 1} 次")
                lines.append(f"   内容预览: {rv['content_preview'][:100]}...\n")
            return "\n".join(lines)
        except Exception as e:
            logger.error(f"获取今日回顾失败: {e}")
            return f"获取今日回顾时出错: {str(e)}"

@tool(description="标记一篇笔记为已回顾。参数 note_id 为笔记ID。调用成功后笔记的下次回顾时间会自动按艾宾浩斯遗忘曲线延后。")
async def mark_reviewed_tool(note_id: str) -> str:
    """标记回顾完成工具"""
    user_id = get_current_user_id_from_context()
    if not user_id:
        return "错误: 无法确定用户身份"
    async with AsyncSessionLocal() as db:
        try:
            result = await review_service.mark_reviewed(db, note_id, user_id)
            if result["success"]:
                return f"✅ 已标记回顾完成！第 {result['review_count']} 次回顾，下次回顾间隔 {result['interval_days']} 天。"
            else:
                return f"标记失败: {result['message']}"
        except Exception as e:
            logger.error(f"标记回顾失败: {e}")
            return f"标记回顾时出错: {str(e)}"

@tool(description=(
    "创建一篇新笔记。参数 title 为笔记标题，content 为笔记内容"
    "（支持Markdown格式，可选，不传则只创建标题）。"
    "创建后会自动生成向量索引和智能标签。"
))
async def create_note_tool(title: str, content: str = "") -> str:
    """创建笔记工具"""
    user_id = get_current_user_id_from_context()
    if not user_id:
        return "错误: 无法确定用户身份"
    from app.schemas.models import NoteCreate
    async with AsyncSessionLocal() as db:
        try:
            payload = NoteCreate(title=title, content=content)
            note = await init_manager.note_service.create_note(db, user_id, payload)
            return f"✅ 笔记创建成功！\n- 标题: {note.title}\n- ID: {note.id}\n- 标签和分类正在后台生成中..."
        except Exception as e:
            logger.error(f"创建笔记失败: {e}")
            return f"创建笔记时出错: {str(e)}"

@tool(description="获取某篇笔记的关联推荐，包括语义相似的笔记和知识库文档。参数 note_id 为笔记ID，top_k 为返回数量（默认3）。")
async def get_related_notes_tool(note_id: str, top_k: int = 3) -> str:
    """关联笔记推荐工具"""
    user_id = get_current_user_id_from_context()
    if not user_id:
        return "错误: 无法确定用户身份"
    async with AsyncSessionLocal() as db:
        try:
            related = await init_manager.note_service.get_related_notes(db, note_id, user_id, top_k=top_k)
            if not related:
                return "未找到关联笔记或知识库文档"
            lines = [f"🔗 关联推荐（共 {len(related)} 项）\n"]
            for i, item in enumerate(related, 1):
                source_label = "📝 笔记" if item['source'] == 'note' else "📚 知识库"
                lines.append(f"{i}. {source_label} — {item['title']}")
                lines.append(f"   相似度: {item['similarity']}")
                lines.append(f"   预览: {item['content_preview'][:100]}...\n")
            return "\n".join(lines)
        except Exception as e:
            logger.error(f"获取关联推荐失败: {e}")
            return f"获取关联推荐时出错: {str(e)}"

@tool(description=(
    "获取用户知识库（上传的资料文档）的文档列表。返回每个文档的文件名、切片数量和内容预览，"
    "用于了解知识库全貌。当用户要求「总结知识库」「知识库里有什么」「查看我的资料」时，"
    "必须先调用本工具获取文档列表，再对每个文档调用 get_knowledge_content_tool 获取内容进行总结。"
    "注意：知识库文档（上传的资料）与笔记（用户手写的笔记）是两个不同的数据源，总结时要分别覆盖。"
))
async def get_knowledge_docs_tool() -> str:
    """知识库文档列表工具"""
    user_id = get_current_user_id_from_context()
    if not user_id:
        return "错误: 无法确定用户身份"
    try:
        from app.router.knowledge_service import KnowledgeService
        documents = await KnowledgeService().handle_get_user_knowledge(user_id)
        if not documents:
            return "知识库中没有文档，暂无上传的资料。"
        lines = [f"📚 知识库文档列表（共 {len(documents)} 份）\n"]
        for i, doc in enumerate(documents, 1):
            lines.append(f"{i}. **{doc.get('filename', '未知')}**")
            lines.append(f"   切片数: {doc.get('chunk_count', 0)}")
            preview = doc.get('preview', '')
            if preview:
                lines.append(f"   内容预览: {preview[:100]}...")
            lines.append("")
        return "\n".join(lines)
    except Exception as e:
        logger.error(f"获取知识库文档列表失败: {e}")
        return f"获取知识库文档列表时出错: {str(e)}"

@tool(description=(
    "获取知识库中某份文档的具体内容（按切片返回）。参数 filename 为文档文件名"
    "（来自 get_knowledge_docs_tool 的列表），max_chunks 为返回的最大切片数（默认5，"
    "每片约200字）。如果文档切片数超过返回数量，会提示剩余切片数。"
    "用于总结某份知识库文档的内容、回答关于该文档的问题。"
))
async def get_knowledge_content_tool(filename: str, max_chunks: int = 5) -> str:
    """知识库文档内容工具"""
    user_id = get_current_user_id_from_context()
    if not user_id:
        return "错误: 无法确定用户身份"
    try:
        from app.router.knowledge_service import KnowledgeService
        result = await KnowledgeService().handle_get_document_chunks(user_id, filename)
        chunks = result.get('chunks', [])
        total = result.get('total_chunks', len(chunks))
        if not chunks:
            return f"文档《{filename}》不存在或没有内容。"
        lines = [f"📄 文档《{filename}》内容（共 {total} 个切片，返回前 {min(max_chunks, len(chunks))} 个）\n"]
        for chunk in chunks[:max_chunks]:
            content = (chunk.get('content') or '').strip()
            if content:
                lines.append(f"[切片 {chunk.get('index', 0)}]\n{content}\n")
        remaining = total - min(max_chunks, len(chunks))
        if remaining > 0:
            lines.append(f"（还有 {remaining} 个切片未返回，如需更多内容可再次调用并增大 max_chunks）")
        return "\n".join(lines)
    except Exception as e:
        logger.error(f"获取知识库文档内容失败: {e}")
        return f"获取文档《{filename}》内容时出错: {str(e)}"
