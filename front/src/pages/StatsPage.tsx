import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FileText,
  PenLine,
  RotateCcw,
  CalendarCheck,
  CalendarRange,
  TrendingUp,
  Clock,
  MessageSquare,
  Library,
  Flame,
  Heart,
  BarChart3,
  RefreshCw,
} from 'lucide-react'
import { statsApi } from '../api/stats'
import type { StatsDashboard } from '../types/api'
import { usePetStore } from '../stores/usePetStore'
import { useHabitStore } from '../stores/useHabitStore'
import { FadeIn } from '../components/common/motion'
import LoadingSkeleton from '../components/common/LoadingSkeleton'
import Heatmap from '../components/stats/Heatmap'
import TrendChart from '../components/stats/TrendChart'
import CategoryDonut from '../components/stats/CategoryDonut'

/** 总字数格式化：万 / k */
function formatChars(n: number, lang: string): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}${lang.startsWith('zh') ? '万' : 'w'}`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

export default function StatsPage() {
  const { t, i18n } = useTranslation()
  const [data, setData] = useState<StatsDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const affection = usePetStore((s) => s.affection)
  const noteStreak = useHabitStore((s) => s.noteStreak)

  const load = useCallback(async () => {
    // 重试/刷新用：由事件处理器调用（内部先置 loading）
    try {
      const res = await statsApi.dashboard()
      setData(res.data ?? null)
      setError(false)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  // 首次加载：setState 均在异步回调中（避免 set-state-in-effect 规则报错）
  useEffect(() => {
    let cancelled = false
    statsApi
      .dashboard()
      .then((res) => {
        if (cancelled) return
        setData(res.data ?? null)
        setError(false)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleRefresh = () => {
    setLoading(true)
    setError(false)
    load()
  }

  const lang = i18n.language?.startsWith('zh') ? 'zh' : 'en'

  return (
    <div className="max-w-5xl mx-auto py-8 px-6">
      <FadeIn>
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-heading text-xl font-semibold text-[var(--color-text)] flex items-center gap-2">
            <BarChart3 size={22} className="text-[var(--color-accent)]" />
            {t('stats.title')}
          </h1>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="btn-press flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text)] transition-colors disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            {t('common.retry')}
          </button>
        </div>

        {loading && !data && <LoadingSkeleton />}

        {error && !data && (
          <div className="py-16 text-center text-sm text-[var(--color-text-tertiary)]">
            <p className="mb-3">{t('common.error')}</p>
            <button
              onClick={handleRefresh}
              className="primary-button"
            >
              {t('common.retry')}
            </button>
          </div>
        )}

        {data && (
          <>
            {/* ── 统计卡片 ── */}
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 mb-5">
              <StatCard icon={<FileText size={16} />} label={t('stats.totalNotes')} value={data.summary.total_notes} />
              <StatCard icon={<PenLine size={16} />} label={t('stats.totalChars')} value={formatChars(data.summary.total_chars, lang)} />
              <StatCard icon={<CalendarRange size={16} />} label={t('stats.yearNotes')} value={data.summary.year_notes} />
              <StatCard icon={<TrendingUp size={16} />} label={t('stats.yearChars')} value={formatChars(data.summary.year_chars, lang)} />
              <StatCard icon={<RotateCcw size={16} />} label={t('stats.totalReviews')} value={data.summary.total_reviews} />
              <StatCard icon={<CalendarCheck size={16} />} label={t('stats.weekReviews')} value={data.summary.week_reviews} />
              <StatCard icon={<Clock size={16} />} label={t('stats.todayReviews')} value={data.summary.today_reviews} />
              <StatCard icon={<MessageSquare size={16} />} label={t('stats.aiMessages')} value={data.summary.ai_messages} />
              <StatCard icon={<Library size={16} />} label={t('stats.kbDocs')} value={data.summary.kb_docs} />
              <StatCard icon={<Flame size={16} />} label={t('stats.noteStreak')} value={noteStreak.count} suffix={t('stats.days')} />
              <StatCard icon={<Heart size={16} />} label={t('stats.petAffection')} value={affection} />
            </div>

            {/* ── 热力图 ── */}
            <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-5 mb-5 overflow-x-auto">
              <h3 className="text-sm font-medium text-[var(--color-text)] mb-4">{t('stats.heatmapTitle')}</h3>
              <Heatmap data={data.heatmap} />
            </div>

            {/* ── 字数趋势 + 分类占比 ── */}
            <div className="grid gap-5 lg:grid-cols-5">
              <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-5 lg:col-span-3">
                <h3 className="text-sm font-medium text-[var(--color-text)] mb-4">{t('stats.trendTitle')}</h3>
                <TrendChart trend={data.trend} />
              </div>
              <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-5 lg:col-span-2">
                <h3 className="text-sm font-medium text-[var(--color-text)] mb-4">{t('stats.categoryTitle')}</h3>
                <CategoryDonut
                  categories={data.categories}
                  uncategorized={data.uncategorized}
                  totalNotes={data.summary.total_notes}
                />
              </div>
            </div>
          </>
        )}
      </FadeIn>
    </div>
  )
}

function StatCard({ icon, label, value, suffix }: {
  icon: React.ReactNode
  label: string
  value: number | string
  suffix?: string
}) {
  return (
    <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg px-4 py-3.5">
      <div className="flex items-center gap-1.5 text-[var(--color-text-secondary)] mb-1.5">
        {icon}
        <span className="text-xs truncate">{label}</span>
      </div>
      <div className="text-xl font-bold text-[var(--color-text)] leading-none flex items-baseline gap-1">
        {value}
        {suffix && <span className="text-xs font-normal text-[var(--color-text-tertiary)]">{suffix}</span>}
      </div>
    </div>
  )
}
