import { useCallback, useEffect, useRef } from 'react'
import { useChatStore } from '../stores/useChatStore'
import type { ChatMessage } from '../api/messages'

export interface ChatSocketEvents {
  onMessage?: (message: ChatMessage) => void
  onRead?: (conversationId: string) => void
  onRecall?: (messageId: number, conversationId: string) => void
  onTyping?: (fromUserId: string) => void
  onOnline?: (userId: string) => void
  onOffline?: (userId: string) => void
  onOnlineList?: (userIds: string[]) => void
}

type Listener = (data: Record<string, unknown>) => void

// ── 模块级单例连接：登录后任意页面保持在线（好友实时可见），所有订阅者共享同一 WS ──
// 生命周期由订阅者引用计数管理：首个订阅者建立连接，全部卸载后关闭（登出即下线）。
interface SharedConnection {
  ws: WebSocket | null
  listeners: Set<Listener>
  heartbeat: number | null
  reconnectTimer: number | null
  retry: number
  closed: boolean
}

let shared: SharedConnection | null = null

function startConnection(): void {
  const conn = shared
  if (!conn || conn.closed) return
  const token = localStorage.getItem('jwt_token')
  if (!token) return
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const ws = new WebSocket(`${protocol}://${window.location.host}/ws/chat?token=${encodeURIComponent(token)}`)
  conn.ws = ws

  ws.onopen = () => {
    conn.retry = 0
    conn.heartbeat = window.setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }))
    }, 30000)
  }

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data as string) as Record<string, unknown>
      // 逐个订阅者分发，各自只处理自己注册的事件
      for (const listener of [...conn.listeners]) listener(data)
    } catch {
      // 非 JSON 消息忽略
    }
  }

  ws.onclose = () => {
    if (conn.heartbeat !== null) {
      window.clearInterval(conn.heartbeat)
      conn.heartbeat = null
    }
    conn.ws = null
    if (conn.closed) return
    // 指数退避重连：1s → 2s → 4s … 封顶 30s
    const delay = Math.min(30_000, 1000 * 2 ** conn.retry)
    conn.retry += 1
    conn.reconnectTimer = window.setTimeout(startConnection, delay)
  }
}

function stopConnection(): void {
  const conn = shared
  if (!conn) return
  conn.closed = true
  if (conn.heartbeat !== null) window.clearInterval(conn.heartbeat)
  if (conn.reconnectTimer !== null) window.clearTimeout(conn.reconnectTimer)
  conn.ws?.close()
  conn.ws = null
  conn.listeners.clear()
  shared = null
}

/**
 * 私聊 WebSocket hook：登录后全局保持连接（指数退避重连 1s→30s 封顶、30s 心跳保活）；
 * 多个调用方共享同一连接，各自只响应注册的事件；
 * unread 事件直接更新全局 useChatStore（侧边栏红点）。
 * 提供 sendTyping（正在输入提示）发送能力。
 */
export function useChatSocket(events: ChatSocketEvents, enabled = true) {
  const setUnread = useChatStore((s) => s.setUnread)
  // 事件回调随最新渲染更新（同步 ref 放 effect，遵守渲染期禁写 ref 规则）
  const eventsRef = useRef(events)
  useEffect(() => {
    eventsRef.current = events
  }, [events])

  useEffect(() => {
    if (!enabled) return
    const conn = shared ?? (shared = { ws: null, listeners: new Set(), heartbeat: null, reconnectTimer: null, retry: 0, closed: false })
    const listener: Listener = (data) => {
      if (data.type === 'message' && data.message) {
        eventsRef.current.onMessage?.(data.message as ChatMessage)
      } else if (data.type === 'read') {
        eventsRef.current.onRead?.(data.conversation_id as string)
      } else if (data.type === 'recall') {
        eventsRef.current.onRecall?.(Number(data.message_id), data.conversation_id as string)
      } else if (data.type === 'typing') {
        eventsRef.current.onTyping?.(data.from as string)
      } else if (data.type === 'online') {
        eventsRef.current.onOnline?.(data.user_id as string)
      } else if (data.type === 'offline') {
        eventsRef.current.onOffline?.(data.user_id as string)
      } else if (data.type === 'online_list') {
        eventsRef.current.onOnlineList?.(Array.isArray(data.users) ? data.users as string[] : [])
      } else if (data.type === 'unread') {
        setUnread(Number(data.count) || 0)
      }
    }
    conn.listeners.add(listener)
    if (!conn.ws && !conn.closed) startConnection()
    return () => {
      conn.listeners.delete(listener)
      // 全部订阅者卸载（登出/未登录）→ 关闭连接，后端广播离线
      if (conn.listeners.size === 0) stopConnection()
    }
  }, [enabled, setUnread])

  /** 发送"正在输入"（由调用方节流，如 3s 一次） */
  const sendTyping = useCallback((toUserId: string) => {
    const ws = shared?.ws
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'typing', to: toUserId }))
    }
  }, [])

  return { sendTyping }
}
