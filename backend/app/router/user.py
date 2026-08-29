import os
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel
from shortuuid import uuid as short_uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.failed_response import logger
from app.db.db_config import AsyncSessionLocal, get_db
from app.db.redis_config import connect_redis as _connect_redis
from app.models.user_model import User, UserStatusChoice
from app.schemas.user_schemas import (
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenRefreshRequest,
    UserResponse,
    UserUpdateRequest,
)
from app.utils.auth_utils import (
    blacklist_token,
    generate_token,
    get_current_user_id,
    get_user_info_from_redis,
    hash_password,
    security,
    verify_password,
)

user_router = APIRouter(tags=["user"], prefix="/user")
file_router = APIRouter(tags=["file"], prefix="/file")


def _user_to_response(user: User) -> UserResponse:
    return UserResponse(
        uuid=user.uuid,
        user_id=user.uuid,
        id=user.uuid,
        username=user.username,
        email=user.email,
        telephone=user.telephone,
        gender=user.gender,
        bio=user.bio,
        avatar=user.avatar,
        status=user.status,
        date_joined=user.date_joined,
        last_login=user.last_login,
        is_active=user.is_active,
    )


@user_router.post("/login/")
async def login(req: LoginRequest):
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(User).where(
                (User.username == req.username) | (User.email == req.email)
            )
        )
        user = result.scalar_one_or_none()

        if not user:
            raise HTTPException(status_code=400, detail="用户名或邮箱不存在")

        if not verify_password(req.password, user.password):
            raise HTTPException(status_code=400, detail="密码错误")

        if user.status != UserStatusChoice.ACTIVE:
            raise HTTPException(status_code=400, detail="用户状态异常，请检查是否激活或已被锁定")

        user.last_login = datetime.now()
        await session.commit()

    token, expire_time = generate_token(user.uuid, user.username, user.email)
    return {
        "message": f"{user.username} 登录成功",
        "user": _user_to_response(user).model_dump(),
        "token": token,
    }


@user_router.post("/register/")
async def register(req: RegisterRequest):
    if req.password != req.confirm_password:
        raise HTTPException(status_code=400, detail={"confirm_password": "密码和确认密码不一致"})

    async with AsyncSessionLocal() as session:
        existing = await session.execute(select(User).where(User.email == req.email))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail={"email": "该邮箱已被注册"})

        if req.telephone:
            existing_phone = await session.execute(select(User).where(User.telephone == req.telephone))
            if existing_phone.scalar_one_or_none():
                raise HTTPException(status_code=400, detail={"telephone": "该电话号码已被注册"})

        user = User(
            username=req.username,
            email=req.email,
            telephone=req.telephone,
            password=hash_password(req.password),
            status=UserStatusChoice.ACTIVE,
            is_active=True,
        )
        session.add(user)
        await session.commit()
        # ⚠️ commit 后 refresh：date_joined 是 server_default 列，ORM 在 INSERT 时
        # 不知道其值；不 refresh 的话，with 块退出（session 关闭）后访问该属性
        # 会触发懒加载 → DetachedInstanceError（注册接口曾 500）
        await session.refresh(user)

    token, expire_time = generate_token(user.uuid, user.username, user.email)
    return {
        "status": 201,
        "message": f"{user.username} 注册成功",
        "user": _user_to_response(user).model_dump(),
        "token": token,
    }


@user_router.post("/reset-password/")
async def reset_password(
    req: ResetPasswordRequest,
    user_id: str = Depends(get_current_user_id),
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    if req.new_password != req.confirm_password:
        raise HTTPException(status_code=400, detail="新密码和确认密码不一致")

    if req.new_password == req.old_password:
        raise HTTPException(status_code=400, detail="新密码不能和旧密码相同")

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.uuid == user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=400, detail="用户不存在")

        if not verify_password(req.old_password, user.password):
            raise HTTPException(status_code=400, detail="请检查旧密码是否正确")

        await blacklist_token(credentials.credentials)
        user.password = hash_password(req.new_password)
        await session.commit()

    redis = await _connect_redis()
    await redis.delete(f"user:{user_id}")

    new_token, expire_time = generate_token(user.uuid, user.username, user.email)
    return {"message": "密码重置成功", "token": new_token}


