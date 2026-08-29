"""前端错误监控模型（稳定性三件套：自建上报，不依赖第三方监控）。"""

from sqlalchemy import JSON, Column, DateTime, Integer, String, Text
from sqlalchemy.sql import func

from app.models.chat_history import Base


class ErrorReport(Base):
    """前端错误上报：ErrorBoundary 渲染错误 / 全局未捕获异常 / 未处理 Promise 拒绝"""

    __tablename__ = "error_reports"

    id = Column(Integer, primary_key=True, autoincrement=True, comment="自增ID")
    user_id = Column(String(36), index=True, nullable=True, comment="用户ID（未登录为空）")
    kind = Column(String(30), nullable=False, comment="boundary/unhandled/rejection")
    message = Column(String(500), nullable=False, comment="错误信息（截断 500）")
    stack = Column(Text, nullable=True, comment="堆栈（截断 8KB）")
    page = Column(String(200), nullable=True, comment="出错页面路径")
    detail = Column(JSON, nullable=True, comment="附加信息（组件名等）")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True, comment="上报时间")
