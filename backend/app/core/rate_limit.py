import os

from fastapi import HTTPException, Request

from app.db.redis_config import connect_redis

# 全局开关：通过环境变量 RATE_LIMIT_ENABLED 控制所有限流是否生效
# 当设置为 false 时，rate_limit 依赖和 RateLimitMiddleware 均直接放行
_RATE_LIMIT_ENABLED = os.getenv("RATE_LIMIT_ENABLED", "true").lower() == "true"


def _client_ip(request: Request) -> str:
    """优先取直连 IP，反代场景回退 X-Forwarded-For 首段。"""
    if request.client and request.client.host:
        return request.client.host
    forwarded = request.headers.get("X-Forwarded-For", "")
    return forwarded.split(",")[0].strip() or "unknown"


def _instance_port(request: Request) -> int:
    """请求端口：同一 IP 上可同时跑多个实例（开发 8000 + 临时验证实例），
    限流 key 必须区分端口，否则实例间互相消耗配额。"""
    return request.url.port or (443 if request.url.scheme == "https" else 80)


def rate_limit(limit: int = 1, window: int = 60):
    """
    限流依赖函数（按接口路径独立计数）
    :param limit: 时间窗口内的最大请求数
    :param window: 时间窗口大小（秒）
    :return: 依赖函数
    """
    async def dependency(request: Request):
        # 全局开关关闭时直接放行，不做任何限流检查
        if not _RATE_LIMIT_ENABLED:
            return

        client_ip = _client_ip(request)

        # 按接口路径 + 实例端口区分计数，避免不同接口/不同实例互相消耗配额
        key = f"rate_limit:{request.url.path}:{_instance_port(request)}:{client_ip}"

        try:
            redis = await connect_redis()
            current = await redis.get(key)
            current = int(current) if current else 0

            if current >= limit:
                raise HTTPException(
                    status_code=429,
                    detail="请求过于频繁，请稍后再试"
                )

            if current == 0:
                await redis.setex(key, window, 1)
            else:
                await redis.incr(key)
                # 兜底：incr 不更新 TTL。若 key 的过期时间意外丢失
                # （Redis 重启恢复旧数据等），计数将永久累积 → 永久 429。
                # 检测到无 TTL 时补设过期（保留计数，不重置窗口）
                if await redis.ttl(key) < 0:
                    await redis.expire(key, window)
        except HTTPException:
            raise
        except Exception as e:
            # Redis 不可用时降级放行，避免限流把服务拖垮
            from app.core.logger_handler import logger
            logger.warning(f"限流检查跳过（Redis 不可用）: {type(e).__name__}")

    return dependency


class RateLimitMiddleware:
    """
    全局限流中间件（按 IP 独立计数）
    """
    def __init__(self, app, limit: int = 100, window: int = 60):
        self.app = app
        self.limit = limit
        self.window = window

    async def __call__(self, scope, receive, send):
        # 全局开关关闭时直接放行
        if not _RATE_LIMIT_ENABLED:
            await self.app(scope, receive, send)
            return

        if scope['type'] != 'http':
            await self.app(scope, receive, send)
            return

        from fastapi import Request
        request = Request(scope, receive)
        client_ip = _client_ip(request)
        key = f"rate_limit:global:{_instance_port(request)}:{client_ip}"

        try:
            redis = await connect_redis()
            current = await redis.get(key)
            current = int(current) if current else 0

            if current >= self.limit:
                from starlette.responses import JSONResponse
                response = JSONResponse(
                    {"detail": "请求过于频繁，请稍后再试"},
                    status_code=429
                )
                await response(scope, receive, send)
                return

            if current == 0:
                await redis.setex(key, self.window, 1)
            else:
                await redis.incr(key)
                # 兜底：同 rate_limit 依赖，TTL 意外丢失时补设过期，防止永久 429
                if await redis.ttl(key) < 0:
                    await redis.expire(key, self.window)
        except Exception as e:
            # Redis 不可用时降级放行
            from app.core.logger_handler import logger
            logger.warning(f"全局限流跳过（Redis 不可用）: {type(e).__name__}")

        await self.app(scope, receive, send)
