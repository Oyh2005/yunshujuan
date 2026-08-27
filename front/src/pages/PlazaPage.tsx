import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Compass, Eye, Trophy, PenLine, RotateCcw, Flame, Loader2 } from 'lucide-react'
import { socialApi } from '../api/social'
import { statsApi } from '../api/stats'
import type { LeaderboardData, PlazaNote } from '../types/api'
import { FadeIn } from '../components/common/motion'

function formatTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 0) return <span className="text-base">🥇</span>
  if (rank === 1) return <span className="text-base">🥈</span>
  if (rank === 2) return <span className="text-base">🥉</span>
  return <span className="text-xs font-medium text-[var(--color-text-tertiary)] w-5 text-center">{rank + 1}</span>
}

function RankCard({ title, icon, items, unit }: {
  title: string
  icon: React.ReactNode
  items: { username: string; avatar: string | null; value: number }[]
  unit: string
}) {
  const { t } = useTranslation()
  return (
    <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-5">
      <h3 className="text-sm font-medium text-[var(--color-text)] flex items-center gap-2 mb-4">
        {icon}
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="py-6 text-center text-xs text-[var(--color-text-tertiary)]">{t('plaza.noRank')}</p>
      ) : (
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={`${item.username}-${i}`} className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-[var(--color-bg-secondary)] transition-colors">
              <RankBadge rank={i} />
              {item.avatar ? (
                <img src={item.avatar} alt="" className="w-7 h-7 rounded-full object-cover" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-[var(--color-accent-bg)] text-[var(--color-accent)] text-xs font-medium flex items-center justify-center">
                  {item.username.slice(0, 1).toUpperCase()}
                </div>
              )}
              <span className="text-sm text-[var(--color-text)] truncate flex-1">{item.username}</span>
              <span className="text-sm font-semibold text-[var(--color-accent)]">
                {item.value}
                <span className="text-[10px] font-normal text-[var(--color-text-tertiary)] ml-1">{unit}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function PlazaPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [tab, setTab] = useState<'notes' | 'rank'>('notes')
  const [notes, setNotes] = useState<PlazaNote[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null)
  const [rankLoading, setRankLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    socialApi
      .plaza(1)
      .then((res) => {
        if (cancelled) return
        setNotes(res.data.notes)
        setPage(1)
        setHasMore(res.data.has_more)
      })
      .catch(() => {
        if (!cancelled) toast.error(t('common.error'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [t])

  const handleTabChange = (next: 'notes' | 'rank') => {
    setTab(next)
    if (next === 'rank' && !leaderboard) {
      setRankLoading(true)
      statsApi
        .leaderboard()
        .then((res) => setLeaderboard(res.data ?? null))
        .catch(() => toast.error(t('common.error')))
        .finally(() => setRankLoading(false))
    }
  }

  const handleLoadMore = async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const res = await socialApi.plaza(page + 1)
      setNotes((prev) => [...prev, ...res.data.notes])
      setPage((p) => p + 1)
      setHasMore(res.data.has_more)
    } catch {
      toast.error(t('common.error'))
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-6">
      <FadeIn>
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-heading text-xl font-semibold text-[var(--color-text)] flex items-center gap-2">
            <Compass size={22} className="text-[var(--color-accent)]" />
            {t('plaza.title')}
          </h1>
          {/* Tab 切换 */}
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[var(--color-bg-secondary)]">
            <button
              onClick={() => handleTabChange('notes')}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                tab === 'notes'
                  ? 'bg-[var(--color-card)] text-[var(--color-accent)] shadow-sm font-medium'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
              }`}
            >
              {t('plaza.tabNotes')}
            </button>
            <button
              onClick={() => handleTabChange('rank')}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                tab === 'rank'
                  ? 'bg-[var(--color-card)] text-[var(--color-accent)] shadow-sm font-medium'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
              }`}
            >
              {t('plaza.tabRank')}
            </button>
          </div>
        </div>

        {tab === 'notes' ? (
          loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={22} className="animate-spin text-[var(--color-text-tertiary)]" />
            </div>
          ) : notes.length === 0 ? (
            <div className="py-16 text-center text-sm text-[var(--color-text-tertiary)]">
              {t('plaza.empty')}
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {notes.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => navigate(`/share/${n.id}`)}
                    className="w-full text-left bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-5 hover:border-[var(--color-accent)] hover:shadow-sm transition-all"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        onClick={(e) => { e.stopPropagation(); navigate(`/user/${n.author.user_id}`) }}
                        className="flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer"
                        title={n.author.username}
                      >
                        {n.author.avatar ? (
                          <img src={n.author.avatar} alt="" className="w-6 h-6 rounded-full object-cover" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-[var(--color-accent-bg)] text-[var(--color-accent)] text-[10px] font-medium flex items-center justify-center">
                            {n.author.username.slice(0, 1).toUpperCase()}
                          </div>
                        )}
                        <span className="text-xs text-[var(--color-text-secondary)]">{n.author.username}</span>
                      </span>
                      {n.category && (
                        <span className="px-2 py-0.5 text-[10px] rounded-full bg-[var(--color-accent-bg)] text-[var(--color-accent)]">
                          {n.category}
                        </span>
                      )}
                      <span className="ml-auto flex items-center gap-1 text-[11px] text-[var(--color-text-tertiary)]">
                        <Eye size={12} />
                        {n.view_count}
                      </span>
                    </div>
                    <h2 className="text-base font-medium text-[var(--color-text)] mb-1.5">{n.title}</h2>
                    <p className="text-sm text-[var(--color-text-secondary)] line-clamp-3 leading-relaxed">
                      {n.content_preview}
                    </p>
                    <p className="mt-2 text-[11px] text-[var(--color-text-tertiary)]">{formatTime(n.updated_at)}</p>
                  </button>
                ))}
              </div>
              {hasMore && (
                <div className="text-center pt-4">
                  <button
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="secondary-button"
                  >
                    {loadingMore ? t('common.loading') : t('plaza.loadMore')}
                  </button>
                </div>
              )}
            </>
          )
        ) : rankLoading && !leaderboard ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={22} className="animate-spin text-[var(--color-text-tertiary)]" />
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-3">
            <RankCard
              title={t('plaza.rankWriting')}
              icon={<PenLine size={15} className="text-[var(--color-accent)]" />}
              items={leaderboard?.writing ?? []}
              unit={t('plaza.unitChars')}
            />
            <RankCard
              title={t('plaza.rankReview')}
              icon={<RotateCcw size={15} className="text-[var(--color-accent)]" />}
              items={leaderboard?.review ?? []}
              unit={t('plaza.unitTimes')}
            />
            <RankCard
              title={t('plaza.rankStreak')}
              icon={<Flame size={15} className="text-[var(--color-warning)]" />}
              items={leaderboard?.streak ?? []}
              unit={t('plaza.unitDays')}
            />
            <div className="sm:col-span-3 text-center text-[11px] text-[var(--color-text-tertiary)] flex items-center justify-center gap-1.5">
              <Trophy size={13} />
              {t('plaza.rankHint')}
            </div>
          </div>
        )}
      </FadeIn>
    </div>
  )
}
