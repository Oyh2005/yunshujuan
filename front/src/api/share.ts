import client from './client'
import { endpoints } from './endpoints'

export interface PublicNote {
  title: string
  content: string
  tags: string[]
  category: string | null
  created_at: string | null
  updated_at: string | null
  view_count: number
}

export const shareApi = {
  /** 获取公开笔记（免鉴权，浏览计数 +1） */
  get: async (id: string) => {
    const res = await client.get<PublicNote>(endpoints.shareNote(id))
    return res.data
  },
}
