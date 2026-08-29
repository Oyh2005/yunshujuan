import { create } from 'zustand'

interface ChatState {
  /** 私聊未读消息总数（侧边栏红点） */
  unread: number
  setUnread: (count: number) => void
}

/**
 * 私聊未读全局状态：WS 推送即时更新 + 侧边栏 30s 轮询兜底。
 */
export const useChatStore = create<ChatState>((set) => ({
  unread: 0,
  setUnread: (count) => set({ unread: count }),
}))
