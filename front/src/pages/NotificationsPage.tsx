import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Bell, UserPlus, UserCheck, Heart, MessageCircle, CheckCheck, Loader2, Inbox } from 'lucide-react'
import { socialApi } from '../api/social'
import type { NotificationItem } from '../types/api'
import { FadeIn } from '../components/common/motion'

const TYPE_ICONS: Record<string, React.ReactNode> = {
  friend_request: <UserPlus size={14} className="text-[var(--color-accent)]" />,
  friend_accepted: <UserCheck size={14} className="text-[var(--color-success)]" />,
  like: <Heart size={14} className="text-[var(--color-danger)]" />,
  comment: <MessageCircle size={14} className="text-[var(--color-accent)]" />,
}

export default function NotificationsPage() {
  const { t } = useTranslation()
  const [items, setItems] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [marking, setMarking] = useState(false)

  useEffect(() => {
    let cancelled = false
    socialApi
      .notifications()
      .then((res) => {
        if (!cancelled) setItems(res.data ?? [])
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

  const formatTime = (iso: string | null) => {
    if (!iso) return ''
    const d = new Date(iso)
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

  return (
    <div className="max-w-2xl mx-auto py-8 px-6">
      <FadeIn>
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-heading text-xl font-semibold text-[var(--color-text)] flex items-center gap-2">
            <Bell size={22} className="text-[var(--color-accent)]" />
            {t('notifications.title')}
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 text-xs rounded-full bg-[var(--color-danger)] text-white">{unreadCount}</span>
            )}
          </h1>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              disabled={marking}
              className="secondary-button"
            >
              {marking ? <Loader2 size={13} className="animate-spin" /> : <CheckCheck size={13} />}
              {t('notifications.markAllRead')}
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={22} className="animate-spin text-[var(--color-text-tertiary)]" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-sm text-[var(--color-text-tertiary)] flex flex-col items-center gap-2">
            <Inbox size={28} className="opacity-50" />
            {t('notifications.empty')}
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((n) => (
              <div
                key={n.id}
                className={`flex items-start gap-3 px-4 py-3 rounded-lg border transition-colors ${
                  n.read
                    ? 'bg-[var(--color-card)] border-[var(--color-border)]'
                    : 'bg-[var(--color-accent-bg)] border-[var(--color-accent)]'
                }`}
              >
                <div className="mt-0.5 shrink-0">{TYPE_ICONS[n.type] ?? <Bell size={14} />}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-[var(--color-text)] leading-snug">{renderText(n)}</p>
                  <p className="text-[11px] text-[var(--color-text-tertiary)] mt-1">{formatTime(n.created_at)}</p>
                </div>
                {!n.read && <span className="mt-1.5 w-2 h-2 rounded-full bg-[var(--color-danger)] shrink-0" />}
              </div>
            ))}
          </div>
        )}
      </FadeIn>
    </div>
  )
}
