import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  User,
  FileText,
  Award,
  RotateCcw,
  Rss,
  Share2,
  Library,
  Users,
  Loader2,
  Eye,
  Lock,
  CalendarDays,
  MessageSquare,
} from 'lucide-react'
import { socialApi } from '../api/social'
import type { PlazaNote, UserProfileData } from '../types/api'
import { FadeIn } from '../components/common/motion'

const ACHIEVEMENT_ICONS: Record<string, React.ReactNode> = {
  first_note: <FileText size={20} />,
  note_master: <Award size={20} />,
  review_pro: <RotateCcw size={20} />,
  first_post: <Rss size={20} />,
  sharer: <Share2 size={20} />,
  kb_collector: <Library size={20} />,
  has_fans: <Users size={20} />,
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

export default function UserProfilePage() {
  const { t } = useTranslation()
  const { userId } = useParams<{ userId: string }>()
  const navigate = useNavigate()
  const [profile, setProfile] = useState<UserProfileData | null>(null)
  const [notes, setNotes] = useState<PlazaNote[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [followingBusy, setFollowingBusy] = useState(false)
  const [relationList, setRelationList] = useState<{ kind: 'followers' | 'following'; items: { user_id: string; username: string; avatar: string | null }[] } | null>(null)
  const [relationLoading, setRelationLoading] = useState(false)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    Promise.all([socialApi.profile(userId), socialApi.userPublicNotes(userId)])
      .then(([p, n]) => {
        if (cancelled) return
        setProfile(p.data ?? null)
        setNotes(n.data?.notes ?? [])
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
  }, [userId])

  const handleToggleFollow = async () => {
    if (!profile || !userId || followingBusy) return
    const optimisticFollowing = !profile.follow.is_following
    // P1-5 乐观更新：立即翻转关注态与粉丝数，失败回滚，成功以服务端为准校准
    setProfile((prev) =>
      prev
        ? {
            ...prev,
            follow: {
              ...prev.follow,
              is_following: optimisticFollowing,
              follower_count: Math.max(0, prev.follow.follower_count + (optimisticFollowing ? 1 : -1)),
            },
          }
        : prev
    )
    setFollowingBusy(true)
    try {
      const res = optimisticFollowing
        ? await socialApi.follow(userId)
        : await socialApi.unfollow(userId)
      const isFollowing = res.data?.is_following ?? optimisticFollowing
      if (isFollowing !== optimisticFollowing) {
        setProfile((prev) =>
          prev
            ? {
                ...prev,
                follow: {
                  ...prev.follow,
                  is_following: isFollowing,
                  follower_count: Math.max(0, prev.follow.follower_count + (isFollowing ? 1 : -1)),
                },
              }
            : prev
        )
      }
      toast.success(isFollowing ? t('userpage.followed') : t('userpage.unfollowed'))
    } catch (err) {
      // 回滚到点击前状态
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              follow: {
                ...prev.follow,
                is_following: !optimisticFollowing,
                follower_count: Math.max(0, prev.follow.follower_count + (optimisticFollowing ? -1 : 1)),
              },
            }
          : prev
      )
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(detail || t('common.error'))
    } finally {
      setFollowingBusy(false)
    }
  }

  const handleShowRelation = async (kind: 'followers' | 'following') => {
    if (!userId) return
    if (relationList?.kind === kind) {
      setRelationList(null)
      return
    }
    setRelationLoading(true)
    try {
      const res = kind === 'followers' ? await socialApi.followers(userId) : await socialApi.following(userId)
      setRelationList({ kind, items: res.data ?? [] })
    } catch {
      toast.error(t('common.error'))
    } finally {
      setRelationLoading(false)
    }
  }

  const unlockedCount = profile?.achievements.filter((a) => a.unlocked).length ?? 0

  return (
    <div className="max-w-3xl mx-auto py-8 px-6">
      <FadeIn>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={22} className="animate-spin text-[var(--color-text-tertiary)]" />
          </div>
        ) : error || !profile ? (
          <div className="py-16 text-center text-sm text-[var(--color-text-tertiary)]">
            <User size={28} className="mx-auto mb-3 opacity-50" />
            {t('userpage.notFound')}
          </div>
        ) : (
          <>
            {/* 头部 */}
            <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-6 mb-5">
              <div className="flex items-start gap-4">
                {profile.user.avatar ? (
                  <img src={profile.user.avatar} alt="" loading="lazy" className="w-16 h-16 rounded-full object-cover" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-[var(--color-accent-bg)] text-[var(--color-accent)] text-2xl font-bold flex items-center justify-center">
                    {profile.user.username.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h1 className="text-lg font-semibold text-[var(--color-text)]">{profile.user.username}</h1>
                    {!profile.follow.is_self ? (
                      <>
                        <button
                          onClick={handleToggleFollow}
                          disabled={followingBusy}
                          className={`px-4 h-8 text-sm rounded-md transition-colors disabled:opacity-50 ${
                            profile.follow.is_following
                              ? 'border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]'
                              : 'bg-[var(--color-accent)] text-[var(--color-accent-foreground)] hover:opacity-90'
                          }`}
                        >
                          {profile.follow.is_following ? t('userpage.followingBtn') : t('userpage.follow')}
                        </button>
                        {profile.follow.is_friend && (
                          <button
                            onClick={() => navigate(`/messages?with=${profile.user.user_id}`)}
                            className="h-8 px-4 text-sm rounded-md border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-accent-bg)] hover:text-[var(--color-accent)] transition-colors inline-flex items-center gap-1.5"
                          >
                            <MessageSquare size={13} />{t('userpage.message')}
                          </button>
                        )}
                      </>
                    ) : (
                      <span className="px-3 h-8 flex items-center text-xs rounded-md bg-[var(--color-accent-bg)] text-[var(--color-accent)]">
                        {t('userpage.isSelf')}
                      </span>
                    )}
                  </div>
                  {profile.user.bio && (
                    <p className="text-sm text-[var(--color-text-secondary)] mt-1.5">{profile.user.bio}</p>
                  )}
                  {profile.user.date_joined && (
                    <p className="text-xs text-[var(--color-text-tertiary)] mt-1.5 flex items-center gap-1">
                      <CalendarDays size={12} />
                      {t('userpage.joinDate', { date: formatDate(profile.user.date_joined) })}
                    </p>
                  )}
                  <div className="flex items-center gap-4 mt-3">
                    <button
                      onClick={() => handleShowRelation('followers')}
                      className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] transition-colors"
                    >
                      <span className="font-semibold text-[var(--color-text)]">{profile.follow.follower_count}</span> {t('userpage.followers')}
                    </button>
                    <button
                      onClick={() => handleShowRelation('following')}
                      className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] transition-colors"
                    >
                      <span className="font-semibold text-[var(--color-text)]">{profile.follow.following_count}</span> {t('userpage.following')}
                    </button>
                  </div>
                </div>
              </div>

              {/* 粉丝/关注列表 */}
              {relationList && (
                <div className="mt-4 pt-4 border-t border-[var(--color-border-light)]">
                  {relationLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 size={16} className="animate-spin text-[var(--color-text-tertiary)]" />
                    </div>
                  ) : relationList.items.length === 0 ? (
                    <p className="py-3 text-center text-xs text-[var(--color-text-tertiary)]">{t('userpage.noRelation')}</p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {relationList.items.map((u) => (
                        <button
                          key={u.user_id}
                          onClick={() => navigate(`/user/${u.user_id}`)}
                          className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border-light)] hover:border-[var(--color-accent)] transition-colors text-left"
                        >
                          {u.avatar ? (
                            <img src={u.avatar} alt="" loading="lazy" className="w-7 h-7 rounded-full object-cover" />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-[var(--color-accent-bg)] text-[var(--color-accent)] text-xs font-medium flex items-center justify-center">
                              {u.username.slice(0, 1).toUpperCase()}
                            </div>
                          )}
                          <span className="text-sm text-[var(--color-text)] truncate">{u.username}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 统计卡片 */}
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 mb-5">
              <StatCard icon={<FileText size={14} />} label={t('userpage.statsNotes')} value={profile.stats.notes} />
              <StatCard icon={<Share2 size={14} />} label={t('userpage.statsPublic')} value={profile.stats.public_notes} />
              <StatCard icon={<RotateCcw size={14} />} label={t('userpage.statsReviews')} value={profile.stats.reviews} />
              <StatCard icon={<Rss size={14} />} label={t('userpage.statsPosts')} value={profile.stats.posts} />
            </div>

            {/* 成就墙 */}
            <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-5 mb-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium text-[var(--color-text)] flex items-center gap-2">
                  <Award size={15} className="text-[var(--color-accent)]" />
                  {t('userpage.achievements')}
                </h2>
                <span className="text-xs text-[var(--color-text-tertiary)]">
                  {t('userpage.unlockedCount', { count: unlockedCount })}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {profile.achievements.map((a) => {
                  const unlocked = a.unlocked
                  return (
                    <div
                      key={a.id}
                      className={`rounded-lg border p-3 text-center transition-colors ${
                        unlocked
                          ? 'border-[var(--color-accent)] bg-[var(--color-accent-bg)]'
                          : 'border-[var(--color-border)] bg-[var(--color-bg)] opacity-60'
                      }`}
                      title={t(`userpage.ach.${a.id}.desc`)}
                    >
                      <div className={`flex items-center justify-center mb-1.5 ${unlocked ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-tertiary)]'}`}>
                        {unlocked ? ACHIEVEMENT_ICONS[a.id] : <Lock size={20} />}
                      </div>
                      <p className={`text-xs font-medium ${unlocked ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-secondary)]'}`}>
                        {t(`userpage.ach.${a.id}.title`)}
                      </p>
                      <p className="text-[10px] text-[var(--color-text-tertiary)] mt-0.5 leading-snug">
                        {t(`userpage.ach.${a.id}.desc`)}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 公开笔记 */}
            <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-5">
              <h2 className="text-sm font-medium text-[var(--color-text)] mb-4 flex items-center gap-2">
                <FileText size={15} className="text-[var(--color-accent)]" />
                {t('userpage.publicNotes')}
              </h2>
              {notes.length === 0 ? (
                <p className="py-6 text-center text-xs text-[var(--color-text-tertiary)]">{t('userpage.noPublicNotes')}</p>
              ) : (
                <div className="space-y-3">
                  {notes.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => navigate(`/share/${n.id}`)}
                      className="w-full text-left px-4 py-3 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border-light)] hover:border-[var(--color-accent)] transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-[var(--color-text)]">{n.title}</span>
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
                      <p className="text-xs text-[var(--color-text-secondary)] line-clamp-2">{n.content_preview}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </FadeIn>
    </div>
  )
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg px-4 py-3">
      <div className="flex items-center gap-1.5 text-[var(--color-text-secondary)] mb-1.5">
        {icon}
        <span className="text-xs truncate">{label}</span>
      </div>
      <div className="text-xl font-bold text-[var(--color-text)] leading-none">{value}</div>
    </div>
  )
}
