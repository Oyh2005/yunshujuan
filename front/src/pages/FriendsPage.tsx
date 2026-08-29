import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Search, UserPlus, UserCheck, X, Trash2, Loader2, Inbox, ChevronRight, MessageSquare, Contact } from 'lucide-react'
import { socialApi } from '../api/social'
import type { FriendRequestItem, SocialUser } from '../types/api'
import ConfirmDialog from '../components/common/ConfirmDialog'
import { useChatStore } from '../stores/useChatStore'
import { useUserStore } from '../stores/useUserStore'
import { swrCache } from '../stores/useSwrCacheStore'
import SocialLayout, { SocialAvatar, SocialHeader, SocialPetCard } from '../components/social/SocialLayout'

export default function FriendsPage() {
  const { t, i18n } = useTranslation()
  const english = i18n.resolvedLanguage?.startsWith('en')
  const text = (zh: string, en: string) => english ? en : zh
  const navigate = useNavigate()
  // 在线好友集合：MainLayout 全局 WS 维护（好友登录网站任意页面即可见）
  const onlineUsers = useChatStore((s) => s.onlineUsers)
  const userId = useUserStore((s) => s.userInfo?.uuid || s.userInfo?.user_id || s.userInfo?.id || '')
  // SWR 预填：刷新页面先渲染本地缓存（秒开），后台请求到达后替换
  const [initialCached] = useState(() => swrCache.get<{ friends: SocialUser[]; requests: FriendRequestItem[] }>(`social-friends:${userId}`))
  const [friends, setFriends] = useState<SocialUser[]>(() => initialCached?.friends ?? [])
  const [requests, setRequests] = useState<FriendRequestItem[]>(() => initialCached?.requests ?? [])
  const [loading, setLoading] = useState(() => !initialCached)
  const [loadFailed, setLoadFailed] = useState(false)
  // 是否已有可展示的数据（缓存或首次成功）：后续后台刷新失败时静默保留旧数据
  const hadData = useRef(initialCached !== undefined)

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
        const friendsData = f.data ?? []
        const requestsData = r.data ?? []
        setFriends(friendsData)
        setRequests(requestsData)
        setLoadFailed(false)
        hadData.current = true
        // 写入 SWR 缓存（刷新页面秒开；后台刷新自愈）
        if (userId) swrCache.set(`social-friends:${userId}`, { friends: friendsData, requests: requestsData })
      })
      .catch(() => {
        if (!cancelled && !hadData.current) {
          // 无缓存且从未成功过才提示失败（有缓存时保留旧数据展示）
          setLoadFailed(true)
          toast.error(t('common.error'))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [t, userId])

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
    <SocialLayout className="social-friends-page">
      <SocialHeader title={text('我的好友', 'My friends')} subtitle={text('和志同道合的人一起分享、学习与成长', 'Share, learn, and grow with people who inspire you')} />
      <div className="social-friends-layout">
        <main className="social-friends-main">
          <section className="social-card social-friends-hero">
            <div className="social-friends-hero-copy">
              <h2>{text('知识因为交流而', 'Knowledge grows')}<em>{text('更有温度', ' warmer through connection')}</em></h2>
              <p>{text('找到伙伴，让彼此的灵感发生连接', 'Find companions and connect your ideas')}</p>
              <div className="social-friends-stats">
                <div className="social-friends-stat"><span><Contact size={18} /></span><small>{t('friends.myFriends')}</small><strong>{friends.length}</strong></div>
                <div className="social-friends-stat"><span><UserPlus size={18} /></span><small>{t('friends.requests')}</small><strong>{requests.length}</strong></div>
              </div>
            </div>
            <img src="/illustrations/study-cloud.png" alt="" />
          </section>

          <section className="social-card social-search-card">
            <div className="social-card-heading"><h2>{text('查找新朋友', 'Find new friends')}</h2></div>
            <div className="social-search-row">
              <label className="social-search-field"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }} placeholder={t('friends.searchPlaceholder')} /></label>
              <button onClick={handleSearch} disabled={searching || !query.trim()} className="social-search-button">{searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}{t('friends.search')}</button>
            </div>
            {searched && <div className="social-search-results">
              {results.length === 0 ? <div className="social-empty"><Search size={22} /><p>{t('friends.noResults')}</p></div> : results.map((user) => (
                <div key={user.user_id} className="social-user-row">
                  <SocialAvatar username={user.username} avatar={user.avatar} size={38} />
                  <div className="social-user-copy"><strong>{user.username}</strong>{user.bio && <small>{user.bio}</small>}</div>
                  <button onClick={() => handleSendRequest(user.user_id)} disabled={busyId === user.user_id} className="social-add-button">{busyId === user.user_id ? t('common.loading') : t('friends.add')}</button>
                </div>
              ))}
            </div>}
          </section>

          <section className="social-card social-friend-list-card">
            <div className="social-card-heading"><h2>{t('friends.myFriends')}</h2><small>{friends.length} {text('位', 'total')}</small></div>
            {loading ? <div className="social-loading"><Loader2 size={22} />{t('common.loading')}</div> : loadFailed ? <div className="social-inline-error"><p>{text('好友数据暂时加载失败', 'Friends could not be loaded')}</p></div> : friends.length === 0 ? <div className="social-empty"><Contact size={26} /><p>{t('friends.empty')}</p></div> : (
              <div className="social-friend-grid">{friends.map((friend) => (
                <article key={friend.user_id} className="social-friend-card">
                  <span className="social-friend-avatar">
                    <SocialAvatar username={friend.username} avatar={friend.avatar} size={42} />
                    {onlineUsers.has(friend.user_id) && <i className="messages-online-dot" title={text('在线', 'Online')} />}
                  </span>
                  <button onClick={() => navigate(`/user/${friend.user_id}`)} className="social-friend-open"><strong>{friend.username}</strong><small>{friend.bio || text('查看公开主页', 'View public profile')}</small></button>
                  <button onClick={() => navigate(`/messages?with=${friend.user_id}`)} className="social-friend-chat" title={text('发私信', 'Send message')} aria-label={text('给 {name} 发私信', 'Message {name}')}><MessageSquare size={13} /></button>
                  <ChevronRight size={15} />
                  <button onClick={() => setRemoveTarget(friend)} disabled={busyId === friend.user_id} className="social-friend-remove" title={t('friends.remove')} aria-label={t('friends.remove')}><Trash2 size={13} /></button>
                </article>
              ))}</div>
            )}
          </section>
        </main>

        <aside className="social-friends-rail">
          <section className="social-card social-request-card">
            <div className="social-card-heading"><h2>{t('friends.requests')}</h2>{requests.length > 0 && <span className="social-request-count">{requests.length}</span>}</div>
            {loading ? <div className="social-loading"><Loader2 size={20} /></div> : requests.length === 0 ? <div className="social-empty"><Inbox size={24} /><p>{t('friends.noRequests')}</p></div> : requests.map((request) => (
              <div key={request.request_id} className="social-request-row">
                <button onClick={() => navigate(`/user/${request.user_id}`)} className="social-request-user" title={text('查看资料', 'View profile')}>
                  <SocialAvatar username={request.username} avatar={request.avatar} size={40} />
                  <div className="social-user-copy"><strong>{request.username}</strong><small>{request.bio || t('friends.wantsToAdd')}</small></div>
                </button>
                <div className="social-request-actions">
                  <button onClick={() => handleRespond(request.request_id, true)} disabled={busyId === request.request_id} title={t('friends.accept')} aria-label={t('friends.accept')}>{busyId === request.request_id ? <Loader2 size={14} className="animate-spin" /> : <UserCheck size={14} />}</button>
                  <button onClick={() => handleRespond(request.request_id, false)} disabled={busyId === request.request_id} title={t('friends.reject')} aria-label={t('friends.reject')}><X size={14} /></button>
                </div>
              </div>
            ))}
          </section>
          <section className="social-card social-tips-card">
            <h2>{text('好友小贴士', 'Friend tips')}</h2>
            <div className="social-tips-list">
              <div className="social-tip"><span className="social-tip-icon blue"><Contact size={17} /></span>{text('点击好友可查看公开主页', 'Open a friend to view their public profile')}</div>
              <div className="social-tip"><span className="social-tip-icon mint"><MessageSquare size={17} /></span>{text('好友动态会出现在动态页', 'Friends’ posts appear in your feed')}</div>
              <div className="social-tip"><span className="social-tip-icon rose"><Trash2 size={17} /></span>{text('可以随时移除好友', 'You can remove a friend at any time')}</div>
            </div>
          </section>
          <SocialPetCard title={text('小卷也认识新朋友啦', 'Xiao Juan loves new friends')} message={text('一起交流，会发现更多有趣的想法～', 'Connect and discover more interesting ideas~')} />
        </aside>
      </div>

      <ConfirmDialog open={!!removeTarget} onOpenChange={() => setRemoveTarget(null)} title={t('friends.removeTitle')} message={t('friends.removeConfirm', { username: removeTarget?.username ?? '' })} variant="danger" confirmText={t('friends.remove')} onConfirm={handleRemove} />
    </SocialLayout>
  )
}
