import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Bell, UserPlus, UserCheck, Heart, MessageCircle, CheckCheck, Loader2, Inbox, ChevronRight } from 'lucide-react'
import { socialApi } from '../api/social'
import type { NotificationItem } from '../types/api'
import SocialLayout, { SocialAvatar, SocialHeader, SocialPetCard } from '../components/social/SocialLayout'

export default function NotificationsPage() {
  const { t, i18n } = useTranslation()
  const english = i18n.resolvedLanguage?.startsWith('en')
  const text = (zh: string, en: string) => english ? en : zh
  const navigate = useNavigate()
  const [items, setItems] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [marking, setMarking] = useState(false)
  const [referenceNow] = useState(() => Date.now())

  useEffect(() => {
    let cancelled = false
    socialApi
      .notifications()
      .then((res) => {
        if (!cancelled) {
          setItems(res.data ?? [])
          setLoadFailed(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
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
  }, [t])

  const handleMarkAllRead = async () => {
    setMarking(true)
    try {
      await socialApi.markAllRead()
      setItems((prev) => prev.map((n) => ({ ...n, read: true })))
      toast.success(t('notifications.allRead'))
    } catch {
      toast.error(t('common.error'))
    } finally {
      setMarking(false)
    }
  }

  /** 点击通知：单条标记已读 + 跳转对应页面（QQ/微信式快捷跳转） */
  const handleOpen = async (item: NotificationItem) => {
    if (!item.read) {
      setItems((prev) => prev.map((n) => n.id === item.id ? { ...n, read: true } : n))
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
      <button key={item.id} type="button" onClick={() => void handleOpen(item)} className={`social-notification-row${item.read ? '' : ' is-unread'}`}>
        <SocialAvatar username={item.actor?.username || text('用户', 'User')} avatar={item.actor?.avatar || null} size={42} />
        <span className={`social-type-icon ${meta?.tone || 'violet'}`}>{meta?.icon || <Bell size={17} />}</span>
        <p className="social-notification-copy">{renderText(item)}</p>
        <time>{formatTime(item.created_at)}</time>
        {!item.read && <span className="social-unread-dot" aria-label={text('未读', 'Unread')} />}
        <ChevronRight size={14} className="social-notification-arrow" />
      </button>
    )
  }

  return (
    <SocialLayout className="social-notifications-page">
      <SocialHeader
        title={text('通知中心', 'Notification center')}
        subtitle={text('不错过每一次回应与新的连接', 'Keep up with every response and new connection')}
        badge={unreadCount > 0 ? <span className="social-unread-badge">{unreadCount} {text('条未读', 'unread')}</span> : undefined}
        actions={<button onClick={handleMarkAllRead} disabled={marking || unreadCount === 0} className="social-mark-read">{marking ? <Loader2 size={15} className="animate-spin" /> : <CheckCheck size={16} />}{t('notifications.markAllRead')}</button>}
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
    </SocialLayout>
  )
}
