"""
社交模块路由 —— 用户搜索 / 好友申请 / 动态流 / 点赞评论 / 站内通知（方向 B）。

所有接口通过 get_current_user_id 做用户隔离；
动态时间线 = 自己 + 已接受好友的动态（朋友圈语义）；
内容审核：本地敏感词即时拦截（零延迟）+ LLM 异步复核（方向 C 三期，rejected 内容对他人隐藏）。
"""

import asyncio
import json
import uuid
from datetime import datetime

from fastapi import Body, Depends, HTTPException, Query
from fastapi.routing import APIRouter
from pydantic import BaseModel, Field
from sqlalchemy import and_, delete, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logger_handler import logger
from app.core.rate_limit import rate_limit
from app.core.success_response import success_response
from app.db.db_config import AsyncSessionLocal, get_db
from app.models.note import Note
from app.models.review_record import ReviewRecord
from app.models.social import (
    ChatConversation,
    ChatConversationSetting,
    Follow,
    FriendRequest,
    Notification,
    Post,
    PostComment,
    PostLike,
    PrivateMessage,
)
from app.models.user_model import User
from app.utils.auth_utils import get_current_user_id

social_router = APIRouter(prefix="/social", tags=["social"])

# ── 轻量内容审核：本地敏感词（即时拦截，零延迟）──
SENSITIVE_WORDS = [
    "赌博", "博彩", "赌场", "代开发票", "刷单", "裸聊", "色情", "卖淫",
    "枪支", "弹药", "毒品", "冰毒", "海洛因", "传销", "诈骗", "洗钱", "外挂", "博彩网站",
]


def _assert_clean(text: str):
    """发布/评论前校验：命中敏感词直接 400。"""
    hits = [w for w in SENSITIVE_WORDS if w in (text or "")]
    if hits:
        raise HTTPException(status_code=400, detail=f"内容包含敏感词：{'、'.join(hits)}")


# 后台任务持有引用，防止被 GC 回收
_BACKGROUND_TASKS: set[asyncio.Task] = set()


def _parse_llm_json(raw: str) -> dict | None:
    """从 LLM 输出中提取 JSON（容忍代码块与前后文本）。"""
    text = raw.strip()
    if "```json" in text:
        text = text.split("```json")[1].split("```")[0].strip()
    elif "```" in text:
        text = text.split("```")[1].split("```")[0].strip()
    brace = text.find("{")
    if brace >= 0:
        text = text[brace:]
    try:
        return json.loads(text)
    except Exception:
        return None


async def _async_review_post(post_id: int, content: str):
    """异步 LLM 审核动态：通过→passed，违规→rejected；失败保持 pending（不误杀）。"""
    try:
        from langchain_core.messages import HumanMessage

        from app.core.background_init import init_manager
        from app.utils.prompt_loader import load_prompt

        await init_manager.models_ready.wait()
        prompt = load_prompt("content_review_prompt").replace("{content}", content[:1000])
        resp = await init_manager.chat_model.ainvoke([HumanMessage(content=prompt)])
        data = _parse_llm_json(resp.content)
        if data is None:
            logger.warning(f"动态 {post_id} 审核输出解析失败，保持 pending")
            return
        passed = bool(data.get("pass", True))
        async with AsyncSessionLocal() as db:
            await db.execute(
                update(Post).where(Post.id == post_id).values(
                    review_status="passed" if passed else "rejected"
                )
            )
            await db.commit()
        logger.info(f"动态 {post_id} 审核完成: {'通过' if passed else '拒绝'}")
    except Exception as e:
        logger.warning(f"动态 {post_id} 审核失败（保持 pending）: {e}")


async def _async_review_comment(comment_id: str, content: str):
    """异步 LLM 审核评论：rejected 评论对所有人隐藏。"""
    try:
        from langchain_core.messages import HumanMessage

        from app.core.background_init import init_manager
        from app.utils.prompt_loader import load_prompt

        await init_manager.models_ready.wait()
        prompt = load_prompt("content_review_prompt").replace("{content}", content[:500])
        resp = await init_manager.chat_model.ainvoke([HumanMessage(content=prompt)])
        data = _parse_llm_json(resp.content)
        if data is None:
            return
        passed = bool(data.get("pass", True))
        async with AsyncSessionLocal() as db:
            await db.execute(
                update(PostComment).where(PostComment.id == comment_id).values(
                    review_status="passed" if passed else "rejected"
                )
            )
            await db.commit()
    except Exception as e:
        logger.warning(f"评论 {comment_id} 审核失败（保持 pending）: {e}")


def _spawn(task: asyncio.Task):
    """持有后台任务引用防 GC。"""
    _BACKGROUND_TASKS.add(task)
    task.add_done_callback(_BACKGROUND_TASKS.discard)


async def _get_user_brief(db: AsyncSession, user_id: str) -> dict | None:
    result = await db.execute(select(User).where(User.uuid == user_id))
    u = result.scalar_one_or_none()
    if not u:
        return None
    return {"user_id": u.uuid, "username": u.username, "avatar": u.avatar, "bio": u.bio}


