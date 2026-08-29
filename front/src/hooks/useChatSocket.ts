import { useEffect, useRef } from 'react'
import { useChatStore } from '../stores/useChatStore'
import type { ChatMessage } from '../api/messages'

export interface ChatSocketEvents {
  onMessage?: (message: ChatMessage) => void
  onRead?: (conversationId: string) => void
  onRecall?: (messageId: number, conversationId: string) => void
}

/**
 * 私聊 WebSocket hook：连接 /ws/chat?token=，指数退避自动重连（1s→30s 封顶），
 * 30s 心跳保活；unread 事件直接更新全局 useChatStore（侧边栏红点）。
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
    let ws: WebSocket | null = null
    let closed = false
    let retry = 0
    let heartbeat: number | null = null
    let reconnectTimer: number | null = null

    const connect = () => {
      const token = localStorage.getItem('jwt_token')
      if (!token || closed) return
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
      ws = new WebSocket(`${protocol}://${window.location.host}${'/ws/chat'}?token=${encodeURIComponent(token)}`)

      ws.onopen = () => {
        retry = 0
        heartbeat = window.setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }))
        }, 30000)
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string)
          if (data.type === 'message' && data.message) {
            eventsRef.current.onMessage?.(data.message as ChatMessage)
          } else if (data.type === 'read') {
            eventsRef.current.onRead?.(data.conversation_id as string)
          } else if (data.type === 'recall') {
            eventsRef.current.onRecall?.(Number(data.message_id), data.conversation_id as string)
          } else if (data.type === 'unread') {
            setUnread(Number(data.count) || 0)
          }
        } catch {
          // 非 JSON 消息忽略
        }
      }

      ws.onclose = () => {
        if (heartbeat !== null) {
          window.clearInterval(heartbeat)
          heartbeat = null
        }
        if (closed) return
        // 指数退避重连：1s → 2s → 4s … 封顶 30s
        const delay = Math.min(30_000, 1000 * 2 ** retry)
        retry += 1
        reconnectTimer = window.setTimeout(connect, delay)
      }
    }

    connect()
    return () => {
      closed = true
      if (heartbeat !== null) window.clearInterval(heartbeat)
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer)
      ws?.close()
    }
  }, [enabled, setUnread])
}
