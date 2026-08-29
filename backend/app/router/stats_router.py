"""
统计仪表盘 API 路由 —— 聚合笔记 / 回顾 / 对话 / 知识库数据，供前端「知识仪表盘」展示。

⚠️ 注意：本路由的 handler 不要使用 @cache_with_redis 装饰器
（会破坏 FastAPI Depends 依赖注入签名解析，导致 401 / 参数丢失）。
统计查询本身较轻量（均为索引过滤的聚合查询），可直接查库。
"""

from datetime import datetime, timedelta

from fastapi import Depends
from fastapi.routing import APIRouter
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logger_handler import logger
from app.core.success_response import success_response
from app.db.db_config import get_db
from app.models.chat_history import ChatMessage, ChatSession
from app.models.note import Note
from app.models.review_record import ReviewRecord
from app.utils.auth_utils import get_current_user_id

stats_router = APIRouter(prefix="/stats", tags=["stats"])

# 热力图覆盖天数（GitHub 风格 365 天）
HEATMAP_DAYS = 365
# 字数趋势覆盖天数
TREND_DAYS = 30


@stats_router.get("/dashboard")
async def get_dashboard_stats(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """
    知识仪表盘聚合统计（用户隔离）：

    - summary:
        total_notes     笔记总数
        total_chars     总字数（CHAR_LENGTH 按字符数）
        total_reviews   累计回顾次数
        week_reviews    本周回顾次数（last_reviewed_at >= 本周一 00:00）
        today_reviews   今日待回顾（next_review_at <= 当前时间）
        ai_messages     AI 对话消息数（ChatMessage 无 user_id，JOIN chat_sessions）
        kb_docs         知识库文档数（MD5 记录数）
    - heatmap: 近 365 天每日笔记数 {"2026-08-26": 3}
    - trend:   近 30 天每日写作字数 [{"date": "2026-08-26", "chars": 128}]
    - categories: 分类计数 [{"category": "work", "count": 5}]（不含未分类）
    - uncategorized: 未分类笔记数
    """
    now = datetime.now()
    heatmap_start = now - timedelta(days=HEATMAP_DAYS - 1)
    trend_start = now - timedelta(days=TREND_DAYS - 1)
    # 今年 1 月 1 日（年度统计）
    year_start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    # 本周一 00:00:00
    monday = (now - timedelta(days=now.weekday())).replace(
        hour=0, minute=0, second=0, microsecond=0
    )

    # ── 笔记总数与总字数 ──
    note_stmt = select(
        func.count(Note.id),
        func.coalesce(func.sum(func.char_length(Note.content)), 0),
    ).where(Note.user_id == user_id)
    note_row = (await db.execute(note_stmt)).one()
    total_notes = int(note_row[0] or 0)
    total_chars = int(note_row[1] or 0)

    # ── 年度统计（今年 1 月 1 日起）──
    year_stmt = select(
        func.count(Note.id),
        func.coalesce(func.sum(func.char_length(Note.content)), 0),
    ).where(Note.user_id == user_id, Note.created_at >= year_start)
    year_row = (await db.execute(year_stmt)).one()
    year_notes = int(year_row[0] or 0)
    year_chars = int(year_row[1] or 0)

    # ── 回顾统计 ──
    total_reviews_stmt = select(
        func.coalesce(func.sum(ReviewRecord.review_count), 0)
    ).where(ReviewRecord.user_id == user_id)
    total_reviews = int((await db.execute(total_reviews_stmt)).scalar() or 0)

    week_reviews_stmt = select(func.count(ReviewRecord.id)).where(
        ReviewRecord.user_id == user_id,
        ReviewRecord.last_reviewed_at >= monday,
    )
    week_reviews = int((await db.execute(week_reviews_stmt)).scalar() or 0)

    today_reviews_stmt = select(func.count(ReviewRecord.id)).where(
        ReviewRecord.user_id == user_id,
        ReviewRecord.next_review_at <= now,
    )
    today_reviews = int((await db.execute(today_reviews_stmt)).scalar() or 0)

    # ── AI 对话消息数（ChatMessage 表没有 user_id，需 JOIN chat_sessions）──
    ai_stmt = (
        select(func.count(ChatMessage.id))
        .join(ChatSession, ChatMessage.session_id == ChatSession.id)
        .where(ChatSession.user_id == user_id)
    )
    ai_messages = int((await db.execute(ai_stmt)).scalar() or 0)

    # ── 知识库文档数（MD5 去重记录）──
    kb_docs = 0
    try:
        from app.rag.vector_store import VectorStoreService

        records = await VectorStoreService().get_all_md5_records(user_id)
        kb_docs = len(records)
    except Exception as e:
        logger.warning(f"获取知识库文档数失败（忽略，按 0 计）: {e}")

    # ── 热力图：近 365 天每日笔记数 ──
    heatmap_stmt = (
        select(func.date(Note.created_at), func.count(Note.id))
        .where(Note.user_id == user_id, Note.created_at >= heatmap_start)
        .group_by(func.date(Note.created_at))
    )
    heatmap_rows = await db.execute(heatmap_stmt)
    heatmap = {str(row[0]): int(row[1]) for row in heatmap_rows}

    # ── 字数趋势：近 30 天每日写作字数 ──
    trend_stmt = (
        select(
            func.date(Note.created_at),
            func.coalesce(func.sum(func.char_length(Note.content)), 0),
        )
        .where(Note.user_id == user_id, Note.created_at >= trend_start)
        .group_by(func.date(Note.created_at))
    )
    trend_rows = await db.execute(trend_stmt)
    trend = [{"date": str(r[0]), "chars": int(r[1] or 0)} for r in trend_rows]

    # ── 分类占比 ──
    cat_stmt = (
        select(Note.category, func.count(Note.id))
        .where(Note.user_id == user_id, Note.category.isnot(None))
        .group_by(Note.category)
    )
    cat_rows = await db.execute(cat_stmt)
    categories = [{"category": c, "count": int(n)} for c, n in cat_rows]

    uncat_stmt = select(func.count(Note.id)).where(
        Note.user_id == user_id, Note.category.is_(None)
    )
    uncategorized = int((await db.execute(uncat_stmt)).scalar() or 0)

    return success_response(
        data={
            "summary": {
                "total_notes": total_notes,
                "total_chars": total_chars,
                "year_notes": year_notes,
                "year_chars": year_chars,
                "total_reviews": total_reviews,
                "week_reviews": week_reviews,
                "today_reviews": today_reviews,
                "ai_messages": ai_messages,
                "kb_docs": kb_docs,
            },
            "heatmap": heatmap,
            "trend": trend,
            "categories": categories,
            "uncategorized": uncategorized,
        }
    )


@stats_router.get("/period")
async def get_period_stats(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """
    周报/月报聚合（首页周报/月报卡片用，用户隔离）：

    - week:  本周（周一 00:00 起）笔记数/字数/回顾次数 + 上周对应值（prev_*）
    - month: 本月（1 号 00:00 起）笔记数/字数/回顾次数 + 上月对应值（prev_*）
    环比由前端计算（本期/上期差值百分比）。
    """
    now = datetime.now()
    monday = (now - timedelta(days=now.weekday())).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    prev_monday = monday - timedelta(days=7)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    prev_month_start = (month_start - timedelta(days=1)).replace(
        day=1, hour=0, minute=0, second=0, microsecond=0
    )

    async def _note_stats(start) -> dict:
        """start 起至今的笔记数/字数（上期统计额外传入 end 上界）"""
        row = (await db.execute(select(
            func.count(Note.id),
            func.coalesce(func.sum(func.char_length(Note.content)), 0),
        ).where(Note.user_id == user_id, Note.created_at >= start))).one()
        return {"notes": int(row[0] or 0), "chars": int(row[1] or 0)}

    async def _note_stats_range(start, end) -> dict:
        """[start, end) 区间的笔记数/字数（用于上期对比）"""
        row = (await db.execute(select(
            func.count(Note.id),
            func.coalesce(func.sum(func.char_length(Note.content)), 0),
        ).where(Note.user_id == user_id, Note.created_at >= start, Note.created_at < end))).one()
        return {"notes": int(row[0] or 0), "chars": int(row[1] or 0)}

    async def _review_count(start, end=None) -> int:
        """回顾次数：last_reviewed_at 在 [start, end)（end 为 None 时无上界）"""
        stmt = select(func.count(ReviewRecord.id)).where(
            ReviewRecord.user_id == user_id,
            ReviewRecord.last_reviewed_at >= start,
        )
        if end is not None:
            stmt = stmt.where(ReviewRecord.last_reviewed_at < end)
        return int((await db.execute(stmt)).scalar() or 0)

    week = await _note_stats(monday)
    prev_week = await _note_stats_range(prev_monday, monday)
    month = await _note_stats(month_start)
    prev_month = await _note_stats_range(prev_month_start, month_start)

    return success_response(
        data={
            "week": {
                **week,
                "reviews": await _review_count(monday),
                "prev_notes": prev_week["notes"],
                "prev_chars": prev_week["chars"],
                "prev_reviews": await _review_count(prev_monday, monday),
            },
            "month": {
                **month,
                "reviews": await _review_count(month_start),
                "prev_notes": prev_month["notes"],
                "prev_chars": prev_month["chars"],
                "prev_reviews": await _review_count(prev_month_start, month_start),
            },
        }
    )


@stats_router.get("/leaderboard")
async def get_leaderboard(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """
    排行榜（方向 C 一期）：
    - writing: 本周写作字数 Top 10（按 created_at >= 本周一 的 CHAR_LENGTH 合计）
    - review: 本周回顾次数 Top 10（按 last_reviewed_at >= 本周一 计数）
    每项含 username/avatar。
    """
    from app.models.review_record import ReviewRecord
    from app.models.user_model import User

    # Redis 缓存 60 秒（方向 D 阶段一；Redis 不可用时自动降级直查）
    from app.db.redis_config import get_redis_cache_json, set_redis_cache

    cache_key = "stats:leaderboard"
    cached = await get_redis_cache_json(cache_key)
    if cached is not None:
        return success_response(data=cached)

    now = datetime.now()
    monday = (now - timedelta(days=now.weekday())).replace(
        hour=0, minute=0, second=0, microsecond=0
    )

    # 本周写作字数榜
    writing_stmt = (
        select(
            Note.user_id,
            func.coalesce(func.sum(func.char_length(Note.content)), 0).label("value"),
        )
        .where(Note.created_at >= monday)
        .group_by(Note.user_id)
        .order_by(func.coalesce(func.sum(func.char_length(Note.content)), 0).desc())
        .limit(10)
    )
    writing_rows = (await db.execute(writing_stmt)).all()
    writing_ids = [r[0] for r in writing_rows]

    # 本周回顾榜
    review_stmt = (
        select(ReviewRecord.user_id, func.count(ReviewRecord.id).label("value"))
        .where(ReviewRecord.last_reviewed_at >= monday)
        .group_by(ReviewRecord.user_id)
        .order_by(func.count(ReviewRecord.id).desc())
        .limit(10)
    )
    review_rows = (await db.execute(review_stmt)).all()
    review_ids = [r[0] for r in review_rows]

    # 连续写作打卡榜（方向 C 三期）：读取 user_settings.habit_config 的 noteStreak.count
    # habit 数据为前端上云的 JSON（localStorage 原始结构），Python 层解析容错处理
    from app.models.user_model import UserSetting

    habit_rows = (await db.execute(
        select(UserSetting.user_id, UserSetting.habit_config)
    )).all()
    streak_list: list[tuple[str, int]] = []
    for uid, config in habit_rows:
        if not config or not isinstance(config, dict):
            continue
        note_streak = config.get("noteStreak") or {}
        count = int(note_streak.get("count") or 0)
        if count > 0:
            streak_list.append((uid, count))
    streak_list.sort(key=lambda x: x[1], reverse=True)
    streak_rows = streak_list[:10]
    streak_ids = [s[0] for s in streak_rows]

    # 批量取用户信息
    all_ids = list(dict.fromkeys([*writing_ids, *review_ids, *streak_ids]))
    user_map: dict[str, dict] = {}
    if all_ids:
        rows = await db.execute(select(User).where(User.uuid.in_(all_ids)))
        for u in rows.scalars().all():
            user_map[u.uuid] = {"user_id": u.uuid, "username": u.username, "avatar": u.avatar}

    payload = {
        "writing": [
            {**user_map.get(uid, {"user_id": uid, "username": "未知用户", "avatar": None}), "value": int(value)}
            for uid, value in writing_rows
        ],
        "review": [
            {**user_map.get(uid, {"user_id": uid, "username": "未知用户", "avatar": None}), "value": int(value)}
            for uid, value in review_rows
        ],
        "streak": [
            {**user_map.get(uid, {"user_id": uid, "username": "未知用户", "avatar": None}), "value": count}
            for uid, count in streak_rows
        ],
    }
    await set_redis_cache(cache_key, payload, expire=60)
    return success_response(data=payload)
