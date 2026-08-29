"""HTTP 客户端缓存工具：ETag 版本化 + Cache-Control 响应头。

原理：
- Redis 维护 `note_version:{user_id}` 版本号，任何笔记写操作 INCR（与
  `note_service._invalidate_note_caches` 同点触发）
- 读接口响应带 `ETag: "v{version}"` + `Cache-Control: private, max-age=…`
- 浏览器下次请求带 `If-None-Match`，版本未变 → 后端直接回 304 空响应
  （开销 = 一次 Redis GET，微秒级），数据变了 → 正常全量返回

效果：写操作立即生效 与 用户刷新零开销 同时成立；高频刷新压力从
「与刷新频率挂钩」变为「与数据变更频率挂钩」。

Redis 不可用时自动降级：无 ETag、无 304，浏览器走全量请求（功能不变）。
"""
from fastapi import Request, Response


async def get_note_etag(user_id: str) -> str | None:
    """读取当前笔记版本号并格式化为 ETag；Redis 不可用返回 None（降级为无缓存）。"""
    try:
        from app.db.redis_config import connect_redis
        redis = await connect_redis()
        version = await redis.get(f"note_version:{user_id}")
        return f'"v{version or 0}"'
    except Exception:
        return None


async def bump_note_version(user_id: str) -> None:
    """笔记写操作后递增版本号（使所有客户端缓存立即失效）。Redis 不可用时静默跳过。"""
    try:
        from app.db.redis_config import connect_redis
        redis = await connect_redis()
        await redis.incr(f"note_version:{user_id}")
    except Exception:
        pass


async def apply_note_http_cache(
    request: Request,
    response: Response,
    user_id: str,
    max_age: int,
) -> Response:
    """为笔记读接口附加 ETag + Cache-Control（在返回前调用）。

    注意：304 短路在数据查询之前判断（见各路由），本函数只负责给
    全量响应附加头。
    """
    etag = await get_note_etag(user_id)
    response.headers["Cache-Control"] = f"private, max-age={max_age}"
    if etag is not None:
        response.headers["ETag"] = etag
    return response


async def is_not_modified(request: Request, user_id: str) -> bool:
    """If-None-Match 与当前版本匹配 → 应返回 304（在查数据前调用，省一次查询）。"""
    etag = await get_note_etag(user_id)
    if etag is None:
        return False
    return request.headers.get("if-none-match") == etag
