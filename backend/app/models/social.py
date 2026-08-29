"""社交模块模型：好友申请 / 动态 / 点赞 / 评论 / 通知（方向 B：好友 + 动态流）。"""

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.sql import func

from app.models.chat_history import Base


class FriendRequest(Base):
    """好友申请（双向确认）：user_id 申请 → friend_id 接收，status 流转 pending → accepted/rejected"""

    __tablename__ = "friend_requests"

    id = Column(String(36), primary_key=True, comment="UUID")
    user_id = Column(String(36), index=True, nullable=False, comment="申请方用户ID")
    friend_id = Column(String(36), index=True, nullable=False, comment="接收方用户ID")
    status = Column(String(20), default="pending", nullable=False, comment="pending/accepted/rejected")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), comment="创建时间")
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), comment="更新时间")


class Post(Base):
    """动态：文字 + 图片列表 + 可选引用笔记"""

    __tablename__ = "posts"

    # 自增整数主键，便于游标分页（id < cursor）
    id = Column(Integer, primary_key=True, autoincrement=True, comment="自增ID（游标分页用）")
    user_id = Column(String(36), index=True, nullable=False, comment="作者用户ID")
    content = Column(Text, nullable=False, comment="动态正文")
    images = Column(JSON, nullable=True, comment='图片URL列表 ["/media/img/x.png"]')
    note_id = Column(String(36), nullable=True, comment="引用的笔记ID（可空）")
    review_status = Column(String(10), default="pending", nullable=False, comment="AI审核状态 pending/passed/rejected")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), comment="创建时间")


class PostLike(Base):
    """动态点赞（post_id + user_id 唯一）"""

    __tablename__ = "post_likes"
    __table_args__ = (UniqueConstraint("post_id", "user_id", name="uq_post_like"),)

    id = Column(String(36), primary_key=True, comment="UUID")
    post_id = Column(Integer, index=True, nullable=False, comment="动态ID")
    user_id = Column(String(36), index=True, nullable=False, comment="点赞用户ID")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), comment="创建时间")


class PostComment(Base):
    """动态评论"""

    __tablename__ = "post_comments"

    id = Column(String(36), primary_key=True, comment="UUID")
    post_id = Column(Integer, index=True, nullable=False, comment="动态ID")
    user_id = Column(String(36), index=True, nullable=False, comment="评论用户ID")
    content = Column(Text, nullable=False, comment="评论内容")
    review_status = Column(String(10), default="pending", nullable=False, comment="AI审核状态 pending/passed/rejected")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), comment="创建时间")


class Notification(Base):
    """站内通知：好友申请 / 好友接受 / 点赞 / 评论"""

    __tablename__ = "notifications"

    id = Column(String(36), primary_key=True, comment="UUID")
    user_id = Column(String(36), index=True, nullable=False, comment="接收方用户ID")
    actor_id = Column(String(36), nullable=False, comment="触发方用户ID")
    type = Column(String(30), nullable=False, comment="friend_request/friend_accepted/like/comment")
    post_id = Column(Integer, nullable=True, comment="关联动态ID（点赞/评论时）")
    content = Column(String(255), nullable=True, comment="通知摘要（如评论内容）")
    read = Column(Boolean, default=False, nullable=False, comment="是否已读")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), comment="创建时间")


class Follow(Base):
    """单向关注（粉丝关系）：follower_id 关注 following_id"""

    __tablename__ = "follows"
    __table_args__ = (UniqueConstraint("follower_id", "following_id", name="uq_follow"),)

    id = Column(String(36), primary_key=True, comment="UUID")
    follower_id = Column(String(36), index=True, nullable=False, comment="关注者用户ID")
    following_id = Column(String(36), index=True, nullable=False, comment="被关注者用户ID")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), comment="创建时间")


class ChatConversation(Base):
    """私聊会话（仅好友）：user_a < user_b 归一化配对，UNIQUE 防重复会话"""

    __tablename__ = "chat_conversations"
    __table_args__ = (UniqueConstraint("user_a", "user_b", name="uq_chat_conversation"),)

    id = Column(String(36), primary_key=True, comment="UUID")
    user_a = Column(String(36), index=True, nullable=False, comment="归一化较小用户ID")
    user_b = Column(String(36), index=True, nullable=False, comment="归一化较大用户ID")
    last_message_at = Column(DateTime(timezone=True), server_default=func.now(), index=True, comment="最后消息时间")
    last_message = Column(String(500), nullable=True, comment="最后消息预览")
    last_sender_id = Column(String(36), nullable=True, comment="最后消息发送者")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), comment="创建时间")


class PrivateMessage(Base):
    """私聊消息（自增主键作游标分页）。表名避开 chat_messages（AI 对话消息表）。"""

    __tablename__ = "private_messages"

    id = Column(Integer, primary_key=True, autoincrement=True, comment="自增ID（游标分页）")
    conversation_id = Column(String(36), index=True, nullable=False, comment="会话ID")
    sender_id = Column(String(36), index=True, nullable=False, comment="发送者用户ID")
    content = Column(Text, nullable=False, comment="消息内容")
    read = Column(Boolean, default=False, nullable=False, index=True, comment="接收方是否已读")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True, comment="发送时间")
