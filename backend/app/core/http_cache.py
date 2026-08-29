"""HTTP 客户端缓存工具：ETag 版本化 + Cache-Control 响应头（多域通用）。

原理：
- Redis 维护 `{domain}_version:{user_id}` 版本号，写操作 INCR（与各服务缓存失效同点）
- 读接口响应带 `ETag: "v{version}"` + `Cache-Control: private, max-age=…`
- 浏览器下次请求带 `If-None-Match`，版本未变 → 后端直接回 304 空响应
  （开销 = 一次 Redis GET，微秒级），数据变了 → 正常全量返回

域（domain）：
- "note"：笔记列表/详情/统计（note_service._invalidate_note_caches 统一 INCR）
- "chat"：会话列表（database_session_manager 写方法 INCR）

Redis 不可用时自动降级：无 ETag、无 304，浏览器走全量请求（功能不变）。
"""
from fastapi import Request, Response


def _version_key(domain: str, user_id: str) -> str:
    return f"{domain}_version:{user_id}"


async def get_domain_etag(domain: str, user_id: str) -> str | None:
    """读取版本号并格式化为 ETag；Redis 不可用返回 None（降级为无缓存）。"""
    try:
        from app.db.redis_config import connect_redis
        redis = await connect_redis()
        version = await redis.get(_version_key(domain, user_id))
        return f'"v{version or 0}"'
    except Exception:
        return None


async def bump_domain_version(domain: str, user_id: str) -> None:
    """写操作后递增版本号（使所有客户端缓存立即失效）。Redis 不可用时静默跳过。"""
    try:
        from app.db.redis_config import connect_redis
        redis = await connect_redis()
        await redis.incr(_version_key(domain, user_id))
    except Exception:
        pass


async def is_not_modified(request: Request, domain: str, user_id: str) -> bool:
    """If-None-Match 与当前版本匹配 → 应返回 304（在查数据前调用，省一次查询）。"""
    etag = await get_domain_etag(domain, user_id)
    if etag is None:
        return False
    return request.headers.get("if-none-match") == etag


async def apply_http_cache(
    request: Request,
    response: Response,
    domain: str,
    user_id: str,
    max_age: int,
) -> Response:
    """为读接口响应附加 ETag + Cache-Control（在返回前调用）。"""
    etag = await get_domain_etag(domain, user_id)
    response.headers["Cache-Control"] = f"private, max-age={max_age}"
    if etag is not None:
        response.headers["ETag"] = etag
    return response
