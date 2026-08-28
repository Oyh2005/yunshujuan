import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Bell, Cloud, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useUserStore } from '../../stores/useUserStore'
import { usePetStore } from '../../stores/usePetStore'

/** Five knowledge pages share the homepage's navigation, search and surface rhythm. */
export function KnowledgeTopbar() {
  const { t } = useTranslation()
  const user = useUserStore((s) => s.userInfo)
  const visible = usePetStore((s) => s.visible)
  const setVisible = usePetStore((s) => s.setVisible)
  return <div className="knowledge-topbar">
    <span className="knowledge-breadcrumb">{t('knowledgeUI.space')}</span>
    <button className="knowledge-global-search" onClick={() => window.dispatchEvent(new Event('open-command-palette'))}>
      <Search size={17} /><span>{t('knowledgeUI.search')}</span><kbd>{/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K'}</kbd>
    </button>
    <div className="knowledge-top-actions">
      <button className="workspace-icon-button" aria-label={t(visible ? 'palette.hidePet' : 'palette.showPet')} title={t(visible ? 'palette.hidePet' : 'palette.showPet')} aria-pressed={visible} onClick={() => setVisible(!visible)}><Cloud size={20} /></button>
      <Link className="workspace-icon-button" to="/notifications" aria-label={t('nav.notifications')}><Bell size={19} /></Link>
      <Link className="knowledge-avatar" to="/profile" aria-label={t('nav.profile')}>{user?.avatar ? <img src={user.avatar} alt="" /> : (user?.username?.slice(0, 1) || '云')}</Link>
    </div>
  </div>
}

export function KnowledgeHeader({ title, subtitle, actions, hero = false }: { title: string; subtitle: string; actions?: ReactNode; hero?: boolean }) {
  return <header className={`knowledge-header${hero ? ' knowledge-hero' : ''}`}>
    <div className="knowledge-header-copy"><h1>{title}</h1><p>{subtitle}</p></div>
    {hero && <img className="knowledge-hero-cloud" src="/illustrations/study-cloud.png" alt="" />}
    {actions && <div className="knowledge-header-actions">{actions}</div>}
  </header>
}

export default function KnowledgeLayout({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`knowledge-page ${className}`}><KnowledgeTopbar />{children}</section>
}
