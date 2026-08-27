import client from './client'
import { endpoints } from './endpoints'
import type { ApiResponse, LeaderboardData, StatsDashboard } from '../types/api'

export const statsApi = {
  /** 知识仪表盘聚合统计 */
  dashboard: async () => {
    const res = await client.get<ApiResponse<StatsDashboard>>(endpoints.statsDashboard)
    return res.data
  },

  /** 排行榜（本周写作/回顾 Top10） */
  leaderboard: async () => {
    const res = await client.get<ApiResponse<LeaderboardData>>(endpoints.leaderboard)
    return res.data
  },
}
