import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Bell, Cloud, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useUserStore } from '../../stores/useUserStore'
import { usePetStore } from '../../stores/usePetStore'
import AuthImage from '../common/AuthImage'

/** 个人中心三页（/profile、/settings、/pet）共享的顶栏、页头与页面容器。
 *  与 KnowledgeLayout 同构：真实命令面板入口、页宠显隐、通知与头像。 */

const isMac = /Mac|iPhone|iPad/.test(navigator.platform)

export function AccountTopbar({ breadcrumb }: { breadcrumb: string }) {
  const { t } = useTranslation()
  const user = useUserStore((s) => s.userInfo)
  const visible = usePetStore((s) => s.visible)
  const setVisible = usePetStore((s) => s.setVisible)

  return (
    <div className="account-topbar">
      <span className="account-breadcrumb">{breadcrumb}</span>
      <button
        className="account-global-search"
        onClick={() => window.dispatchEvent(new Event('open-command-palette'))}
      >
        <Search size={17} />
        <span>{t('knowledgeUI.search')}</span>
        <kbd>{isMac ? '⌘ K' : 'Ctrl K'}</kbd>
      </button>
      <div className="account-top-actions">
        <button
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
        <Link className="account-avatar" to="/profile" aria-label={t('nav.profile')}>
          {user?.avatar
            ? <AuthImage src={user.avatar} alt="" className="w-full h-full object-cover" />
            : (user?.username?.slice(0, 1) || '云')}
        </Link>
      </div>
    </div>
  )
}

export function AccountHeader({ title, subtitle, breadcrumb, actions }: {
  title: string
  subtitle: string
  breadcrumb: string
  actions?: ReactNode
}) {
  return (
    <>
      <AccountTopbar breadcrumb={breadcrumb} />
      <header className="account-header">
        <div className="account-header-copy">
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        {actions && <div className="account-header-actions">{actions}</div>}
      </header>
    </>
  )
}

export default function AccountLayout({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`account-page ${className}`}>{children}</section>
}
