import { useId, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { StatsTrendItem } from '../../types/api'

const W = 640, H = 225, LEFT = 42, RIGHT = 16, TOP = 22, BOTTOM = 30
const keyOf = (date: Date) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')

/** Real rolling 30-day counts. Missing dates are zero; no synthetic smoothing or growth. */
export default function TrendChart({ trend }: { trend: StatsTrendItem[] }) {
  const { t } = useTranslation()
  const gradient = useId()
  const points = useMemo(() => {
    const map = new Map(trend.map((item) => [item.date, item.chars]))
    return Array.from({ length: 30 }, (_, i) => {
      const date = new Date()
      date.setHours(0, 0, 0, 0)
      date.setDate(date.getDate() - (29 - i))
      return { date: keyOf(date), label: (date.getMonth() + 1) + '-' + date.getDate(), chars: map.get(keyOf(date)) ?? 0 }
    })
  }, [trend])
  const max = Math.max(...points.map((p) => p.chars), 1)
  const coords = points.map((p, i) => ({ ...p, x: LEFT + i / 29 * (W - LEFT - RIGHT), y: H - BOTTOM - p.chars / max * (H - TOP - BOTTOM) }))
  const path = coords.map((p, i) => (i ? 'L' : 'M') + p.x + ',' + p.y).join(' ')
  const hasData = points.some((p) => p.chars > 0)
  return <svg viewBox={'0 0 ' + W + ' ' + H} className="w-full h-auto" role="img" aria-label={t('stats.trendTitle')}>
    <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#9670EC" stopOpacity=".28" /><stop offset="100%" stopColor="#9670EC" stopOpacity=".02" /></linearGradient></defs>
    {[0, .5, 1].map((ratio) => <g key={ratio}><line x1={LEFT} x2={W - RIGHT} y1={TOP + (1 - ratio) * (H - TOP - BOTTOM)} y2={TOP + (1 - ratio) * (H - TOP - BOTTOM)} stroke="var(--color-border)" strokeDasharray="3 5" /><text x={LEFT - 8} y={TOP + (1 - ratio) * (H - TOP - BOTTOM) + 4} fontSize={10} fill="var(--color-text-tertiary)" textAnchor="end">{Math.round(max * ratio)}</text></g>)}
    {hasData ? <>
      <path d={path + ' L' + (W - RIGHT) + ',' + (H - BOTTOM) + ' L' + LEFT + ',' + (H - BOTTOM) + ' Z'} fill={'url(#' + gradient + ')'} />
      <path d={path} fill="none" stroke="var(--color-accent)" strokeWidth={2.5} strokeLinejoin="round" />
      {coords.map((point) => <circle key={point.date} cx={point.x} cy={point.y} r={3} fill="var(--color-card)" stroke="var(--color-accent)" strokeWidth={1.7}><title>{t('stats.charsTooltip', { date: point.date, chars: point.chars })}</title></circle>)}
    </> : <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={12} fill="var(--color-text-tertiary)">{t('stats.empty')}</text>}
    {coords.filter((_, i) => i % 5 === 0 || i === 29).map((point) => <text key={point.date} x={point.x} y={H - 8} textAnchor="middle" fontSize={10} fill="var(--color-text-tertiary)">{point.label}</text>)}
  </svg>
}
