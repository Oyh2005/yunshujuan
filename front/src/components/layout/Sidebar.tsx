import { useState, useEffect, useSyncExternalStore } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileText,
  MessageSquare,
  History,
  GraduationCap,
  Library,
  Cloud,
  Flame,
  BarChart3,
  Network,
  Rss,
  Users,
  Bell,
  Compass,
  ChevronDown,
  Timer,
  Settings,
  User,
  Info,
  LogOut,
  Columns2,
  House,
} from 'lucide-react'
import { useUserStore } from '../../stores/useUserStore'
import { authApi } from '../../api/auth'
import { socialApi } from '../../api/social'
import ConfirmDialog from '../common/ConfirmDialog'
import AuthImage from '../common/AuthImage'

const compactQuery = '(max-width: 767px)'
function subscribeToWidth(callback: () => void) {
  const query = window.matchMedia(compactQuery)
  query.addEventListener('change', callback)
  return () => query.removeEventListener('change', callback)
}
const getCompactSnapshot = () => window.matchMedia(compactQuery).matches

/** 导航分组：按功能域组织（折叠时组标题隐藏） */
const navGroups: { labelKey: string; items: { path: string; icon: React.ComponentType<{ size?: number; className?: string }>; labelKey: string }[] }[] = [
  {
    labelKey: 'nav.groupKnowledge',
    items: [
      { path: '/notes', icon: FileText, labelKey: 'nav.notes' },
      { path: '/knowledge', icon: Library, labelKey: 'nav.knowledge' },
      { path: '/graph', icon: Network, labelKey: 'nav.graph' },
      { path: '/stats', icon: BarChart3, labelKey: 'nav.stats' },
      { path: '/plaza', icon: Compass, labelKey: 'nav.plaza' },
    ],
  },
  {
    labelKey: 'nav.groupAI',
    items: [
      { path: '/chat', icon: MessageSquare, labelKey: 'nav.chat' },
      { path: '/sessions', icon: History, labelKey: 'nav.sessions' },
    ],
  },
  {
    labelKey: 'nav.groupLearn',
    items: [
      { path: '/review', icon: GraduationCap, labelKey: 'nav.review' },
      { path: '/habit', icon: Flame, labelKey: 'nav.habit' },
      { path: '/pomodoro', icon: Timer, labelKey: 'nav.pomodoro' },
    ],
  },
  {
    labelKey: 'nav.groupSocial',
    items: [
      { path: '/social', icon: Rss, labelKey: 'nav.social' },
      { path: '/friends', icon: Users, labelKey: 'nav.friends' },
      { path: '/notifications', icon: Bell, labelKey: 'nav.notifications' },
    ],
  },
]

