import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Users, Search, UserPlus, UserCheck, X, Trash2, Loader2, Inbox } from 'lucide-react'
import { socialApi } from '../api/social'
import type { FriendRequestItem, SocialUser } from '../types/api'
import { FadeIn } from '../components/common/motion'
import ConfirmDialog from '../components/common/ConfirmDialog'

export default function FriendsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [friends, setFriends] = useState<SocialUser[]>([])
  const [requests, setRequests] = useState<FriendRequestItem[]>([])
  const [loading, setLoading] = useState(true)

  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<SocialUser[]>([])
  const [searched, setSearched] = useState(false)

  const [removeTarget, setRemoveTarget] = useState<SocialUser | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([socialApi.friendsList(), socialApi.friendRequests()])
      .then(([f, r]) => {
        if (cancelled) return
        setFriends(f.data ?? [])
        setRequests(r.data ?? [])
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

  const handleSearch = async () => {
    const q = query.trim()
    if (!q) return
    setSearching(true)
    setSearched(true)
    try {
      const res = await socialApi.searchUsers(q)
      setResults(res.data ?? [])
    } catch {
      setResults([])
    } finally {
      setSearching(false)
    }
  }

  const handleSendRequest = async (userId: string) => {
    setBusyId(userId)
    try {
      await socialApi.sendFriendRequest(userId)
      toast.success(t('friends.requestSent'))
      setResults((prev) => prev.filter((u) => u.user_id !== userId))
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(detail || t('common.error'))
    } finally {
      setBusyId(null)
    }
  }

  const handleRespond = async (requestId: string, accept: boolean) => {
    setBusyId(requestId)
    try {
      const res = await socialApi.respondFriendRequest(requestId, accept)
      toast.success(res.message || (accept ? t('friends.accepted') : t('friends.rejected')))
      setRequests((prev) => prev.filter((r) => r.request_id !== requestId))
      if (accept) {
        const list = await socialApi.friendsList()
        setFriends(list.data ?? [])
      }
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(detail || t('common.error'))
    } finally {
      setBusyId(null)
    }
  }

  const handleRemove = async () => {
    if (!removeTarget) return
    setBusyId(removeTarget.user_id)
    try {
      await socialApi.removeFriend(removeTarget.user_id)
      setFriends((prev) => prev.filter((f) => f.user_id !== removeTarget.user_id))
      toast.success(t('friends.removed'))
    } catch {
      toast.error(t('common.error'))
    } finally {
      setBusyId(null)
      setRemoveTarget(null)
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-6">
      <FadeIn>
        <h1 className="font-heading text-xl font-semibold text-[var(--color-text)] flex items-center gap-2 mb-6">
          <Users size={22} className="text-[var(--color-accent)]" />
          {t('friends.title')}
        </h1>

        {/* 搜索用户 */}
        <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-4 mb-5">
          <div className="flex items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }}
              placeholder={t('friends.searchPlaceholder')}
              className="flex-1 px-3 py-2 text-sm rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text)] placeholder:text-[var(--color-text-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            />
            <button
              onClick={handleSearch}
              disabled={searching || !query.trim()}
              className="primary-button"
            >
              {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              {t('friends.search')}
            </button>
          </div>
          {searched && (
            <div className="mt-3 space-y-1">
              {results.length === 0 ? (
                <p className="py-4 text-center text-xs text-[var(--color-text-tertiary)]">{t('friends.noResults')}</p>
              ) : (
                results.map((u) => (
                  <div key={u.user_id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[var(--color-bg-secondary)] transition-colors">
                    <UserPlus size={18} className="text-[var(--color-text-tertiary)] shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-[var(--color-text)]">{u.username}</p>
                      {u.bio && <p className="text-xs text-[var(--color-text-tertiary)] truncate">{u.bio}</p>}
                    </div>
                    <button
                      onClick={() => handleSendRequest(u.user_id)}
                      disabled={busyId === u.user_id}
                      className="px-3 h-7 text-xs rounded-md border border-[var(--color-accent)] text-[var(--color-accent)] hover:bg-[var(--color-accent-bg)] disabled:opacity-50 transition-colors shrink-0"
                    >
                      {busyId === u.user_id ? t('common.loading') : t('friends.add')}
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={22} className="animate-spin text-[var(--color-text-tertiary)]" />
          </div>
        ) : (
          <>
            {/* 收到的申请 */}
            <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-4 mb-5">
              <h2 className="text-sm font-medium text-[var(--color-text)] mb-3">
                {t('friends.requests')}
                {requests.length > 0 && (
                  <span className="ml-1.5 text-xs text-[var(--color-text-tertiary)]">({requests.length})</span>
                )}
              </h2>
              {requests.length === 0 ? (
                <p className="py-3 text-center text-xs text-[var(--color-text-tertiary)] flex items-center justify-center gap-1.5">
                  <Inbox size={13} /> {t('friends.noRequests')}
                </p>
              ) : (
                <div className="space-y-2">
                  {requests.map((r) => (
                    <div key={r.request_id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border-light)]">
                      <UserPlus size={18} className="text-[var(--color-accent)] shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-[var(--color-text)]">{r.username}</p>
                        <p className="text-[11px] text-[var(--color-text-tertiary)]">{t('friends.wantsToAdd')}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleRespond(r.request_id, true)}
                          disabled={busyId === r.request_id}
                          className="p-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-accent-foreground)] hover:opacity-90 disabled:opacity-50"
                          title={t('friends.accept')}
                        >
                          {busyId === r.request_id ? <Loader2 size={14} className="animate-spin" /> : <UserCheck size={14} />}
                        </button>
                        <button
                          onClick={() => handleRespond(r.request_id, false)}
                          disabled={busyId === r.request_id}
                          className="p-2 rounded-lg border border-[var(--color-border)] text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] disabled:opacity-50"
                          title={t('friends.reject')}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 好友列表 */}
            <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-4">
              <h2 className="text-sm font-medium text-[var(--color-text)] mb-3">
                {t('friends.myFriends')}
                <span className="ml-1.5 text-xs text-[var(--color-text-tertiary)]">({friends.length})</span>
              </h2>
              {friends.length === 0 ? (
                <p className="py-3 text-center text-xs text-[var(--color-text-tertiary)]">{t('friends.empty')}</p>
              ) : (
                <div className="space-y-2">
                  {friends.map((f) => (
                    <div key={f.user_id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border-light)]">
                      <UserCheck size={18} className="text-[var(--color-success)] shrink-0" />
                      <button
                        onClick={() => navigate(`/user/${f.user_id}`)}
                        className="min-w-0 flex-1 text-left hover:opacity-80 transition-opacity"
                      >
                        <p className="text-sm text-[var(--color-text)]">{f.username}</p>
                        {f.bio && <p className="text-xs text-[var(--color-text-tertiary)] truncate">{f.bio}</p>}
                      </button>
                      <button
                        onClick={() => setRemoveTarget(f)}
                        disabled={busyId === f.user_id}
                        className="p-2 rounded-lg text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] disabled:opacity-50 transition-colors shrink-0"
                        title={t('friends.remove')}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        <ConfirmDialog
          open={!!removeTarget}
          onOpenChange={() => setRemoveTarget(null)}
          title={t('friends.removeTitle')}
          message={t('friends.removeConfirm', { username: removeTarget?.username ?? '' })}
          variant="danger"
          confirmText={t('friends.remove')}
          onConfirm={handleRemove}
        />
      </FadeIn>
    </div>
  )
}
