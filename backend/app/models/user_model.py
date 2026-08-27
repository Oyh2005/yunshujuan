import uuid as _uuid

from sqlalchemy import JSON, Boolean, Column, DateTime, Integer, String, Text
from sqlalchemy.sql import func

from app.models.chat_history import Base


def generate_uuid() -> str:
    return _uuid.uuid4().hex[:24]


class UserStatusChoice:
    LOCKED = 2
    ACTIVE = 1
    DISABLED = 0


class User(Base):
    __tablename__ = "user_service"

    uuid = Column(String(36), primary_key=True, default=generate_uuid)
    username = Column(String(150), nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    telephone = Column(String(11), unique=True, nullable=True)
    password = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=False)
    status = Column(Integer, default=UserStatusChoice.DISABLED)
    gender = Column(Integer, nullable=True)
    bio = Column(Text, nullable=True)
    avatar = Column(String(255), nullable=True)
    date_joined = Column(DateTime(timezone=True), server_default=func.now())
    last_login = Column(DateTime(timezone=True), nullable=True)


class UserSetting(Base):
    """用户云端偏好/养成数据：小卷养成 + 打卡任务（上云，防本地丢失）"""

    __tablename__ = "user_settings"

    user_id = Column(String(36), primary_key=True, comment="用户ID")
    pet_config = Column(JSON, nullable=True, comment="小卷养成配置（pet.config 云端副本）")
    habit_config = Column(JSON, nullable=True, comment="打卡任务配置（habit.config 云端副本）")
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), comment="更新时间")
