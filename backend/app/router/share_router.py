"""
公开分享路由 —— 免鉴权只读访问已公开的笔记。

- `/share/{note_id}`：公开分享页 URL（浏览器直接访问，SPA 渲染该页面）
- `/public/note/{note_id}`：分享页数据 API 别名（vite 代理走 /public，避免与 SPA 路由 /share/:id 冲突）

隐私红线：仅 is_public=True 的笔记可被访问，其余一律 404（不泄露是否存在）。
访问时浏览计数 view_count +1（由 get_db 在请求结束时统一 commit）。
"""

from fastapi import Depends, HTTPException
from fastapi.routing import APIRouter
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.db_config import get_db
from app.models.note import Note

share_router = APIRouter(prefix="/share", tags=["share"])
public_router = APIRouter(prefix="/public", tags=["share"])


async def _fetch_public_note(db: AsyncSession, note_id: str) -> dict:
    """查询公开笔记并递增浏览计数（共用逻辑）。"""
    stmt = select(Note).where(
        Note.id == note_id,
        Note.is_public.is_(True),
    )
    result = await db.execute(stmt)
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="笔记不存在或未公开")

    # 浏览计数 +1（更新并刷新 ORM 对象，保证响应值准确）
    await db.execute(
        update(Note)
        .where(Note.id == note_id)
        .values(view_count=Note.view_count + 1)
    )
    await db.refresh(note)

    return {
        "title": note.title,
        "content": note.content,
        "tags": note.tags or [],
        "category": note.category,
        "created_at": str(note.created_at) if note.created_at else None,
        "updated_at": str(note.updated_at) if note.updated_at else None,
        "view_count": note.view_count or 0,
    }


@share_router.get("/{note_id}")
async def get_public_note(
    note_id: str,
    db: AsyncSession = Depends(get_db),
):
    """获取公开笔记（免鉴权，无登录态）。浏览计数 +1。"""
    return await _fetch_public_note(db, note_id)


@public_router.get("/note/{note_id}")
async def get_public_note_api(
    note_id: str,
    db: AsyncSession = Depends(get_db),
):
    """公开笔记数据 API（前端分享页数据源，经 /public 代理）。"""
    return await _fetch_public_note(db, note_id)
