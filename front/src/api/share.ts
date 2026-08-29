import client from './client'
import { endpoints } from './endpoints'

/** 公开笔记作者（后端只返回展示字段，不含邮箱/手机号） */
export interface PublicAuthor {
  id: string
  username: string
  avatar: string | null
  bio: string | null
  public_note_count: number
}

export interface PublicNote {
  title: string
  content: string
  tags: string[]
  category: string | null
  created_at: string | null
  updated_at: string | null
  view_count: number
  /** 后端未返回作者时（旧版本或未 join）为 null，前端需容错 */
  author: PublicAuthor | null
}

export const shareApi = {
  /** 获取公开笔记（免鉴权，浏览计数 +1） */
  get: async (id: string) => {
    const res = await client.get<PublicNote>(endpoints.shareNote(id))
    return res.data
  },
}
