import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Bell, Cloud, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useUserStore } from '../../stores/useUserStore'
import { usePetStore } from '../../stores/usePetStore'

export function LearningTopbar() {
  const { i18n, t } = useTranslation()
  const english = i18n.resolvedLanguage?.startsWith('en')
  const user = useUserStore((state) => state.userInfo)
  const visible = usePetStore((state) => state.visible)
  const setVisible = usePetStore((state) => state.setVisible)

  return (
    <div className="learning-topbar">
      <span className="learning-breadcrumb">{english ? 'Growth' : '学习成长'}</span>
      <button
        type="button"
        className="learning-global-search"
        onClick={() => window.dispatchEvent(new Event('open-command-palette'))}
      >
        <Search size={17} />
        <span>{english ? 'Search notes, knowledge, or ask AI…' : '搜索笔记、知识库或向 AI 提问…'}</span>
        <kbd>{/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K'}</kbd>
      </button>
      <div className="learning-top-actions">
        <button
          type="button"
          className="workspace-icon-button"
          aria-label={t(visible ? 'palette.hidePet' : 'palette.showPet')}
          title={t(visible ? 'palette.hidePet' : 'palette.showPet')}
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
        >
          <Cloud size={20} />
        </button>
        <Link className="workspace-icon-button" to="/notifications" aria-label={t('nav.notifications')}>
          <Bell size={19} />
        </Link>
        <Link className="learning-avatar" to="/profile" aria-label={t('nav.profile')}>
          {user?.avatar ? <img src={user.avatar} alt="" /> : (user?.username?.slice(0, 1) || '云')}
        </Link>
      </div>
    </div>
  )
}

export function LearningHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle: string
  actions?: ReactNode
}) {
  return (
    <header className="learning-header">
      <div className="learning-header-copy">
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {actions && <div className="learning-header-actions">{actions}</div>}
    </header>
  )
}

export default function LearningLayout({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`learning-page ${className}`}>
      <LearningTopbar />
      {children}
    </section>
  )
}
