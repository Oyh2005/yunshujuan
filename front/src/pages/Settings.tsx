import { useTranslation } from 'react-i18next'
import { Sun, Moon, Languages, Cloud, Type } from 'lucide-react'
import { useThemeStore } from '../stores/useThemeStore'
import { useLanguageStore } from '../stores/useLanguageStore'
import { usePetStore } from '../stores/usePetStore'
import { useChatFontStore, CHAT_FONT_MIN, CHAT_FONT_MAX } from '../stores/useChatFontStore'
import i18n from '../i18n'

export default function Settings() {
  const { t } = useTranslation()
  const { theme, setTheme } = useThemeStore()
  const { lang, setLang } = useLanguageStore()
  const petVisible = usePetStore((s) => s.visible)
  const setPetVisible = usePetStore((s) => s.setVisible)
  const chatFontSize = useChatFontStore((s) => s.size)
  const setChatFontSize = useChatFontStore((s) => s.setSize)

  const handleLangChange = (newLang: 'zh-CN' | 'en-US') => {
    setLang(newLang)
    i18n.changeLanguage(newLang)
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-6">
      <h1 className="font-heading text-xl font-semibold text-[var(--color-text)] mb-8">{t('settings.title')}</h1>

      <div className="space-y-6">
        <div className="bg-[var(--color-card)] rounded-lg border border-[var(--color-border)] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {theme === 'light' ? <Sun size={18} className="text-[var(--color-text-secondary)]" /> : <Moon size={18} className="text-[var(--color-text-secondary)]" />}
              <div>
                <p className="text-sm font-medium text-[var(--color-text)]">{t('settings.theme')}</p>
                <p className="text-xs text-[var(--color-text-tertiary)]">{t(theme === 'light' ? 'settings.light' : 'settings.dark')}</p>
              </div>
            </div>
            <button
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              role="switch"
              aria-label={t('settings.theme')}
              aria-checked={theme === 'dark'}
              className={`relative w-12 h-6 rounded-full transition-colors ${theme === 'dark' ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-bg-tertiary)]'}`}
            >
              <div style={{ backgroundColor: theme === 'dark' ? 'var(--color-accent-foreground)' : 'var(--color-card)' }} className={`absolute top-0.5 w-5 h-5 rounded-full shadow-sm transition-transform ${theme === 'dark' ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </button>
          </div>
        </div>

        <div className="bg-[var(--color-card)] rounded-lg border border-[var(--color-border)] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Cloud size={18} className="text-[var(--color-text-secondary)]" />
              <div>
                <p className="text-sm font-medium text-[var(--color-text)]">{t('settings.pet')}</p>
                <p className="text-xs text-[var(--color-text-tertiary)]">{t('settings.petDesc')}</p>
              </div>
            </div>
            <button
              onClick={() => setPetVisible(!petVisible)}
              role="switch"
              aria-label={t('settings.pet')}
              aria-checked={petVisible}
              className={`relative w-12 h-6 rounded-full transition-colors ${petVisible ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-bg-tertiary)]'}`}
            >
              <div style={{ backgroundColor: petVisible ? 'var(--color-accent-foreground)' : 'var(--color-card)' }} className={`absolute top-0.5 w-5 h-5 rounded-full shadow-sm transition-transform ${petVisible ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </button>
          </div>
        </div>

        <div className="bg-[var(--color-card)] rounded-lg border border-[var(--color-border)] p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Type size={18} className="text-[var(--color-text-secondary)]" />
            <div className="flex-1">
              <p className="text-sm font-medium text-[var(--color-text)]">{t('settings.chatFont')}</p>
              <p className="text-xs text-[var(--color-text-tertiary)]">{t('settings.chatFontDesc')}</p>
            </div>
            <span className="text-sm font-semibold text-[var(--color-accent)]">{chatFontSize}px</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--color-text-tertiary)]">{t('settings.chatFontSmall')}</span>
            <input
              type="range"
              min={CHAT_FONT_MIN}
              max={CHAT_FONT_MAX}
              step={1}
              value={chatFontSize}
              onChange={(e) => setChatFontSize(Number(e.target.value))}
              className="flex-1 accent-[var(--color-accent)]"
              aria-label={t('settings.chatFont')}
            />
            <span className="text-xs text-[var(--color-text-tertiary)]">{t('settings.chatFontLarge')}</span>
          </div>
          {/* 实时预览：仿私聊界面，滑块拖动时字号即时变化 */}
          <div
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 space-y-2.5"
            style={{ fontSize: `${chatFontSize}px` } as React.CSSProperties}
          >
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-2xl rounded-bl-md border border-[var(--color-border-light)] bg-[var(--color-card)] px-3.5 py-2.5 leading-relaxed">
                {t('settings.chatFontPreviewTheirs')}
              </div>
            </div>
            <div className="flex justify-end">
              <div className="max-w-[80%] rounded-2xl rounded-br-md px-3.5 py-2.5 leading-relaxed text-white" style={{ background: 'var(--gradient-brand)' }}>
                {t('settings.chatFontPreviewMine')}
              </div>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-[var(--color-text-tertiary)]">
              {t('settings.chatFontPreviewInput')}
            </div>
          </div>
        </div>

        <div className="bg-[var(--color-card)] rounded-lg border border-[var(--color-border)] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Languages size={18} className="text-[var(--color-text-secondary)]" />
              <div>
                <p className="text-sm font-medium text-[var(--color-text)]">{t('settings.language')}</p>
                <p className="text-xs text-[var(--color-text-tertiary)]">{lang === 'zh-CN' ? '中文' : 'English'}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleLangChange('zh-CN')}
                className={`px-3 py-1.5 text-xs rounded-md transition-colors ${lang === 'zh-CN' ? 'bg-[var(--color-accent-bg)] text-[var(--color-accent)]' : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]'}`}
              >
                中文
              </button>
              <button
                onClick={() => handleLangChange('en-US')}
                className={`px-3 py-1.5 text-xs rounded-md transition-colors ${lang === 'en-US' ? 'bg-[var(--color-accent-bg)] text-[var(--color-accent)]' : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]'}`}
              >
                English
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
