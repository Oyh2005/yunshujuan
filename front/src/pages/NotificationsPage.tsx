import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Bell, UserPlus, UserCheck, Heart, MessageCircle, CheckCheck, Loader2, Inbox, ChevronRight, X, Trash2 } from 'lucide-react'
import { socialApi } from '../api/social'
import type { NotificationItem } from '../types/api'
import ConfirmDialog from '../components/common/ConfirmDialog'
import { useUserStore } from '../stores/useUserStore'
import { swrCache } from '../stores/useSwrCacheStore'
import SocialLayout, { SocialAvatar, SocialHeader, SocialPetCard } from '../components/social/SocialLayout'

export default function NotificationsPage() {
  const { t, i18n } = useTranslation()
  const english = i18n.resolvedLanguage?.startsWith('en')
  const text = (zh: string, en: string) => english ? en : zh
  const navigate = useNavigate()
  const userId = useUserStore((s) => s.userInfo?.uuid || s.userInfo?.user_id || s.userInfo?.id || '')
  const CACHE_KEY = `notifications:${userId}`
  // SWR 预填：刷新页面先渲染本地缓存（秒开），后台请求到达后替换
  const [initialCached] = useState(() => swrCache.get<NotificationItem[]>(CACHE_KEY))
  const [items, setItems] = useState<NotificationItem[]>(() => initialCached ?? [])
  const [loading, setLoading] = useState(() => !initialCached)
  const [loadFailed, setLoadFailed] = useState(false)
  // 是否已有可展示的数据：后续后台刷新失败时静默保留旧数据
  const hadData = useRef(initialCached !== undefined)
  const [marking, setMarking] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)
  const [referenceNow] = useState(() => Date.now())

  /** 本地更新 items 并同步 SWR 缓存（删除/清空/已读等操作后缓存保持一致） */
  const commitItems = (updater: (prev: NotificationItem[]) => NotificationItem[]) => {
    setItems((prev) => {
      const next = updater(prev)
      if (userId) swrCache.set(CACHE_KEY, next)
      return next
    })
  }

  useEffect(() => {
    let cancelled = false
    socialApi
      .notifications()
      .then((res) => {
        if (!cancelled) {
          const data = res.data ?? []
          setItems(data)
          setLoadFailed(false)
          hadData.current = true
          if (userId) swrCache.set(CACHE_KEY, data)
        }
      })
      .catch(() => {
        if (!cancelled && !hadData.current) {
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
  }, [CACHE_KEY, t, userId])

  const handleMarkAllRead = async () => {
    setMarking(true)
    // P1-5 乐观更新：立即全部置为已读（含 SWR 缓存），失败回滚
    const snapshot = items
    commitItems((prev) => prev.map((n) => ({ ...n, read: true })))
    try {
      await socialApi.markAllRead()
      toast.success(t('notifications.allRead'))
    } catch {
      commitItems(() => snapshot)
      toast.error(t('common.error'))
    } finally {
      setMarking(false)
    }
  }

  /** 点击通知：单条标记已读 + 跳转对应页面（QQ/微信式快捷跳转） */
  const handleOpen = async (item: NotificationItem) => {
    if (!item.read) {
      commitItems((prev) => prev.map((n) => n.id === item.id ? { ...n, read: true } : n))
      try {
        await socialApi.markRead([item.id])
      } catch {
        // 已读标记失败不影响跳转
      }
    }
    switch (item.type) {
      case 'friend_request':
        navigate('/friends')  // 好友申请区：可看到申请人头像/昵称/资料并同意或拒绝
        break
      case 'friend_accepted':
        if (item.actor?.user_id) navigate(`/user/${item.actor.user_id}`)
        else navigate('/friends')
        break
      case 'like':
      case 'comment':
        navigate('/social')  // 动态流（精确定位留待动态锚点功能）
        break
      default:
        break
    }
  }

  /** 删除单条通知（hover 行尾出现，微信/QQ 式清理） */
  const handleDelete = async (item: NotificationItem) => {
    try {
      await socialApi.deleteNotification(item.id)
      commitItems((prev) => prev.filter((n) => n.id !== item.id))
      toast.success(t('notifications.deleted'))
    } catch {
      toast.error(t('common.error'))
    }
  }

  /** 清空全部通知（二次确认后执行） */
  const handleClearAll = async () => {
    setClearing(true)
    try {
      await socialApi.clearNotifications()
      commitItems(() => [])
      toast.success(t('notifications.cleared'))
    } catch {
      toast.error(t('common.error'))
    } finally {
      setClearing(false)
      setClearOpen(false)
    }
  }

  const formatTime = (iso: string | null) => {
    if (!iso) return ''
    const d = new Date(iso)
    if (!Number.isFinite(d.getTime())) return ''
    const diffMinutes = Math.max(0, Math.floor((referenceNow - d.getTime()) / 60000))
    if (diffMinutes < 60) return text(`${Math.max(1, diffMinutes)} 分钟前`, `${Math.max(1, diffMinutes)}m ago`)
    if (d.toDateString() === new Date(referenceNow).toDateString()) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  const renderText = (n: NotificationItem) => {
    const actor = n.actor?.username ?? ''
    switch (n.type) {
      case 'friend_request':
        return t('notifications.friendRequest', { actor })
      case 'friend_accepted':
        return t('notifications.friendAccepted', { actor })
      case 'like':
        return t('notifications.like', { actor })
      case 'comment':
        return t('notifications.comment', { actor, content: n.content ?? '' })
      default:
        return ''
    }
  }

  const unreadCount = items.filter((n) => !n.read).length
  const todayItems = items.filter((item) => item.created_at && new Date(item.created_at).toDateString() === new Date(referenceNow).toDateString())
  const earlierItems = items.filter((item) => !todayItems.includes(item))
  const typeCounts = {
    friend_request: items.filter((item) => item.type === 'friend_request').length,
    friend_accepted: items.filter((item) => item.type === 'friend_accepted').length,
    like: items.filter((item) => item.type === 'like').length,
    comment: items.filter((item) => item.type === 'comment').length,
  }

  const renderNotificationRow = (item: NotificationItem) => {
    const meta = {
      friend_request: { icon: <UserPlus size={17} />, tone: 'violet' },
      friend_accepted: { icon: <UserCheck size={17} />, tone: 'mint' },
      like: { icon: <Heart size={17} />, tone: 'rose' },
      comment: { icon: <MessageCircle size={17} />, tone: 'blue' },
    }[item.type]
    return (
      <div key={item.id} className="social-notification-row-wrap">
        <button type="button" onClick={() => void handleOpen(item)} className={`social-notification-row${item.read ? '' : ' is-unread'}`}>
          <SocialAvatar username={item.actor?.username || text('用户', 'User')} avatar={item.actor?.avatar || null} size={42} />
          <span className={`social-type-icon ${meta?.tone || 'violet'}`}>{meta?.icon || <Bell size={17} />}</span>
          <p className="social-notification-copy">{renderText(item)}</p>
          <time>{formatTime(item.created_at)}</time>
          {!item.read && <span className="social-unread-dot" aria-label={text('未读', 'Unread')} />}
          <ChevronRight size={14} className="social-notification-arrow" />
        </button>
        <button
          type="button"
          className="social-notification-delete"
          onClick={() => void handleDelete(item)}
          aria-label={text('删除通知', 'Delete notification')}
          title={text('删除通知', 'Delete notification')}
        >
          <X size={13} />
        </button>
      </div>
    )
  }

  return (
    <SocialLayout className="social-notifications-page">
      <SocialHeader
        title={text('通知中心', 'Notification center')}
        subtitle={text('不错过每一次回应与新的连接', 'Keep up with every response and new connection')}
        badge={unreadCount > 0 ? <span className="social-unread-badge">{unreadCount} {text('条未读', 'unread')}</span> : undefined}
        actions={
          <>
            <button onClick={handleMarkAllRead} disabled={marking || unreadCount === 0} className="social-mark-read">{marking ? <Loader2 size={15} className="animate-spin" /> : <CheckCheck size={16} />}{t('notifications.markAllRead')}</button>
            <button onClick={() => setClearOpen(true)} disabled={clearing || items.length === 0} className="social-clear-all">{clearing ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}{t('notifications.clearAll')}</button>
          </>
        }
      />
      <div className="social-notifications-layout">
        <main className="social-main-stack">
          <section className="social-card social-notification-list">
            <div className="social-card-heading"><h2>{text('最近通知', 'Recent notifications')}</h2><small>{text(`共 ${items.length} 条`, `${items.length} total`)}</small></div>
            {loading ? <div className="social-loading"><Loader2 size={22} />{t('common.loading')}</div> : loadFailed ? <div className="social-inline-error"><p>{text('通知暂时加载失败', 'Notifications could not be loaded')}</p></div> : items.length === 0 ? <div className="social-empty"><Inbox size={28} /><p>{t('notifications.empty')}</p></div> : <>
              {todayItems.length > 0 && <><h3 className="social-notification-group-title">{text('今天', 'Today')}</h3>{todayItems.map(renderNotificationRow)}</>}
              {earlierItems.length > 0 && <><h3 className="social-notification-group-title">{text('更早', 'Earlier')}</h3>{earlierItems.map(renderNotificationRow)}</>}
            </>}
          </section>
        </main>

        <aside className="social-rail">
          <section className="social-card social-notification-overview">
            <h2>{text('通知概览', 'Overview')}</h2>
            <div className="social-notification-overview-grid"><div><strong>{unreadCount}</strong><small>{text('未读通知', 'Unread')}</small></div><div><strong>{items.length}</strong><small>{text('全部通知', 'All')}</small></div></div>
            <div className="social-notification-bar" aria-hidden="true">
              <span className="violet" style={{ flex: Math.max(1, typeCounts.friend_request) }} /><span className="mint" style={{ flex: Math.max(1, typeCounts.friend_accepted) }} /><span className="rose" style={{ flex: Math.max(1, typeCounts.like) }} /><span className="blue" style={{ flex: Math.max(1, typeCounts.comment) }} />
            </div>
          </section>
          <section className="social-card social-notification-types">
            <h2>{text('通知类型', 'Notification types')}</h2>
            <div className="social-type-list">
              <div className="social-type-row"><span className="social-type-icon violet"><UserPlus size={17} /></span><strong>{text('好友申请', 'Friend requests')}</strong><span>{typeCounts.friend_request}</span></div>
              <div className="social-type-row"><span className="social-type-icon mint"><UserCheck size={17} /></span><strong>{text('好友通过', 'Accepted')}</strong><span>{typeCounts.friend_accepted}</span></div>
              <div className="social-type-row"><span className="social-type-icon rose"><Heart size={17} /></span><strong>{text('点赞', 'Likes')}</strong><span>{typeCounts.like}</span></div>
              <div className="social-type-row"><span className="social-type-icon blue"><MessageCircle size={17} /></span><strong>{text('评论', 'Comments')}</strong><span>{typeCounts.comment}</span></div>
            </div>
          </section>
          <SocialPetCard title={text('小卷提醒你', 'A note from Xiao Juan')} message={unreadCount > 0 ? text('有人回应了你的想法，去看看这次新的连接吧～', 'Someone responded to your idea. See the new connection~') : text('所有回应都看过啦，继续分享新的想法吧～', 'You are all caught up. Keep sharing new ideas~')} />
        </aside>
      </div>
      <ConfirmDialog
        open={clearOpen}
        onOpenChange={(open) => { if (!open) setClearOpen(false) }}
        title={text('清空全部通知', 'Clear all notifications')}
        message={text('确定清空全部通知吗？删除后不可恢复。', 'Clear all notifications? This cannot be undone.')}
        variant="danger"
        confirmText={text('清空', 'Clear')}
        onConfirm={handleClearAll}
      />
    </SocialLayout>
  )
}
