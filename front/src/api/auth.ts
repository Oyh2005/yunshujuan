import client from './client'
import { endpoints } from './endpoints'
import type { UserInfo } from '../types/api'

// Actual Django backend response shapes (not wrapped in ApiResponse)
interface LoginResponseData {
  message: string
  user: UserInfo
  token: string
}

interface RegisterResponseData {
  status: number
  message: string
  user: UserInfo
  token: string
}

interface ProfileResponseData {
  success: boolean
  message: string
  data: UserInfo
}

interface ActionResponseData {
  message: string
  user?: UserInfo
  token?: string
}

interface UploadResponseData {
  success: boolean
  data: { url: string; alt: string; href: string }
}

export const authApi = {
  login: async (username: string, password: string) => {
    const res = await client.post<LoginResponseData>(endpoints.login, { username, password })
    return res.data
  },

  register: async (data: { username: string; password: string; email: string; telephone?: string; confirm_password: string }) => {
    const res = await client.post<RegisterResponseData>(endpoints.register, data)
    return res.data
  },

  logout: async () => {
    const res = await client.post<ActionResponseData>(endpoints.logout)
    return res.data
  },

  getProfile: async () => {
    const res = await client.get<ProfileResponseData>(endpoints.profile)
    return res.data
  },

  updateProfile: async (data: Record<string, unknown>) => {
    const res = await client.put<ActionResponseData>(endpoints.userUpdate, data)
    return res.data
  },

  updatePassword: async (oldPassword: string, newPassword: string) => {
    const res = await client.post<ActionResponseData>(endpoints.changePassword, {
      old_password: oldPassword,
      new_password: newPassword,
      confirm_password: newPassword,
    })
    return res.data
  },

  uploadAvatar: async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    // 必须显式声明 multipart：client 默认头是 application/json，
    // axios 的 transformRequest 会在该头下把 FormData 转成 JSON 字符串，导致后端收不到 file 字段
    const res = await client.post<UploadResponseData>(endpoints.uploadFile, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return res.data
  },
}
