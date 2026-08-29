import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** 私聊字体大小（px）：默认 13 与气泡原字号一致，范围 12~20 */
export const CHAT_FONT_MIN = 12
export const CHAT_FONT_MAX = 20
export const CHAT_FONT_DEFAULT = 13

interface ChatFontState {
  size: number
  setSize: (size: number) => void
}

/** 聊天字体大小偏好（本地持久化，用户级 UI 设置，不同步云端） */
export const useChatFontStore = create<ChatFontState>()(
  persist(
    (set) => ({
      size: CHAT_FONT_DEFAULT,
      setSize: (size) => set({ size }),
    }),
    { name: 'chat-font-size' }
  )
)
