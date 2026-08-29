import { create } from 'zustand'

interface ChatState {
  /** 私聊未读消息总数（侧边栏红点） */
  unread: number
  setUnread: (count: number) => void
  /** 在线好友集合（全局 WS 连接维护：登录网站任意页面即在线，好友实时可见） */
  onlineUsers: Set<string>
  setOnlineUsers: (ids: string[]) => void
  addOnlineUser: (id: string) => void
  removeOnlineUser: (id: string) => void
}

/**
 * 私聊全局状态：未读总数（WS 推送即时更新 + 侧边栏 30s 轮询兜底）+
 * 在线好友集合（MainLayout 挂载的全局 WS 维护，私信页/好友页共享读取）。
 */
export const useChatStore = create<ChatState>((set) => ({
  unread: 0,
  setUnread: (count) => set({ unread: count }),
  onlineUsers: new Set<string>(),
  setOnlineUsers: (ids) => set({ onlineUsers: new Set(ids) }),
  addOnlineUser: (id) =>
    set((s) => (s.onlineUsers.has(id) ? s : { onlineUsers: new Set(s.onlineUsers).add(id) })),
  removeOnlineUser: (id) =>
    set((s) => {
      if (!s.onlineUsers.has(id)) return s
      const next = new Set(s.onlineUsers)
      next.delete(id)
      return { onlineUsers: next }
    }),
}))
