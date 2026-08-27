from sqlalchemy import Column, DateTime, String
from sqlalchemy.sql import func

from app.models.chat_history import Base


class NoteLink(Base):
    """笔记双链：记录一篇笔记内容中引用的 [[标题]]（保存时正则提取重建）"""

    __tablename__ = "note_links"

    id = Column(String(36), primary_key=True, comment="UUID")
    note_id = Column(String(36), index=True, nullable=False, comment="来源笔记ID")
    user_id = Column(String(36), index=True, nullable=False, comment="用户ID")
    linked_title = Column(String(200), nullable=False, comment="被引用的笔记标题")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), comment="创建时间")
