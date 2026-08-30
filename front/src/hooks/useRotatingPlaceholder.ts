import { useEffect, useState } from 'react'

/**
 * 占位文案轮播（P0-4）：active 期间每 intervalMs 切换一个文案（循环）。
 *
 * 用于思考等待期等「真实进度不可知」的空档（如 Agent 首轮模型调用 2.7~11.2s、
 * 首个 thinking 事件到达前的路由判断），把固定 spinner 升级为分步骤占位文案，
 * 减少"卡住不动"的观感。返回 tick（递增计数）供调用方判断"多久没有新事件"。
 */
export function useRotatingPlaceholder(
  texts: readonly string[],
  active: boolean,
  intervalMs = 1600,
): { text: string; tick: number } {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!active || texts.length === 0) return
    const timer = window.setInterval(() => {
      setTick((t) => t + 1)
    }, intervalMs)
    return () => window.clearInterval(timer)
  }, [active, intervalMs, texts.length])

  return { text: texts.length > 0 ? texts[tick % texts.length] : '', tick }
}
