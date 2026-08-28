import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

/** Purple intensity encodes activity; zero uses the current theme surface. */
const HEAT_COLORS = ['#E2D7FA', '#C3A5F4', '#9C71E8', '#7043C7']
const DAY_MS = 24 * 60 * 60 * 1000
const WEEKS = 53
const DAYS_IN_WEEK = 7

/** 计数 → 色级（0-4） */
function levelFor(count: number): number {
  if (count <= 0) return 0
  if (count === 1) return 1
  if (count <= 3) return 2
  if (count <= 6) return 3
  return 4
}

function toKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

interface HeatCell {
  /** null = 范围外占位格 */
  date: Date | null
  count: number
}

/**
 * GitHub 风格写作热力图：近 365 天，53 周 × 7 天网格。
 * 列 = 周（周一起始），5 级颜色，悬停显示「日期：N 篇」。
 */
export default function Heatmap({ data }: { data: Record<string, number> }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language?.startsWith('zh') ? 'zh-CN' : 'en-US'

  const { columns, monthLabels } = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const start = new Date(today.getTime() - (365 - 1) * DAY_MS)

    // 对齐到起始日所在周的周一（保证列首不晚于 start）
    const firstCol = new Date(start)
    firstCol.setDate(firstCol.getDate() - ((start.getDay() + 6) % 7))

    const cols: HeatCell[][] = []
    const labels: (string | null)[] = []
    let lastMonth = -1

    for (let w = 0; w < WEEKS; w++) {
      const col: HeatCell[] = []
      for (let r = 0; r < DAYS_IN_WEEK; r++) {
        const d = new Date(firstCol.getTime() + (w * DAYS_IN_WEEK + r) * DAY_MS)
        if (d < start || d > today) {
          col.push({ date: null, count: 0 })
        } else {
          col.push({ date: d, count: data[toKey(d)] ?? 0 })
        }
      }
      cols.push(col)
      // 月份标签：该列首日所在月份变化时显示
      const colDate = new Date(firstCol.getTime() + w * DAYS_IN_WEEK * DAY_MS)
      const ym = colDate.getFullYear() * 100 + colDate.getMonth()
      if (ym !== lastMonth) {
        lastMonth = ym
        labels.push(
          colDate.toLocaleDateString(lang, { month: 'short' })
        )
      } else {
        labels.push(null)
      }
    }
    // The first partial month may occupy only one column; avoid colliding labels.
    if (labels.slice(1, 3).some(Boolean)) labels[0] = null
    return { columns: cols, monthLabels: labels }
  }, [data, lang])

  return (
    <div className="knowledge-heatmap">
      {/* 月份标签行 */}
      <div className="flex gap-[3px] mb-1">
        {monthLabels.map((label, i) => (
          <div key={i} className="flex-1 min-w-0 relative h-5 text-[10px] text-[var(--color-text-tertiary)]">
            <span className="absolute left-0 top-0 whitespace-nowrap">{label ?? ''}</span>
          </div>
        ))}
      </div>

      {/* 53 列 × 7 行网格 */}
      <div className="flex gap-[3px]">
        {columns.map((col, ci) => (
          <div key={ci} className="flex-1 flex flex-col gap-[3px]">
            {col.map((cell, ri) => {
              if (!cell.date) {
                return <div key={ri} className="aspect-square rounded-[2px]" />
              }
              const level = levelFor(cell.count)
              return (
                <div
                  key={ri}
                  className="group relative aspect-square rounded-[3px] cursor-default"
                  title={t('stats.heatmapTooltip', { date: toKey(cell.date), count: cell.count })}
                  style={{
                    backgroundColor: level === 0 ? 'var(--color-bg-tertiary)' : HEAT_COLORS[level - 1],
                  }}
                >
                  {/* 悬停提示 */}
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-[var(--color-text)] px-2 py-1 text-[11px] text-[var(--color-bg)] shadow-lg group-hover:block">
                    {t('stats.heatmapTooltip', { date: toKey(cell.date), count: cell.count })}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* 图例 */}
      <div className="mt-2.5 flex items-center justify-end gap-1.5 text-[10px] text-[var(--color-text-tertiary)]">
        <span>{t('stats.less')}</span>
        {[0, 1, 2, 3, 4].map((lv) => (
          <span
            key={lv}
            className="h-[10px] w-[10px] rounded-[2px]"
            style={{ backgroundColor: lv === 0 ? 'var(--color-bg-tertiary)' : HEAT_COLORS[lv - 1] }}
          />
        ))}
        <span>{t('stats.more')}</span>
      </div>
    </div>
  )
}
