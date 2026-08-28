import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
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
  RefreshCw,
  ArrowRight,
} from 'lucide-react'
import { statsApi } from '../api/stats'
import type { StatsDashboard } from '../types/api'
import { usePetStore } from '../stores/usePetStore'
import { useHabitStore } from '../stores/useHabitStore'
import KnowledgeLayout, { KnowledgeHeader } from '../components/knowledge/KnowledgeLayout'
import LoadingSkeleton from '../components/common/LoadingSkeleton'
import Heatmap from '../components/stats/Heatmap'
import TrendChart from '../components/stats/TrendChart'
import CategoryDonut from '../components/stats/CategoryDonut'

/** 总字数格式化：万 / k */
function formatChars(n: number, lang: string): string {
  if (n >= 10000 && lang.startsWith('zh')) return `${(n / 10000).toFixed(1)}万`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

export default function StatsPage() {
  const { t, i18n } = useTranslation()
  const [data, setData] = useState<StatsDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<boolean | 'rate'>(false)

  const affection = usePetStore((s) => s.affection)
  const noteStreak = useHabitStore((s) => s.noteStreak)

  const load = useCallback(async () => {
    // 重试/刷新用：由事件处理器调用（内部先置 loading）
    try {
      const res = await statsApi.dashboard()
      setData(res.data ?? null)
      setError(false)
    } catch (err) {
      setError((err as { response?: { status?: number } })?.response?.status === 429 ? 'rate' : true)
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
      .catch((err: unknown) => {
        if (!cancelled) setError((err as { response?: { status?: number } })?.response?.status === 429 ? 'rate' : true)
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
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const streak = [new Date().toDateString(), yesterday.toDateString()].includes(noteStreak.lastDate) ? noteStreak.count : 0

  return (
    <KnowledgeLayout>
        <KnowledgeHeader title={t('stats.title')} subtitle={t('knowledgeUI.statsSubtitle')} actions={
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="secondary-button"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            {t('knowledgeUI.refresh')}
          </button>
        } />

        {loading && !data && <LoadingSkeleton />}

        {error && (
          <div className="knowledge-alert" role="alert">
            <p className="mb-3">{error === 'rate' ? t('common.rateLimited') : t('common.error')}</p>
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
            <div className="knowledge-stats-primary">
              <StatCard icon={<FileText size={16} />} label={t('stats.totalNotes')} value={data.summary.total_notes} />
              <StatCard icon={<PenLine size={16} />} label={t('stats.totalChars')} value={formatChars(data.summary.total_chars, lang)} />
              <StatCard icon={<RotateCcw size={16} />} label={t('stats.totalReviews')} value={data.summary.total_reviews} />
              <StatCard icon={<Flame size={16} />} label={t('stats.noteStreak')} value={streak} suffix={t('stats.days')} />
            </div>
            <div className="knowledge-stats-secondary">
              <StatCard icon={<CalendarRange size={16} />} label={t('stats.yearNotes')} value={data.summary.year_notes} />
              <StatCard icon={<TrendingUp size={16} />} label={t('stats.yearChars')} value={formatChars(data.summary.year_chars, lang)} />
              <StatCard icon={<CalendarCheck size={16} />} label={t('stats.weekReviews')} value={data.summary.week_reviews} />
              <StatCard icon={<Clock size={16} />} label={t('stats.todayReviews')} value={data.summary.today_reviews} />
              <StatCard icon={<MessageSquare size={16} />} label={t('stats.aiMessages')} value={data.summary.ai_messages} />
              <StatCard icon={<Library size={16} />} label={t('stats.kbDocs')} value={data.summary.kb_docs} />
              <StatCard icon={<Heart size={16} />} label={t('stats.petAffection')} value={affection} />
            </div>

            {/* ── 热力图 ── */}
            <div className="knowledge-panel">
              <h2>{t('stats.heatmapTitle')}</h2>
              <div className="knowledge-heatmap-scroll"><Heatmap data={data.heatmap} /></div>
            </div>

            {/* ── 字数趋势 + 分类占比 ── */}
            <div className="knowledge-stats-charts">
              <div className="knowledge-panel">
                <h2>{t('stats.trendTitle')}</h2>
                <TrendChart trend={data.trend} />
              </div>
              <div className="knowledge-panel">
                <h2>{t('stats.categoryTitle')}</h2>
                <CategoryDonut
                  categories={data.categories}
                  uncategorized={data.uncategorized}
                  totalNotes={data.summary.total_notes}
                />
              </div>
            </div>
            <div className="knowledge-helper knowledge-streak"><Flame size={32} /><div><strong>{t('knowledgeUI.streakTitle', { count: streak })}</strong><p>{t('knowledgeUI.streakHint')}</p></div><Link className="knowledge-text-link" to="/notes/new">{t('knowledgeUI.keepWriting')}<ArrowRight size={16} /></Link><img src="/illustrations/study-cloud.png" alt="" /></div>
          </>
        )}
    </KnowledgeLayout>
  )
}

function StatCard({ icon, label, value, suffix }: {
  icon: React.ReactNode
  label: string
  value: number | string
  suffix?: string
}) {
  return (
    <div className="knowledge-stat-card">
      <div>
        {icon}
        <span>{label}</span>
      </div>
      <div className="knowledge-stat-value">
        {value}
        {suffix && <span className="text-xs font-normal text-[var(--color-text-tertiary)]">{suffix}</span>}
      </div>
    </div>
  )
}
