import client from './client'
import { endpoints } from './endpoints'
import type { ApiResponse } from '../types/api'

export interface ChatPeer {
  user_id: string
  username: string
  avatar: string | null
}

export interface ChatConversation {
  conversation_id: string
  peer: ChatPeer
  last_message: string
  last_sender_id: string | null
  last_message_at: string | null
  unread: number
  is_pinned: boolean
}

export interface ChatMessage {
  id: number
  conversation_id: string
  sender_id: string
  message_type?: 'text' | 'image'
  content: string
  reply_to_id?: number | null
  reply_content?: string | null
  recalled?: boolean
  read: boolean
  created_at: string | null
  /** 本地发送状态（仅前端乐观更新用，服务端无此字段） */
  status?: 'sending' | 'failed'
}

interface ConversationListData {
  conversations: ChatConversation[]
}

interface HistoryData {
  messages: ChatMessage[]
  has_more: boolean
  conversation_id: string | null
}

/** 私聊 API（好友私信，P0）。命名 messagesApi 避开 AI 对话的 chatApi。 */
export const messagesApi = {
  /** 会话列表（对方信息 + 最后消息 + 未读数） */
  conversations: async () => {
    const res = await client.get<ApiResponse<ConversationListData>>(endpoints.chatConversations)
    return res.data.data ?? { conversations: [] }
  },

  /** 与某用户的历史消息（游标分页，返回时间正序） */
  history: async (peerId: string, cursor?: number, limit = 30) => {
    const res = await client.get<ApiResponse<HistoryData>>(endpoints.chatMessages(peerId), {
      params: { cursor, limit },
    })
    return res.data.data ?? { messages: [], has_more: false, conversation_id: null }
  },

  /** 发送私聊消息 */
  send: async (peerId: string, content: string, messageType: 'text' | 'image' = 'text', replyToId?: number) => {
    const res = await client.post<ApiResponse<{ message: ChatMessage }>>(endpoints.chatSend(peerId), { content, message_type: messageType, reply_to_id: replyToId })
    return res.data.data?.message
  },

  /** 撤回消息（2 分钟内，仅本人） */
  recall: async (peerId: string, messageId: number) => {
    const res = await client.post<ApiResponse<{ message: ChatMessage }>>(endpoints.chatRecall(peerId, messageId))
    return res.data.data?.message
  },

  /** 上传聊天图片 → 返回 /media 图片 URL */
  uploadImage: async (file: File) => {
    const form = new FormData()
    form.append('file', file)
    const res = await client.post<ApiResponse<{ url: string; filename: string }>>(endpoints.chatUploadImage, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return res.data.data
  },

  /** 标记与某用户的会话已读，返回最新未读总数 */
  markRead: async (peerId: string) => {
    const res = await client.post<ApiResponse<{ unread: number }>>(endpoints.chatRead(peerId))
    return res.data.data?.unread ?? 0
  },

  /** 私聊未读总数（侧边栏红点） */
  unreadCount: async () => {
    const res = await client.get<ApiResponse<{ count: number }>>(endpoints.chatUnreadCount)
    return res.data.data?.count ?? 0
  },

  /** 会话个人设置（置顶/删除会话，个人视角） */
  setSetting: async (peerId: string, setting: { is_pinned?: boolean; hidden?: boolean }) => {
    const res = await client.patch<ApiResponse<{ is_pinned: boolean; is_hidden: boolean }>>(endpoints.chatConversations + `/${peerId}`, setting)
    return res.data.data
  },
}
