import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { StatsCategory } from '../../types/api'

/** 内置分类 → 固定色板 */
const CATEGORY_COLORS: Record<string, string> = {
  work: '#7C53E8', // 紫
  study: '#47A88D', // 绿
  life: '#DB87A7', // 粉
  project: '#6F95D9', // 蓝
  other: '#9CA3AF', // 灰
}
/** 未分类 */
const UNCAT_COLOR = '#C0C4CC'
/** 自定义分类兜底色板 */
const FALLBACK_COLORS = ['#5B8DB8', '#B07CC6', '#D98E4A', '#6BA37B', '#C97B84', '#7FA8A0']

const R = 64
const STROKE = 20
const CIRCUMFERENCE = 2 * Math.PI * R

export interface DonutSlice {
  key: string
  label: string
  color: string
  count: number
}

/**
 * 分类占比环形图（SVG stroke-dasharray）。
 * 中心显示笔记总数，右侧图例带数量与百分比。
 */
export default function CategoryDonut({
  categories,
  uncategorized,
  totalNotes,
}: {
  categories: StatsCategory[]
  uncategorized: number
  totalNotes: number
}) {
  const { t } = useTranslation()

  const slices = useMemo<DonutSlice[]>(() => {
    const catLabel = (c: string) => {
      const key = `stats.cat${c.charAt(0).toUpperCase()}${c.slice(1)}`
      const localized = t(key, { defaultValue: '' })
      return localized || c
    }
    const colorOf = (c: string, idx: number) =>
      CATEGORY_COLORS[c] ?? FALLBACK_COLORS[idx % FALLBACK_COLORS.length]

    const list: DonutSlice[] = categories.map((c, i) => ({
      key: c.category,
      label: catLabel(c.category),
      color: colorOf(c.category, i),
      count: c.count,
    }))
    if (uncategorized > 0) {
      list.push({ key: '__uncategorized__', label: t('stats.catUncategorized'), color: UNCAT_COLOR, count: uncategorized })
    }
    return list
  }, [categories, uncategorized, t])

  const total = Math.max(totalNotes, 1)

  // 计算每段 dash 与偏移（纯函数式，避免循环内可变累加）
  const segments = slices.map((s, i) => {
    const dash = (s.count / total) * CIRCUMFERENCE
    const prevSum = slices
      .slice(0, i)
      .reduce((sum, prev) => sum + (prev.count / total) * CIRCUMFERENCE, 0)
    return { ...s, dash, offset: -prevSum }
  })

  return (
    <div className="flex flex-wrap items-center justify-center gap-6">
      {/* 环形图 */}
      <div className="relative shrink-0">
        <svg width={170} height={170} viewBox="0 0 170 170" role="img" aria-label={t('stats.categoryTitle')}>
          <g transform="rotate(-90 85 85)">
            {/* 底色环 */}
            <circle cx={85} cy={85} r={R} fill="none" stroke="var(--color-bg-tertiary)" strokeWidth={STROKE} />
            {segments.map((s) => (
              <circle
                key={s.key}
                cx={85}
                cy={85}
                r={R}
                fill="none"
                stroke={s.color}
                strokeWidth={STROKE}
                strokeDasharray={`${Math.max(s.dash - 2, 0)} ${CIRCUMFERENCE}`}
                strokeDashoffset={s.offset}
                strokeLinecap="butt"
              >
                <title>{`${s.label}：${s.count}`}</title>
              </circle>
            ))}
          </g>
        </svg>
        {/* 中心总数 */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-bold text-[var(--color-text)] leading-none">{totalNotes}</span>
          <span className="text-[11px] text-[var(--color-text-tertiary)] mt-1">{t('stats.categoryCenter')}</span>
        </div>
      </div>

      {/* 图例 */}
      <div className="flex-1 min-w-[130px] space-y-1.5">
        {slices.map((s) => (
          <div key={s.key} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
            <span className="truncate text-[var(--color-text)]">{s.label}</span>
            <span className="ml-auto text-xs text-[var(--color-text-secondary)] shrink-0">
              {s.count}
              <span className="text-[var(--color-text-tertiary)] ml-1">
                {totalNotes > 0 ? `${Math.round((s.count / totalNotes) * 100)}%` : ''}
              </span>
            </span>
          </div>
        ))}
        {slices.length === 0 && (
          <p className="text-xs text-[var(--color-text-tertiary)] py-2">{t('stats.empty')}</p>
        )}
      </div>
    </div>
  )
}
