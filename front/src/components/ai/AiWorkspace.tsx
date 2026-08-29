import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Bell, Cloud, Search, Settings, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import AuthImage from '../common/AuthImage'
import { useUserStore } from '../../stores/useUserStore'
import { getPetLevel, usePetStore } from '../../stores/usePetStore'
import { getCharacter } from '../pet/characters/registry'

export function AiTopbar() {
  const { i18n } = useTranslation()
  const english = i18n.resolvedLanguage?.startsWith('en')
  const text = (zh: string, en: string) => english ? en : zh
  const user = useUserStore((state) => state.userInfo)
  const visible = usePetStore((state) => state.visible)
  const setVisible = usePetStore((state) => state.setVisible)

  return (
    <header className="ai-topbar">
      <span className="ai-breadcrumb">{text('AI 工作台', 'AI workspace')}</span>
      <button
        className="ai-global-search"
        onClick={() => window.dispatchEvent(new Event('open-command-palette'))}
      >
        <Search size={17} />
        <span>{text('搜索笔记、知识库或向 AI 提问…', 'Search notes, resources, or ask AI…')}</span>
        <kbd>{/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K'}</kbd>
      </button>
      <div className="ai-top-actions">
        <button
          className="workspace-icon-button"
          aria-label={text(visible ? '隐藏页宠' : '显示页宠', visible ? 'Hide companion' : 'Show companion')}
          title={text(visible ? '隐藏页宠' : '显示页宠', visible ? 'Hide companion' : 'Show companion')}
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
        >
          <Cloud size={20} />
        </button>
        <Link className="workspace-icon-button" to="/notifications" aria-label={text('通知', 'Notifications')}>
          <Bell size={19} />
        </Link>
        <Link className="ai-avatar" to="/profile" aria-label={text('个人信息', 'Profile')}>
          {user?.avatar ? <AuthImage src={user.avatar} alt="" /> : (user?.username?.slice(0, 1) || '云')}
        </Link>
      </div>
    </header>
  )
}

interface AiCompanionCardProps {
  title: string
  message: string
  action?: ReactNode
  compact?: boolean
}

export function AiCompanionCard({ title, message, action, compact = false }: AiCompanionCardProps) {
  const nickname = usePetStore((state) => state.nickname)
  const affection = usePetStore((state) => state.affection)
  const characterId = usePetStore((state) => state.characterId)
  const customImage = usePetStore((state) => state.customImage)
  const character = getCharacter(characterId)
  const activeCharacter = character.id === 'custom' && !customImage ? getCharacter('cloud') : character
  const Character = activeCharacter.Renderer
  const level = getPetLevel(affection)

  return (
    <section className={`ai-companion-card${compact ? ' is-compact' : ''}`}>
      <div className="ai-companion-heading">
        <div>
          <span><Sparkles size={13} />{nickname}</span>
          <h2>{title}</h2>
        </div>
        <Link to="/pet" className="workspace-icon-button" aria-label="页宠设置"><Settings size={17} /></Link>
      </div>
      <div className="ai-companion-scene">
        <div className="ai-companion-bubble">{message}</div>
        {activeCharacter.id === 'cloud' ? (
          <img src="/illustrations/study-cloud.png" alt={nickname} />
        ) : (
          <div className="ai-companion-character"><Character mood="happy" level={level} /></div>
        )}
        <span className="ai-companion-sparkle" aria-hidden="true">✧</span>
      </div>
      {action && <div className="ai-companion-action">{action}</div>}
    </section>
  )
}
