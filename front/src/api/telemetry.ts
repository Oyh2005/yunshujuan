import axios from 'axios'

// 错误上报独立实例：不走全局拦截器（401 跳登录 / 429 toast 都不适合错误上报场景），
// 上报失败静默（错误监控本身不能打扰用户）
const telemetryClient = axios.create({
  baseURL: '',
  timeout: 8000,
  headers: { 'Content-Type': 'application/json' },
})

telemetryClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('jwt_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export interface ErrorPayload {
  kind: 'boundary' | 'unhandled' | 'rejection'
  message: string
  stack?: string
  page?: string
  detail?: Record<string, unknown>
}

// 节流：同一 kind 每 30s 最多上报一次，防错误风暴刷接口（后端另有 30/60s 限流兜底）
const lastReportAt: Record<string, number> = {}
const THROTTLE_MS = 30_000

export function reportError(payload: ErrorPayload) {
  try {
    const now = Date.now()
    if (now - (lastReportAt[payload.kind] ?? 0) < THROTTLE_MS) return
    lastReportAt[payload.kind] = now
    telemetryClient.post('/telemetry/error', {
      kind: payload.kind,
      message: payload.message.slice(0, 500),
      stack: payload.stack ? payload.stack.slice(0, 8192) : undefined,
      page: payload.page ? payload.page.slice(0, 200) : undefined,
      detail: payload.detail,
    }).catch(() => {})
  } catch {
    // 上报本身出错时静默
  }
}