async def _get_user_briefs(db: AsyncSession, user_ids: list[str]) -> list[dict]:
    """批量获取用户简要信息（单次 IN 查询，避免 N+1）。"""
    if not user_ids:
        return []
    result = await db.execute(select(User).where(User.uuid.in_(user_ids)))
    by_id = {u.uuid: u for u in result.scalars().all()}
    briefs = []
    for uid in user_ids:
        u = by_id.get(uid)
        if u:
            briefs.append({"user_id": u.uuid, "username": u.username, "avatar": u.avatar, "bio": u.bio})
    return briefs


async def _friend_ids(db: AsyncSession, user_id: str) -> set[str]:
    """已接受好友的用户 id 集合（双向 accepted 记录）。"""
    r1 = await db.execute(
        select(FriendRequest.friend_id).where(
            FriendRequest.user_id == user_id,
            FriendRequest.status == "accepted",
        )
    )
    r2 = await db.execute(
        select(FriendRequest.user_id).where(
            FriendRequest.friend_id == user_id,
            FriendRequest.status == "accepted",
        )
    )
    return {row[0] for row in r1} | {row[0] for row in r2}


async def _notify(
    db: AsyncSession,
    user_id: str,
    actor_id: str,
    type_: str,
    post_id: int | None = None,
    content: str | None = None,
):
    """写入一条站内通知（同一事务，随外层 commit 提交）。"""
    db.add(Notification(
        id=str(uuid.uuid4()),
        user_id=user_id,
        actor_id=actor_id,
        type=type_,
        post_id=post_id,
        content=content,
    ))


async def _posts_with_meta(db: AsyncSession, posts: list[Post], current_user_id: str) -> list[dict]:
    """为动态列表批量补充：作者信息 / 点赞数 / 我是否赞过 / 评论数 / 引用笔记标题。"""
    if not posts:
        return []
    post_ids = [p.id for p in posts]

    authors: dict[str, dict] = {}
    author_ids = {p.user_id for p in posts}
    if author_ids:
        rows = await db.execute(select(User).where(User.uuid.in_(author_ids)))
        for u in rows.scalars().all():
            authors[u.uuid] = {"user_id": u.uuid, "username": u.username, "avatar": u.avatar}

    like_counts: dict[int, int] = {}
    if post_ids:
        rows = await db.execute(
            select(PostLike.post_id, func.count(PostLike.id))
            .where(PostLike.post_id.in_(post_ids))
            .group_by(PostLike.post_id)
        )
        like_counts = {r[0]: int(r[1]) for r in rows}

    liked_by_me: set[int] = set()
    if post_ids:
        rows = await db.execute(
            select(PostLike.post_id).where(
                PostLike.post_id.in_(post_ids),
                PostLike.user_id == current_user_id,
            )
        )
        liked_by_me = {r[0] for r in rows}

    comment_counts: dict[int, int] = {}
    if post_ids:
        rows = await db.execute(
            select(PostComment.post_id, func.count(PostComment.id))
            .where(PostComment.post_id.in_(post_ids))
            .group_by(PostComment.post_id)
        )
        comment_counts = {r[0]: int(r[1]) for r in rows}

    note_titles: dict[str, str] = {}
    note_ids = {p.note_id for p in posts if p.note_id}
    if note_ids:
        rows = await db.execute(select(Note.id, Note.title).where(Note.id.in_(note_ids)))
        note_titles = {r[0]: r[1] for r in rows}

    return [
        {
            "id": p.id,
            "user_id": p.user_id,
            "author": authors.get(p.user_id, {"user_id": p.user_id, "username": "未知用户", "avatar": None}),
            "content": p.content,
            "images": p.images or [],
            "note_id": p.note_id,
            "note_title": note_titles.get(p.note_id),
            "like_count": like_counts.get(p.id, 0),
            "liked_by_me": p.id in liked_by_me,
            "comment_count": comment_counts.get(p.id, 0),
            "review_status": p.review_status or "pending",
            "created_at": str(p.created_at) if p.created_at else None,
        }
        for p in posts
    ]


async def _get_visible_post(db: AsyncSession, post_id: int, user_id: str) -> Post:
    """获取动态并校验可见性（自己 + 好友；他人不可见 rejected 审核内容），不可见一律 404。"""
    result = await db.execute(select(Post).where(Post.id == post_id))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="动态不存在")
    friend_ids = await _friend_ids(db, user_id)
    if post.user_id != user_id and post.user_id not in friend_ids:
        raise HTTPException(status_code=404, detail="动态不存在")
    # 他人视角：审核未通过的内容不展示（作者自己可见，便于删除）
    if post.review_status == "rejected" and post.user_id != user_id:
        raise HTTPException(status_code=404, detail="动态不存在")
    return post


# ═══════════════════════════════════════════════════════════
# 知识广场（方向 C 一期）：公开笔记流
# ═══════════════════════════════════════════════════════════

