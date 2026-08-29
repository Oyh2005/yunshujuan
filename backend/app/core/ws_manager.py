"""WebSocket 连接管理器（私聊实时推送）。

- 维护 user_id → set[WebSocket]（多标签页广播）
- 发送失败静默（断开的连接由心跳超时清理，推送不能成为故障源）
"""

import asyncio
import json

from fastapi import WebSocket

from app.core.logger_handler import logger


class WSConnectionManager:
    def __init__(self):
        self._conns: dict[str, set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, user_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._conns.setdefault(user_id, set()).add(websocket)

    async def disconnect(self, user_id: str, websocket: WebSocket) -> None:
        async with self._lock:
            conns = self._conns.get(user_id)
            if not conns:
                return
            conns.discard(websocket)
            if not conns:
                self._conns.pop(user_id, None)

    def is_online(self, user_id: str) -> bool:
        return bool(self._conns.get(user_id))

    async def send_to_user(self, user_id: str, payload: dict) -> None:
        """向用户的所有连接推送 JSON；无连接/发送失败静默。"""
        conns = self._conns.get(user_id)
        if not conns:
            return
        text = json.dumps(payload, ensure_ascii=False, default=str)
        for websocket in list(conns):
            try:
                await websocket.send_text(text)
            except Exception:
                # 连接可能已失效，交给心跳/断线清理
                pass

    async def broadcast(self, payload: dict) -> None:
        """向全部在线用户广播（预留：公告等）。"""
        text = json.dumps(payload, ensure_ascii=False, default=str)
        for user_id in list(self._conns.keys()):
            await self.send_to_user(user_id, json.loads(text))

    def stats(self) -> dict:
        return {"users": len(self._conns), "connections": sum(len(v) for v in self._conns.values())}


ws_manager = WSConnectionManager()

# 启动时打印一次连接统计（调试用）
async def log_ws_stats() -> None:
    logger.info(f"WS 连接管理器就绪：{ws_manager.stats()}")
