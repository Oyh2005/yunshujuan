import client from './client'
import { endpoints } from './endpoints'
import type { ApiResponse, LeaderboardData, StatsDashboard } from '../types/api'

export interface PeriodBlock {
  notes: number
  chars: number
  reviews: number
  prev_notes: number
  prev_chars: number
  prev_reviews: number
}

export interface PeriodStats {
  week: PeriodBlock
  month: PeriodBlock
}

export const statsApi = {
  /** 知识仪表盘聚合统计 */
  dashboard: async () => {
    const res = await client.get<ApiResponse<StatsDashboard>>(endpoints.statsDashboard)
    return res.data
  },

  /** 周报/月报聚合（本期 + 上期，环比前端计算） */
  period: async () => {
    const res = await client.get<ApiResponse<PeriodStats>>(endpoints.statsPeriod)
    return res.data
  },

  /** 排行榜（本周写作/回顾 Top10） */
  leaderboard: async () => {
    const res = await client.get<ApiResponse<LeaderboardData>>(endpoints.leaderboard)
    return res.data
  },
}