@social_router.get("/plaza")
async def plaza_notes(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """
    知识广场：所有用户公开分享的笔记（is_public=True），按更新时间倒序。
    点击条目跳转公开分享页 /share/{id}。单机量级用 offset 分页即可。
    Redis 缓存 60 秒（方向 D 阶段一；Redis 不可用时自动降级直查）。
    """
    from app.db.redis_config import get_redis_cache_json, set_redis_cache

    cache_key = f"social:plaza:{page}:{page_size}"
    cached = await get_redis_cache_json(cache_key)
    if cached is not None:
        return success_response(data=cached)

    base = select(Note).where(Note.is_public.is_(True))

    count_stmt = select(func.count(Note.id)).where(Note.is_public.is_(True))
    total = int((await db.execute(count_stmt)).scalar() or 0)

    stmt = (
        select(Note, User.username, User.avatar)
        .join(User, User.uuid == Note.user_id)
        .where(Note.is_public.is_(True))
        .order_by(Note.updated_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = (await db.execute(stmt)).all()

    items = [
        {
            "id": n.id,
            "title": n.title,
            "content_preview": (n.content or "")[:200],
            "category": n.category,
            "tags": n.tags or [],
            "author": {"user_id": n.user_id, "username": username, "avatar": avatar},
            "view_count": n.view_count or 0,
            "updated_at": str(n.updated_at) if n.updated_at else None,
        }
        for n, username, avatar in rows
    ]
    payload = {
        "notes": items,
        "total": total,
        "has_more": page * page_size < total,
    }
    await set_redis_cache(cache_key, payload, expire=60)
    return success_response(data=payload)


# ═══════════════════════════════════════════════════════════
# 用户搜索
# ═══════════════════════════════════════════════════════════

@social_router.get("/users/search")
async def search_users(
    q: str = Query(..., min_length=1, max_length=50),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """按用户名/邮箱模糊搜索用户（排除自己）。"""
    stmt = (
        select(User)
        .where(
            User.uuid != user_id,
            or_(User.username.like(f"%{q}%"), User.email.like(f"%{q}%")),
        )
        .limit(10)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return success_response(data=[
        {"user_id": u.uuid, "username": u.username, "avatar": u.avatar, "bio": u.bio}
        for u in rows
    ])


# ═══════════════════════════════════════════════════════════
# 好友
# ═══════════════════════════════════════════════════════════

@social_router.get("/friends/list")
async def friend_list(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """好友列表（已接受）。"""
    ids = await _friend_ids(db, user_id)
    return success_response(data=await _get_user_briefs(db, list(ids)))


@social_router.get("/friends/requests")
async def friend_requests(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """我收到的待处理好友申请（含申请人 bio，前端详情展示）。"""
    stmt = (
        select(FriendRequest, User.username, User.avatar, User.bio)
        .join(User, User.uuid == FriendRequest.user_id)
        .where(FriendRequest.friend_id == user_id, FriendRequest.status == "pending")
        .order_by(FriendRequest.created_at.desc())
    )
    rows = (await db.execute(stmt)).all()
    return success_response(data=[
        {
            "request_id": r[0].id,
            "user_id": r[0].user_id,
            "username": r[1],
            "avatar": r[2],
            "bio": r[3],
            "created_at": str(r[0].created_at) if r[0].created_at else None,
        }
        for r in rows
    ])


class FriendRequestIn(BaseModel):
    """发送好友申请请求模型"""
    user_id: str


@social_router.post("/friends/request")
async def send_friend_request(
    payload: FriendRequestIn,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(rate_limit(limit=120, window=60)),
):
    """发送好友申请（自动给接收方创建通知）。"""
    target = payload.user_id.strip()
    if target == user_id:
        raise HTTPException(status_code=400, detail="不能添加自己为好友")
    if not await _get_user_brief(db, target):
        raise HTTPException(status_code=404, detail="用户不存在")

    existing = await db.execute(
        select(FriendRequest).where(
            or_(
                and_(FriendRequest.user_id == user_id, FriendRequest.friend_id == target),
                and_(FriendRequest.user_id == target, FriendRequest.friend_id == user_id),
            ),
            FriendRequest.status.in_(["pending", "accepted"]),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="你们已经是好友或已有待处理的申请")

    db.add(FriendRequest(id=str(uuid.uuid4()), user_id=user_id, friend_id=target, status="pending"))
    await _notify(db, target, user_id, "friend_request")
    await db.commit()
    return success_response(message="好友申请已发送")


class FriendRespondIn(BaseModel):
    """响应好友申请请求模型"""
    request_id: str
    accept: bool


@social_router.post("/friends/respond")
async def respond_friend_request(
    payload: FriendRespondIn,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(rate_limit(limit=30, window=60)),
):
    """同意/拒绝好友申请（同意时通知申请方）。"""
    result = await db.execute(select(FriendRequest).where(FriendRequest.id == payload.request_id))
    fr = result.scalar_one_or_none()
    if not fr or fr.friend_id != user_id or fr.status != "pending":
        raise HTTPException(status_code=400, detail="申请不存在或已处理")

    if payload.accept:
        fr.status = "accepted"
        await _notify(db, fr.user_id, user_id, "friend_accepted")
        message = "已同意好友申请"
    else:
        fr.status = "rejected"
        message = "已拒绝好友申请"
    await db.commit()
    return success_response(message=message)


@social_router.delete("/friends/{friend_id}")
async def remove_friend(
    friend_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """删除好友（双向记录一并删除）。"""
    await db.execute(
        delete(FriendRequest).where(
            or_(
                and_(FriendRequest.user_id == user_id, FriendRequest.friend_id == friend_id),
                and_(FriendRequest.user_id == friend_id, FriendRequest.friend_id == user_id),
            )
        )
    )
    await db.commit()
    return success_response(message="已删除好友")


# ═══════════════════════════════════════════════════════════
# 动态
# ═══════════════════════════════════════════════════════════

class PostCreate(BaseModel):
    """发布动态请求模型"""
    content: str
    images: list[str] | None = None
    note_id: str | None = None


@social_router.post("/posts")
async def create_post(
    payload: PostCreate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(rate_limit(limit=120, window=60)),
):
    """发布动态（文字 + 图片 + 可选引用笔记）。"""
    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="动态内容不能为空")
    if len(content) > 2000:
        raise HTTPException(status_code=400, detail="动态内容过长（最多 2000 字）")
    _assert_clean(content)

    images = [img for img in (payload.images or []) if img.startswith("/media/")][:9]
    post = Post(user_id=user_id, content=content, images=images or None, note_id=payload.note_id)
    db.add(post)
    await db.commit()
    await db.refresh(post)

    # 异步 LLM 复核（本地敏感词已即时拦截；失败保持 pending 不误杀）
    _spawn(asyncio.create_task(_async_review_post(post.id, content)))

    items = await _posts_with_meta(db, [post], user_id)
    return success_response(message="发布成功", data=items[0])


@social_router.get("/posts/feed")
async def post_feed(
    cursor: int | None = Query(None, ge=1),
    limit: int = Query(20, ge=1, le=50),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """好友时间线：自己 + 好友的动态（游标分页 id < cursor）。"""
    friend_ids = await _friend_ids(db, user_id)
    visible = friend_ids | {user_id}

    stmt = select(Post).where(
        Post.user_id.in_(visible),
        # 他人审核未通过的内容不展示；作者自己的 rejected 可见（便于删除）
        or_(Post.review_status != "rejected", Post.user_id == user_id),
    )
    if cursor:
        stmt = stmt.where(Post.id < cursor)
    stmt = stmt.order_by(Post.id.desc()).limit(limit)
    posts = (await db.execute(stmt)).scalars().all()

    items = await _posts_with_meta(db, posts, user_id)
    return success_response(data={
        "posts": items,
        "next_cursor": items[-1]["id"] if items else None,
    })


@social_router.get("/posts/mine")
async def my_posts(
    cursor: int | None = Query(None, ge=1),
    limit: int = Query(20, ge=1, le=50),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """我的动态（游标分页）。"""
    stmt = select(Post).where(Post.user_id == user_id)
    if cursor:
        stmt = stmt.where(Post.id < cursor)
    stmt = stmt.order_by(Post.id.desc()).limit(limit)
    posts = (await db.execute(stmt)).scalars().all()

    items = await _posts_with_meta(db, posts, user_id)
    return success_response(data={
        "posts": items,
        "next_cursor": items[-1]["id"] if items else None,
    })


@social_router.get("/posts/{post_id}")
async def post_detail(
    post_id: int,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """动态详情（含评论列表，作者信息）。"""
    post = await _get_visible_post(db, post_id, user_id)
    items = await _posts_with_meta(db, [post], user_id)

    comments = (await db.execute(
        select(PostComment, User.username, User.avatar)
        .join(User, User.uuid == PostComment.user_id)
        .where(PostComment.post_id == post_id, PostComment.review_status != "rejected")
        .order_by(PostComment.created_at.asc())
    )).all()

    return success_response(data={
        **items[0],
        "comments": [
            {
                "id": c[0].id,
                "user_id": c[0].user_id,
                "username": c[1],
                "avatar": c[2],
                "content": c[0].content,
                "created_at": str(c[0].created_at) if c[0].created_at else None,
            }
            for c in comments
        ],
    })


@social_router.post("/posts/{post_id}/like")
async def toggle_like(
    post_id: int,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """点赞/取消点赞（切换），点赞时通知作者。"""
    post = await _get_visible_post(db, post_id, user_id)
    existing = await db.execute(
        select(PostLike).where(PostLike.post_id == post_id, PostLike.user_id == user_id)
    )
    like = existing.scalar_one_or_none()

    if like:
        await db.execute(delete(PostLike).where(PostLike.id == like.id))
        await db.commit()
        return success_response(message="已取消点赞", data={"liked": False})

    db.add(PostLike(id=str(uuid.uuid4()), post_id=post_id, user_id=user_id))
    if post.user_id != user_id:
        await _notify(db, post.user_id, user_id, "like", post_id=post_id)
    await db.commit()
    return success_response(message="点赞成功", data={"liked": True})


class CommentIn(BaseModel):
    """评论请求模型"""
    content: str


@social_router.post("/posts/{post_id}/comments")
async def add_comment(
    post_id: int,
    payload: CommentIn,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(rate_limit(limit=30, window=60)),
):
    """评论动态（评论时通知作者）。"""
    post = await _get_visible_post(db, post_id, user_id)
    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="评论内容不能为空")
    if len(content) > 500:
        raise HTTPException(status_code=400, detail="评论过长（最多 500 字）")
    _assert_clean(content)

    comment = PostComment(id=str(uuid.uuid4()), post_id=post_id, user_id=user_id, content=content)
    db.add(comment)
    if post.user_id != user_id:
        await _notify(db, post.user_id, user_id, "comment", post_id=post_id, content=content[:80])
    await db.commit()

    # 异步 LLM 复核评论
    _spawn(asyncio.create_task(_async_review_comment(comment.id, content)))
    return success_response(message="评论成功", data={"id": comment.id, "content": content})


@social_router.delete("/posts/{post_id}")
async def delete_post(
    post_id: int,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """删除自己的动态（级联清理点赞与评论）。"""
    post = await _get_visible_post(db, post_id, user_id)
    if post.user_id != user_id:
        raise HTTPException(status_code=403, detail="只能删除自己的动态")
    await db.execute(delete(PostLike).where(PostLike.post_id == post_id))
    await db.execute(delete(PostComment).where(PostComment.post_id == post_id))
    await db.execute(delete(Post).where(Post.id == post_id))
    await db.commit()
    return success_response(message="动态已删除")


@social_router.delete("/posts/comments/{comment_id}")
async def delete_comment(
    comment_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """删除自己的评论。"""
    result = await db.execute(select(PostComment).where(PostComment.id == comment_id))
    comment = result.scalar_one_or_none()
    if not comment:
        raise HTTPException(status_code=404, detail="评论不存在")
    if comment.user_id != user_id:
        raise HTTPException(status_code=403, detail="只能删除自己的评论")
    await db.execute(delete(PostComment).where(PostComment.id == comment_id))
    await db.commit()
    return success_response(message="评论已删除")


# ═══════════════════════════════════════════════════════════
# 通知
# ═══════════════════════════════════════════════════════════

@social_router.get("/notifications")
async def list_notifications(
    limit: int = Query(50, ge=1, le=100),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """我的通知列表（含触发者信息，倒序）。"""
    stmt = (
        select(Notification, User.username, User.avatar)
        .join(User, User.uuid == Notification.actor_id)
        .where(Notification.user_id == user_id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
    )
    rows = (await db.execute(stmt)).all()
    return success_response(data=[
        {
            "id": n.id,
            "type": n.type,
            "post_id": n.post_id,
            "content": n.content,
            "read": n.read,
            "actor": {"user_id": n.actor_id, "username": username, "avatar": avatar},
            "created_at": str(n.created_at) if n.created_at else None,
        }
        for n, username, avatar in rows
    ])


@social_router.get("/notifications/unread-count")
async def unread_count(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """未读通知数（侧边栏红点）。"""
    count = (
        await db.execute(
            select(func.count(Notification.id)).where(
                Notification.user_id == user_id,
                Notification.read.is_(False),
            )
        )
    ).scalar() or 0
    return success_response(data={"count": int(count)})


@social_router.post("/notifications/read")
async def mark_notifications_read(
    payload: dict | None = Body(default=None),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """
    标记通知已读：body {ids: [...]} 指定单条/多条；不传 body 则全部已读。
    （前端点击通知时单条已读 + 跳转对应页面）
    """
    stmt = update(Notification).where(
        Notification.user_id == user_id, Notification.read.is_(False)
    ).values(read=True)
    if payload and payload.get("ids"):
        stmt = stmt.where(Notification.id.in_(payload["ids"]))
    await db.execute(stmt)
    await db.commit()
    return success_response(message="已标记为已读")


# ═══════════════════════════════════════════════════════════
# 个人主页 + 关注/粉丝 + 成就墙（方向 C 二期）
# ═══════════════════════════════════════════════════════════

# 成就定义（按后端真实数据计算；文案由前端 i18n 展示）
ACHIEVEMENT_DEFS = [
    {"id": "first_note", "key": "notes", "min": 1},
    {"id": "note_master", "key": "notes", "min": 50},
    {"id": "review_pro", "key": "reviews", "min": 100},
    {"id": "first_post", "key": "posts", "min": 1},
    {"id": "sharer", "key": "public_notes", "min": 1},
    {"id": "kb_collector", "key": "kb_docs", "min": 5},
    {"id": "has_fans", "key": "followers", "min": 1},
]


async def _user_stats(db: AsyncSession, user_id: str) -> dict:
    """用户主页统计（笔记/公开笔记/回顾/动态/知识库文档）。"""
    notes = int((
        await db.execute(select(func.count(Note.id)).where(Note.user_id == user_id))
    ).scalar() or 0)
    public_notes = int((
        await db.execute(
            select(func.count(Note.id)).where(Note.user_id == user_id, Note.is_public.is_(True))
        )
    ).scalar() or 0)
    reviews = int((
        await db.execute(
            select(func.coalesce(func.sum(ReviewRecord.review_count), 0))
            .where(ReviewRecord.user_id == user_id)
        )
    ).scalar() or 0)
    posts = int((
        await db.execute(select(func.count(Post.id)).where(Post.user_id == user_id))
    ).scalar() or 0)
    kb_docs = 0
    try:
        from app.rag.vector_store import VectorStoreService
        kb_docs = len(await VectorStoreService().get_all_md5_records(user_id))
    except Exception:
        pass
    return {"notes": notes, "public_notes": public_notes, "reviews": reviews, "posts": posts, "kb_docs": kb_docs}


async def _follow_counts(db: AsyncSession, user_id: str) -> tuple[int, int]:
    followers = int((
        await db.execute(select(func.count(Follow.id)).where(Follow.following_id == user_id))
    ).scalar() or 0)
    following = int((
        await db.execute(select(func.count(Follow.id)).where(Follow.follower_id == user_id))
    ).scalar() or 0)
    return followers, following


@social_router.get("/users/{target_id}/profile")
async def user_profile(
    target_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """公开个人主页：资料 + 统计 + 成就 + 关注关系（任意登录用户可看）。"""
    brief = await _get_user_brief(db, target_id)
    if not brief:
        raise HTTPException(status_code=404, detail="用户不存在")

    u = (await db.execute(select(User).where(User.uuid == target_id))).scalar_one()
    stats = await _user_stats(db, target_id)
    followers, following = await _follow_counts(db, target_id)
    # 成就计算需要粉丝数（has_fans）
    stats["followers"] = followers

    is_following = False
    if target_id != user_id:
        is_following = (
            await db.execute(
                select(Follow.id).where(
                    Follow.follower_id == user_id, Follow.following_id == target_id
                )
            )
        ).scalar_one_or_none() is not None

    # 私聊入口需要知道好友关系（仅好友可私信）
    is_friend = target_id != user_id and target_id in await _friend_ids(db, user_id)

    achievements = [
        {"id": a["id"], "unlocked": stats.get(a["key"], 0) >= a["min"]}
        for a in ACHIEVEMENT_DEFS
    ]

    return success_response(data={
        "user": {
            "user_id": target_id,
            "username": brief["username"],
            "avatar": brief["avatar"],
            "bio": brief["bio"],
            "date_joined": str(u.date_joined) if u.date_joined else None,
        },
        "stats": stats,
        "follow": {
            "is_following": is_following,
            "is_self": target_id == user_id,
            "is_friend": is_friend,
            "follower_count": followers,
            "following_count": following,
        },
        "achievements": achievements,
    })


@social_router.post("/users/{target_id}/follow")
async def follow_user(
    target_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(rate_limit(limit=120, window=60)),
):
    """关注用户（幂等；不能关注自己；通知被关注方）。"""
    if target_id == user_id:
        raise HTTPException(status_code=400, detail="不能关注自己")
    if not await _get_user_brief(db, target_id):
        raise HTTPException(status_code=404, detail="用户不存在")

    existing = await db.execute(
        select(Follow.id).where(Follow.follower_id == user_id, Follow.following_id == target_id)
    )
    if existing.scalar_one_or_none():
        return success_response(message="已关注", data={"is_following": True})

    db.add(Follow(id=str(uuid.uuid4()), follower_id=user_id, following_id=target_id))
    await _notify(db, target_id, user_id, "follow")
    await db.commit()
    return success_response(message="关注成功", data={"is_following": True})


@social_router.delete("/users/{target_id}/follow")
async def unfollow_user(
    target_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """取消关注。"""
    await db.execute(
        delete(Follow).where(Follow.follower_id == user_id, Follow.following_id == target_id)
    )
    await db.commit()
    return success_response(message="已取消关注", data={"is_following": False})


@social_router.get("/users/{target_id}/followers")
async def user_followers(
    target_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """粉丝列表。"""
    rows = (
        await db.execute(
            select(Follow.follower_id)
            .where(Follow.following_id == target_id)
            .order_by(Follow.created_at.desc())
            .limit(50)
        )
    ).all()
    fids = [row[0] for row in rows]
    return success_response(data=await _get_user_briefs(db, fids))


@social_router.get("/users/{target_id}/following")
async def user_following(
    target_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """关注列表。"""
    rows = (
        await db.execute(
            select(Follow.following_id)
            .where(Follow.follower_id == target_id)
            .order_by(Follow.created_at.desc())
            .limit(50)
        )
    ).all()
    fids = [row[0] for row in rows]
    return success_response(data=await _get_user_briefs(db, fids))


@social_router.get("/users/{target_id}/public-notes")
async def user_public_notes(
    target_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """某用户的公开笔记列表（复用广场结构）。"""
    count_stmt = select(func.count(Note.id)).where(
        Note.user_id == target_id, Note.is_public.is_(True)
    )
    total = int((await db.execute(count_stmt)).scalar() or 0)

    rows = (
        await db.execute(
            select(Note, User.username, User.avatar)
            .join(User, User.uuid == Note.user_id)
            .where(Note.user_id == target_id, Note.is_public.is_(True))
            .order_by(Note.updated_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    items = [
        {
            "id": n.id,
            "title": n.title,
            "content_preview": (n.content or "")[:200],
            "category": n.category,
            "tags": n.tags or [],
            "author": {"user_id": n.user_id, "username": username, "avatar": avatar},
            "view_count": n.view_count or 0,
            "updated_at": str(n.updated_at) if n.updated_at else None,
        }
        for n, username, avatar in rows
    ]
    return success_response(data={
        "notes": items,
        "total": total,
        "has_more": page * page_size < total,
    })


# ───────────────────────── 私聊（P0：仅好友 + WebSocket 实时）─────────────────────────

class ChatMessageRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=2000, description="消息内容")


async def _get_conversation(db: AsyncSession, user_x: str, user_y: str) -> ChatConversation | None:
    """按归一化配对查会话。"""
    lo, hi = sorted([user_x, user_y])
    return (await db.execute(
        select(ChatConversation).where(
            ChatConversation.user_a == lo, ChatConversation.user_b == hi
        )
    )).scalar_one_or_none()


async def _ensure_conversation(db: AsyncSession, user_x: str, user_y: str) -> ChatConversation:
    """取或建会话（并发下唯一约束兜底）。"""
    conv = await _get_conversation(db, user_x, user_y)
    if conv:
        return conv
    lo, hi = sorted([user_x, user_y])
    conv = ChatConversation(id=str(uuid.uuid4()), user_a=lo, user_b=hi)
    db.add(conv)
    await db.flush()
    return conv


async def _unread_count(db: AsyncSession, user_id: str) -> int:
    """该用户所有会话的未读消息总数（对方发来且未读）。"""
    convs = (await db.execute(
        select(ChatConversation).where(
            or_(ChatConversation.user_a == user_id, ChatConversation.user_b == user_id)
        )
    )).scalars().all()
    if not convs:
        return 0
    conv_ids = [c.id for c in convs]
    count = (await db.execute(
        select(func.count(PrivateMessage.id)).where(
            PrivateMessage.conversation_id.in_(conv_ids),
            PrivateMessage.sender_id != user_id,
            PrivateMessage.read.is_(False),
        )
    )).scalar()
    return int(count or 0)


def _message_dict(msg: PrivateMessage) -> dict:
    return {
        "id": msg.id,
        "conversation_id": msg.conversation_id,
        "sender_id": msg.sender_id,
        "content": msg.content,
        "read": msg.read,
        "created_at": str(msg.created_at) if msg.created_at else None,
    }


@social_router.get("/chat/conversations")
async def chat_conversations(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(rate_limit(limit=60, window=60)),
):
    """私聊会话列表：对方信息 + 最后消息预览 + 未读数 + 个人置顶/隐藏。

    - 排除个人已隐藏（删除）的会话
    - 置顶会话优先（组内按最后消息时间倒序）
    """
    convs = (await db.execute(
        select(ChatConversation)
        .where(or_(ChatConversation.user_a == user_id, ChatConversation.user_b == user_id))
        .order_by(ChatConversation.last_message_at.desc())
    )).scalars().all()

    items = []
    if convs:
        conv_ids = [c.id for c in convs]
        # 个人视角设置（置顶/隐藏）
        settings = (await db.execute(
            select(ChatConversationSetting).where(
                ChatConversationSetting.user_id == user_id,
                ChatConversationSetting.conversation_id.in_(conv_ids),
            )
        )).scalars().all()
        setting_map = {s.conversation_id: s for s in settings}
        visible = [c for c in convs if not setting_map.get(c.id) or not setting_map[c.id].is_hidden]

        if visible:
            # 未读数（按会话聚合）
            unread_rows = (await db.execute(
                select(PrivateMessage.conversation_id, func.count(PrivateMessage.id))
                .where(
                    PrivateMessage.conversation_id.in_([c.id for c in visible]),
                    PrivateMessage.sender_id != user_id,
                    PrivateMessage.read.is_(False),
                )
                .group_by(PrivateMessage.conversation_id)
            )).all()
            unread_map = {row[0]: int(row[1]) for row in unread_rows}

            # 对方用户信息（批量）
            other_ids = [c.user_b if c.user_a == user_id else c.user_a for c in visible]
            briefs = {b["user_id"]: b for b in await _get_user_briefs(db, other_ids)}

            for conv in visible:
                other_id = conv.user_b if conv.user_a == user_id else conv.user_a
                setting = setting_map.get(conv.id)
                items.append({
                    "conversation_id": conv.id,
                    "peer": briefs.get(other_id) or {"user_id": other_id, "username": "未知用户", "avatar": None},
                    "last_message": conv.last_message or "",
                    "last_sender_id": conv.last_sender_id,
                    "last_message_at": str(conv.last_message_at) if conv.last_message_at else None,
                    "unread": unread_map.get(conv.id, 0),
                    "is_pinned": bool(setting and setting.is_pinned),
                })

        # 置顶优先（稳定排序保持组内最后消息倒序）
        items.sort(key=lambda i: 0 if i["is_pinned"] else 1)

    return success_response(data={"conversations": items})


class ConversationSettingRequest(BaseModel):
    """会话个人设置（微信式：置顶/删除会话按个人视角）"""
    is_pinned: bool | None = None
    hidden: bool | None = None


@social_router.patch("/chat/conversations/{peer_id}")
async def update_conversation_setting(
    peer_id: str,
    payload: ConversationSettingRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(rate_limit(limit=60, window=60)),
):
    """更新会话个人设置：置顶/隐藏（删除会话）。只更新显式传入字段。"""
    conv = await _get_conversation(db, user_id, peer_id)
    if not conv:
        raise HTTPException(status_code=404, detail="会话不存在")
    if not payload.model_fields_set:
        raise HTTPException(status_code=400, detail="没有需要更新的字段")

    setting = (await db.execute(select(ChatConversationSetting).where(
        ChatConversationSetting.user_id == user_id,
        ChatConversationSetting.conversation_id == conv.id,
    ))).scalar_one_or_none()
    if not setting:
        setting = ChatConversationSetting(id=str(uuid.uuid4()), user_id=user_id, conversation_id=conv.id)
        db.add(setting)

    if "is_pinned" in payload.model_fields_set:
        setting.is_pinned = bool(payload.is_pinned)
    if "hidden" in payload.model_fields_set:
        setting.is_hidden = bool(payload.hidden)
    await db.commit()

    return success_response(data={"is_pinned": setting.is_pinned, "is_hidden": setting.is_hidden})


@social_router.get("/chat/conversations/{target_id}/messages")
async def chat_history(
    target_id: str,
    cursor: int | None = Query(None, ge=1, description="消息ID游标（取更早的）"),
    limit: int = Query(30, ge=1, le=50),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(rate_limit(limit=120, window=60)),
):
    """与某用户的历史消息（游标分页，返回时间正序）。"""
    conv = await _get_conversation(db, user_id, target_id)
    if not conv:
        return success_response(data={"messages": [], "has_more": False, "conversation_id": None})

    stmt = select(PrivateMessage).where(PrivateMessage.conversation_id == conv.id)
    if cursor:
        stmt = stmt.where(PrivateMessage.id < cursor)
    rows = (await db.execute(
        stmt.order_by(PrivateMessage.id.desc()).limit(limit + 1)
    )).scalars().all()

    has_more = len(rows) > limit
    messages = [_message_dict(m) for m in reversed(rows[:limit])]
    return success_response(data={
        "messages": messages,
        "has_more": has_more,
        "conversation_id": conv.id,
    })


@social_router.post("/chat/conversations/{target_id}/messages")
async def send_chat_message(
    target_id: str,
    payload: ChatMessageRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(rate_limit(limit=30, window=60)),
):
    """发送私聊消息：仅好友（403 非好友）；敏感词即时拦截；落库后 WS 实时推送。"""
    if target_id == user_id:
        raise HTTPException(status_code=400, detail="不能给自己发消息")
    friends = await _friend_ids(db, user_id)
    if target_id not in friends:
        raise HTTPException(status_code=403, detail="仅好友之间可以私聊")
    _assert_clean(payload.content)

    conv = await _ensure_conversation(db, user_id, target_id)
    msg = PrivateMessage(conversation_id=conv.id, sender_id=user_id, content=payload.content)
    db.add(msg)
    conv.last_message = payload.content[:500]
    conv.last_message_at = datetime.now()
    conv.last_sender_id = user_id
    await db.commit()
    await db.refresh(msg)

    # WS 推送：新消息 + 接收方未读数（离线时跳过，重连后 REST 拉取）
    from app.core.ws_manager import ws_manager

    await ws_manager.send_to_user(target_id, {
        "type": "message",
        "conversation_id": conv.id,
        "message": _message_dict(msg),
    })
    unread = await _unread_count(db, target_id)
    await ws_manager.send_to_user(target_id, {"type": "unread", "count": unread})

    return success_response(data={"message": _message_dict(msg)})


@social_router.post("/chat/conversations/{target_id}/read")
async def mark_conversation_read(
    target_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(rate_limit(limit=60, window=60)),
):
    """标记与某用户的会话全部已读，并返回最新未读总数（WS 通知对方已读）。"""
    conv = await _get_conversation(db, user_id, target_id)
    if conv:
        await db.execute(
            update(PrivateMessage)
            .where(
                PrivateMessage.conversation_id == conv.id,
                PrivateMessage.sender_id == target_id,
                PrivateMessage.read.is_(False),
            )
            .values(read=True)
        )
        await db.commit()

        from app.core.ws_manager import ws_manager

        await ws_manager.send_to_user(target_id, {"type": "read", "conversation_id": conv.id})

    unread = await _unread_count(db, user_id)
    return success_response(data={"unread": unread})


@social_router.get("/chat/unread-count")
async def chat_unread_count(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(rate_limit(limit=120, window=60)),
):
    """私聊未读消息总数（侧边栏红点 + WS 未读事件兜底）。"""
    return success_response(data={"count": await _unread_count(db, user_id)})
