import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { StatsTrendItem } from '../../types/api'

const DAY_MS = 24 * 60 * 60 * 1000
const TREND_DAYS = 30

/** 画布尺寸（viewBox 固定，width 100% 自适应） */
const W = 640
const H = 210
const PAD_T = 26
const PAD_B = 28
const PAD_L = 6
const PAD_R = 6
const CHART_H = H - PAD_T - PAD_B
const BAR_GAP = 3

function toKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * 近 30 天写作字数柱状图（自绘 SVG）。
 * 后端只返回有笔记的日期，此处补全 30 天（缺失日期按 0 计）。
 */
export default function TrendChart({ trend }: { trend: StatsTrendItem[] }) {
  const { t } = useTranslation()

  const { bars, maxChars, hasData } = useMemo(() => {
    const map = new Map(trend.map((x) => [x.date, x.chars]))
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const days: { date: Date; chars: number }[] = []
    for (let i = TREND_DAYS - 1; i >= 0; i--) {
      const d = new Date(today.getTime() - i * DAY_MS)
      days.push({ date: d, chars: map.get(toKey(d)) ?? 0 })
    }
    const maxChars = Math.max(...days.map((d) => d.chars), 1)
    return {
      bars: days,
      maxChars,
      hasData: days.some((d) => d.chars > 0),
    }
  }, [trend])

  const barW = (W - PAD_L - PAD_R - BAR_GAP * (bars.length - 1)) / bars.length

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={t('stats.trendTitle')}>
      {/* 基线 */}
      <line x1={PAD_L} y1={PAD_T + CHART_H} x2={W - PAD_R} y2={PAD_T + CHART_H} stroke="var(--color-border)" strokeWidth={1} />

      {hasData ? (
        bars.map((bar, i) => {
          const h = (bar.chars / maxChars) * CHART_H
          const x = PAD_L + i * (barW + BAR_GAP)
          const y = PAD_T + CHART_H - h
          const showLabel = i % 5 === 0
          return (
            <g key={i}>
              <title>{t('stats.charsTooltip', { date: toKey(bar.date), chars: bar.chars })}</title>
              {bar.chars > 0 && (
                <>
                  <rect
                    x={x}
                    y={y}
                    width={barW}
                    height={h}
                    rx={2}
                    fill={bar.chars >= maxChars ? '#1f6c9f' : 'var(--color-accent)'}
                    opacity={0.85}
                  />
                  {/* 柱顶数值 */}
                  <text
                    x={x + barW / 2}
                    y={y - 4}
                    textAnchor="middle"
                    fontSize={9}
                    fill="var(--color-text-tertiary)"
                  >
                    {bar.chars}
                  </text>
                </>
              )}
              {showLabel && (
                <text
                  x={x + barW / 2}
                  y={PAD_T + CHART_H + 16}
                  textAnchor="middle"
                  fontSize={9}
                  fill="var(--color-text-tertiary)"
                >
                  {`${bar.date.getMonth() + 1}-${bar.date.getDate()}`}
                </text>
              )}
            </g>
          )
        })
      ) : (
        <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={12} fill="var(--color-text-tertiary)">
          {t('stats.empty')}
        </text>
      )}
    </svg>
  )
}