@user_router.post("/refresh-token/")
async def refresh_token(req: TokenRefreshRequest):
    from app.utils.auth_utils import decode_django_jwt as _decode
    payload = _decode(req.token)
    if not payload:
        raise HTTPException(status_code=401, detail="Token无效")

    user_id = payload.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token中未包含用户信息")

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.uuid == user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=401, detail="用户不存在")

        if user.status != UserStatusChoice.ACTIVE:
            raise HTTPException(status_code=401, detail="用户状态异常")

    await blacklist_token(req.token)
    new_token, expire_time = generate_token(user.uuid, user.username, user.email)
    return {"message": "Token刷新成功", "token": new_token, "expire_time": expire_time}


@user_router.get("/detail/")
async def get_user_info(
    user_id: str = Depends(get_current_user_id),
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    user_info = await get_user_info_from_redis(user_id, credentials)
    return {
        "success": True,
        "message": "获取用户详情成功",
        "data": user_info,
    }


@user_router.put("/update/")
async def update_user(
    req: UserUpdateRequest,
    user_id: str = Depends(get_current_user_id),
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.uuid == user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=400, detail="用户不存在")

        if req.telephone:
            existing = await session.execute(
                select(User).where(User.telephone == req.telephone, User.uuid != user_id)
            )
            if existing.scalar_one_or_none():
                raise HTTPException(status_code=400, detail={"telephone": "该电话号码已被注册"})

        update_data = req.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(user, field, value)
        await session.commit()

    await blacklist_token(credentials.credentials)
    redis = await _connect_redis()
    await redis.delete(f"user:{user_id}")

    new_token, expire_time = generate_token(user.uuid, user.username, user.email)
    return {
        "message": "用户信息更新成功",
        "user": _user_to_response(user).model_dump(),
        "token": new_token,
    }


@user_router.post("/logout/")
async def logout(credentials: HTTPAuthorizationCredentials = Depends(security)):
    await blacklist_token(credentials.credentials)
    return {"message": "用户注销成功"}


class SettingsUpdateRequest(BaseModel):
    """云端设置更新请求：字段为 None 表示不更新"""
    pet_config: dict | None = None
    habit_config: dict | None = None


@user_router.get("/settings/")
async def get_user_settings(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """
    获取云端偏好/养成数据（小卷养成 + 打卡任务）。
    仅查 MySQL，不依赖 Redis；无记录时返回 None。
    """
    from app.models.user_model import UserSetting

    result = await db.execute(select(UserSetting).where(UserSetting.user_id == user_id))
    row = result.scalar_one_or_none()
    return {
        "pet_config": row.pet_config if row else None,
        "habit_config": row.habit_config if row else None,
    }


@user_router.put("/settings/")
async def put_user_settings(
    payload: SettingsUpdateRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """保存云端偏好/养成数据（upsert：仅更新非 None 字段）。"""
    from sqlalchemy import update

    from app.models.user_model import UserSetting

    result = await db.execute(select(UserSetting).where(UserSetting.user_id == user_id))
    row = result.scalar_one_or_none()

    if row is None:
        row = UserSetting(user_id=user_id)
        db.add(row)

    if payload.pet_config is not None:
        row.pet_config = payload.pet_config
    if payload.habit_config is not None:
        row.habit_config = payload.habit_config

    await db.commit()
    return {"message": "设置已保存"}


MEDIA_DIR = None


def _get_media_dir():
    global MEDIA_DIR
    if MEDIA_DIR is None:
        MEDIA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "media")
    os.makedirs(os.path.join(MEDIA_DIR, "img"), exist_ok=True)
    return MEDIA_DIR


@file_router.post("/upload/")
async def upload_file(
    file: UploadFile,
    user_id: str = Depends(get_current_user_id),
):
    media_dir = _get_media_dir()
    filename = short_uuid() + os.path.splitext(file.filename or ".bin")[1]
    filepath = os.path.join(media_dir, "img", filename)

    try:
        content = await file.read()
        with open(filepath, "wb") as f:
            f.write(content)
    except Exception as e:
        logger.error(f"文件上传失败: {e}")
        raise HTTPException(status_code=500, detail="图片上传失败")

    file_url = f"/media/img/{filename}"

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.uuid == user_id))
        user = result.scalar_one_or_none()
        if user:
            user.avatar = file_url
            await session.commit()
            redis = await _connect_redis()
            await redis.delete(f"user:{user_id}")

    return {
        "success": True,
        "data": {
            "url": file_url,
            "alt": "当前加载较为缓慢，请稍后重试",
            "href": file_url,
        },
    }
