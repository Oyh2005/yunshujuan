import client from './client'
import { endpoints } from './endpoints'
import type { ApiResponse } from '../types/api'

export interface CloudSettings {
  pet_config: Record<string, unknown> | null
  habit_config: Record<string, unknown> | null
}

export const settingsApi = {
  /** 获取云端养成数据（小卷 + 打卡） */
  get: async () => {
    const res = await client.get<ApiResponse<CloudSettings>>(endpoints.userSettings)
    return res.data
  },

  /** 保存云端养成数据（字段为 null 表示不更新） */
  put: async (data: { pet_config?: Record<string, unknown>; habit_config?: Record<string, unknown> }) => {
    const res = await client.put<ApiResponse<null>>(endpoints.userSettings, data)
    return res.data
  },
}
