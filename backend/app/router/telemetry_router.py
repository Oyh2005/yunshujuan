"""前端错误监控上报（稳定性三件套）：自建接口，不依赖第三方监控服务。

设计：
- 允许匿名（登录页/公共页也可能出错），token 有效则记录 user_id
- 入库失败不影响前端响应（try/except 降级，错误监控本身不能成为故障源）
- 限流 30/60s 防错误风暴刷库；前端另有 30s 同类节流
"""

from fastapi import Depends
from fastapi.routing import APIRouter
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logger_handler import logger
from app.core.rate_limit import rate_limit
from app.core.success_response import success_response
from app.db.db_config import get_db
from app.models.error_report import ErrorReport
from app.utils.auth_utils import get_optional_user_id

telemetry_router = APIRouter(prefix="/telemetry", tags=["telemetry"])


class ErrorReportRequest(BaseModel):
    kind: str = Field(..., max_length=30, description="boundary/unhandled/rejection")
    message: str = Field(..., max_length=500, description="错误信息")
    stack: str | None = Field(None, max_length=8192, description="堆栈")
    page: str | None = Field(None, max_length=200, description="出错页面路径")
    detail: dict | None = None


@telemetry_router.post("/error")
async def report_error(
    payload: ErrorReportRequest,
    user_id: str | None = Depends(get_optional_user_id),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(rate_limit(limit=30, window=60)),
):
    """前端错误上报：入库失败不影响前端（try/except 降级）。"""
    try:
        db.add(ErrorReport(
            user_id=user_id,
            kind=payload.kind[:30],
            message=payload.message[:500],
            stack=payload.stack[:8192] if payload.stack else None,
            page=payload.page[:200] if payload.page else None,
            detail=payload.detail,
        ))
        await db.commit()
    except Exception as e:
        logger.error(f"错误上报入库失败: {type(e).__name__}: {e}")
    return success_response(message="ok")
