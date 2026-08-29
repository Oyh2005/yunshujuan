import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Bell, Cloud, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import AuthImage from '../common/AuthImage'
import { usePetStore } from '../../stores/usePetStore'
import { useUserStore } from '../../stores/useUserStore'

function useSocialText() {
  const { i18n } = useTranslation()
  const english = i18n.resolvedLanguage?.startsWith('en')
  return (zh: string, en: string) => english ? en : zh
}

export function SocialTopbar() {
  const text = useSocialText()
  const user = useUserStore((state) => state.userInfo)
  const visible = usePetStore((state) => state.visible)
  const setVisible = usePetStore((state) => state.setVisible)

  return (
    <header className="social-topbar">
      <span className="social-breadcrumb">{text('社交空间', 'Social space')}</span>
      <button className="social-global-search" onClick={() => window.dispatchEvent(new Event('open-command-palette'))}>
        <Search size={17} />
        <span>{text('搜索笔记、知识库或向 AI 提问…', 'Search notes, resources, or ask AI…')}</span>
        <kbd>{/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K'}</kbd>
      </button>
      <div className="social-top-actions">
        <button
          className="workspace-icon-button"
          aria-label={text(visible ? '隐藏页宠' : '显示页宠', visible ? 'Hide companion' : 'Show companion')}
          title={text(visible ? '隐藏页宠' : '显示页宠', visible ? 'Hide companion' : 'Show companion')}
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
        >
          <Cloud size={20} />
        </button>
        <Link className="workspace-icon-button" to="/notifications" aria-label={text('通知', 'Notifications')}><Bell size={19} /></Link>
        <Link className="social-avatar social-avatar--profile" to="/profile" aria-label={text('个人信息', 'Profile')}>
          {user?.avatar ? <AuthImage src={user.avatar} alt="" /> : (user?.username?.slice(0, 1) || '云')}
        </Link>
      </div>
    </header>
  )
}

export function SocialHeader({ title, subtitle, badge, actions }: { title: string; subtitle: string; badge?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="social-page-header">
      <div>
        <div className="social-title-row"><h1>{title}</h1>{badge}</div>
        <p>{subtitle}</p>
      </div>
      {actions && <div className="social-header-actions">{actions}</div>}
    </header>
  )
}

export function SocialAvatar({ username, avatar, size = 42 }: { username: string; avatar: string | null; size?: number }) {
  return (
    <span className="social-avatar" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {avatar ? <AuthImage src={avatar} alt={username} /> : username.slice(0, 1).toUpperCase()}
    </span>
  )
}

export function SocialPetCard({ title, message }: { title: string; message: string }) {
  return (
    <section className="social-card social-pet-card">
      <h2>{title}</h2>
      <div className="social-pet-scene">
        <div className="social-pet-bubble">{message}</div>
        <img src="/illustrations/study-cloud.png" alt="" />
        <span aria-hidden="true">✧</span>
      </div>
    </section>
  )
}

export default function SocialLayout({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`social-page ${className}`}><SocialTopbar />{children}</section>
}