const bottomItems = [
  { path: '/profile', icon: User, labelKey: 'nav.profile' },
  { path: '/settings', icon: Settings, labelKey: 'nav.settings' },
  { path: '/about', icon: Info, labelKey: 'nav.about' },
]

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const logout = useUserStore((s) => s.logout)
  const userInfo = useUserStore((s) => s.userInfo)
  const mobile = useSyncExternalStore(subscribeToWidth, getCompactSnapshot, () => false)
  const compact = collapsed || mobile
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [unread, setUnread] = useState(0)
  /** 组级折叠状态：labelKey -> 是否收起（默认全展开） */
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})

  const toggleGroup = (labelKey: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [labelKey]: !prev[labelKey] }))
  }

  // 未读通知数（进入时 + 每 30s 轮询，setState 均在异步回调中）
  useEffect(() => {
    let cancelled = false
    const load = () => {
      socialApi
        .unreadCount()
        .then((res) => {
          if (!cancelled) setUnread(res.data?.count ?? 0)
        })
        .catch(() => {})
    }
    load()
    const timer = setInterval(load, 30000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  const handleLogout = async () => {
    try { await authApi.logout() } catch { /* ignore */ }
    logout()
    navigate('/login')
  }

  return (
    <aside className={`app-sidebar${compact ? ' is-collapsed' : ''}`}>
      <div className="sidebar-brand">
        {!compact && (
          <NavLink to="/" className="sidebar-logo" aria-label={t('app.name')}>
            <Cloud size={31} strokeWidth={1.8} />
            <span>{t('app.name')}</span>
          </NavLink>
        )}
        {mobile ? (
          <NavLink to="/" className="sidebar-mobile-logo" aria-label={t('app.name')}><Cloud size={29} /></NavLink>
        ) : (
          <button onClick={onToggle} className="workspace-icon-button sidebar-toggle" title={collapsed ? t('nav.expand') : t('nav.collapse')} aria-label={collapsed ? t('nav.expand') : t('nav.collapse')} aria-expanded={!collapsed}>
            <Columns2 size={17} />
          </button>
        )}
      </div>

      <nav className="sidebar-navigation" aria-label={t('nav.navigation')}>
        <NavLink to="/" end className={({ isActive }) => `nav-item sidebar-link sidebar-home-link${isActive ? ' active' : ''}`} title={t('nav.home')} aria-label={t('nav.home')}><House size={18} />{!compact && <span className="sidebar-label">{t('nav.home')}</span>}</NavLink>
        {navGroups.map((group) => {
          const groupCollapsed = !!collapsedGroups[group.labelKey]
          return (
            <div key={group.labelKey} className="sidebar-section">
              {!compact && (
                <button
                  onClick={() => toggleGroup(group.labelKey)}
                  className="sidebar-group-toggle"
                  aria-expanded={!groupCollapsed}
                  aria-controls={`sidebar-${group.labelKey}`}
                >
                  {t(group.labelKey)}
                  <ChevronDown
                    size={14}
                    className={`transition-transform duration-200 ${groupCollapsed ? '-rotate-90' : ''}`}
                  />
                </button>
              )}
              <AnimatePresence initial={false}>
                {(compact || !groupCollapsed) && (
                  <motion.div
                    key={`items-${group.labelKey}`}
                    id={`sidebar-${group.labelKey}`}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                    className="space-y-1 overflow-hidden"
                  >
                    {group.items.map(({ path, icon: Icon, labelKey }) => (
                      <NavLink
                        key={path}
                        to={path}
                        className={({ isActive }) =>
                          `nav-item sidebar-link${isActive ? ' active' : ''}`
                        }
                        title={t(labelKey)}
                        aria-label={t(labelKey)}
                      >
                        <span className="relative inline-flex">
                          <Icon size={18} />
                          {path === '/notifications' && unread > 0 && (
                            <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-[var(--color-danger)] text-white text-[10px] font-medium flex items-center justify-center">
                              {unread > 99 ? '99+' : unread}
                            </span>
                          )}
                        </span>
                        {!compact && <span className="sidebar-label">{t(labelKey)}</span>}
                      </NavLink>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </nav>

      <div className="sidebar-footer">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button className="sidebar-account" aria-label={t('nav.accountMenu')} title={t('nav.accountMenu')}>
              <span className="sidebar-avatar">
                {userInfo?.avatar ? <AuthImage src={userInfo.avatar} alt="" className="w-full h-full object-cover" /> : (userInfo?.username?.slice(0, 1).toUpperCase() || <User size={18} />)}
              </span>
              {!compact && <><span className="sidebar-account-copy"><strong>{userInfo?.username || t('nav.workspace')}</strong><small>{t('nav.workspace')}</small></span><Settings size={17} className="text-[var(--color-text-secondary)]" /></>}
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="workspace-menu" side="top" align="start" sideOffset={10} collisionPadding={12}>
              {bottomItems.map(({ path, icon: Icon, labelKey }) => (
                <DropdownMenu.Item key={path} className="workspace-menu-item" onSelect={() => navigate(path)}><Icon size={16} />{t(labelKey)}</DropdownMenu.Item>
              ))}
              <DropdownMenu.Separator className="workspace-menu-separator" />
              <DropdownMenu.Item className="workspace-menu-item workspace-menu-danger" onSelect={() => setShowLogoutConfirm(true)}><LogOut size={16} />{t('nav.logout')}</DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      <ConfirmDialog
        open={showLogoutConfirm}
        onOpenChange={setShowLogoutConfirm}
        title={t('nav.logoutConfirmTitle')}
        message={t('nav.logoutConfirmMessage')}
        variant="danger"
        confirmText={t('nav.logoutConfirm')}
        cancelText={t('common.cancel')}
        onConfirm={handleLogout}
      />
    </aside>
  )
}
