"""WebSocket 端点（私聊实时通道）。

- 端点：`/ws/chat?token=<jwt>`（浏览器 WebSocket 无法带 Authorization 头，token 走 query）
- 鉴权失败 close(4001)；心跳 60s 无消息断开（前端 30s ping）
- 协议（JSON）：
  客户端→服务端：{type:"ping"}
  服务端→客户端：{type:"pong"} / {type:"message", ...} / {type:"read", conversation_id} / {type:"unread", count}
"""

import asyncio
import json

from fastapi import Query, WebSocket, WebSocketDisconnect
from fastapi.routing import APIRouter

from app.core.logger_handler import logger
from app.core.ws_manager import ws_manager
from app.utils.auth_utils import decode_django_jwt

ws_router = APIRouter(prefix="/ws", tags=["websocket"])

# 心跳超时：60s 无任何消息则断开（前端每 30s ping）
HEARTBEAT_TIMEOUT = 60


@ws_router.websocket("/chat")
async def chat_websocket(websocket: WebSocket, token: str = Query(...)):
    """私聊实时通道：登录用户连接后接收新消息/已读/未读推送。"""
    payload = decode_django_jwt(token)
    user_id = payload.get("user_id") if payload else None
    if not user_id:
        await websocket.close(code=4001, reason="invalid token")
        return

    await ws_manager.connect(user_id, websocket)
    logger.info(f"WS 连接建立：user={user_id}，在线 {ws_manager.stats()['users']} 人")
    # 新连接：推送当前在线列表（前端过滤会话好友）+ 广播上线
    try:
        await websocket.send_text(json.dumps({
            "type": "online_list",
            "users": ws_manager.online_users(),
        }))
        # 上线广播排除自己（避免自己收到自己的 online 事件）
        await ws_manager.broadcast({"type": "online", "user_id": user_id}, exclude_user_id=user_id)
    except Exception:
        pass
    try:
        while True:
            try:
                raw = await asyncio.wait_for(websocket.receive_text(), timeout=HEARTBEAT_TIMEOUT)
            except asyncio.TimeoutError:
                break  # 心跳超时断开
            except WebSocketDisconnect:
                break
            try:
                data = json.loads(raw)
            except Exception:
                continue
            if data.get("type") == "ping":
                try:
                    await websocket.send_text(json.dumps({"type": "pong"}))
                except Exception:
                    break
            elif data.get("type") == "typing" and data.get("to"):
                # 转发"正在输入"给目标用户（不落库，纯实时状态）
                await ws_manager.send_to_user(data["to"], {"type": "typing", "from": user_id})
    except WebSocketDisconnect:
        pass
    finally:
        still_online = await ws_manager.disconnect(user_id, websocket)
        if not still_online:
            # 完全下线才广播 offline（多标签页关闭一个不误报）
            await ws_manager.broadcast({"type": "offline", "user_id": user_id})
        logger.info(f"WS 连接断开：user={user_id}，在线 {ws_manager.stats()['users']} 人")
