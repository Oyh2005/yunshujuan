import { useTranslation } from 'react-i18next'
import { Sun, Moon, Languages, Cloud, Type } from 'lucide-react'
import { useThemeStore } from '../stores/useThemeStore'
import { useLanguageStore } from '../stores/useLanguageStore'
import { usePetStore } from '../stores/usePetStore'
import { useChatFontStore, CHAT_FONT_MIN, CHAT_FONT_MAX } from '../stores/useChatFontStore'
import i18n from '../i18n'
import AccountLayout, { AccountHeader } from '../components/account/AccountLayout'
import type { Lang } from '../stores/useLanguageStore'

export default function Settings() {
  const { t } = useTranslation()
  const { theme, setTheme } = useThemeStore()
  const { lang, setLang } = useLanguageStore()
  const petVisible = usePetStore((s) => s.visible)
  const setPetVisible = usePetStore((s) => s.setVisible)
  const chatFontSize = useChatFontStore((s) => s.size)
  const setChatFontSize = useChatFontStore((s) => s.setSize)

  const handleLangChange = (newLang: Lang) => {
    setLang(newLang)
    i18n.changeLanguage(newLang)
  }

  return (
    <AccountLayout>
      <AccountHeader
        breadcrumb={t('account.breadcrumb')}
        title={t('settings.title')}
        subtitle={t('account.settingsSubtitle')}
      />

      <div className="account-body">
        <section className="account-panel">
          <h2 className="account-panel-title">{t('account.appearance')}</h2>

          <div className="account-setting-row">
            <div className="account-setting-copy">
              <span className="account-setting-icon">
                {theme === 'light' ? <Sun size={19} /> : <Moon size={19} />}
              </span>
              <span className="account-setting-text">
                <strong>{t('settings.theme')}</strong>
                <small>{t(theme === 'light' ? 'settings.light' : 'settings.dark')}</small>
              </span>
            </div>
            <button
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              role="switch"
              aria-label={t('settings.theme')}
              aria-checked={theme === 'dark'}
              className="account-switch"
            />
          </div>

          <div className="account-setting-row">
            <div className="account-setting-copy">
              <span className="account-setting-icon"><Languages size={19} /></span>
              <span className="account-setting-text">
                <strong>{t('settings.language')}</strong>
                <small>{lang === 'zh-CN' ? '简体中文' : 'English'}</small>
              </span>
            </div>
            <div className="account-segmented">
              <button
                onClick={() => handleLangChange('zh-CN')}
                aria-pressed={lang === 'zh-CN'}
              >
                中文
              </button>
              <button
                onClick={() => handleLangChange('en-US')}
                aria-pressed={lang === 'en-US'}
              >
                English
              </button>
            </div>
          </div>
        </section>

        <section className="account-panel">
          <h2 className="account-panel-title">{t('account.petSection')}</h2>
          <div className="account-setting-row">
            <div className="account-setting-copy">
              <span className="account-setting-icon"><Cloud size={19} /></span>
              <span className="account-setting-text">
                <strong>{t('settings.pet')}</strong>
                <small>{t('settings.petDesc')}</small>
              </span>
            </div>
            <button
              onClick={() => setPetVisible(!petVisible)}
              role="switch"
              aria-label={t('settings.pet')}
              aria-checked={petVisible}
              className="account-switch"
            />
          </div>
        </section>

        <section className="account-panel">
          <div className="account-setting-row">
            <div className="account-setting-copy">
              <span className="account-setting-icon"><Type size={19} /></span>
              <span className="account-setting-text">
                <strong>{t('settings.chatFont')}</strong>
                <small>{t('settings.chatFontDesc')}</small>
              </span>
            </div>
            <span className="account-slider-value">{chatFontSize}px</span>
          </div>

          <div className="account-slider-row">
            <span>{t('settings.chatFontSmall')}</span>
            <input
              type="range"
              min={CHAT_FONT_MIN}
              max={CHAT_FONT_MAX}
              step={1}
              value={chatFontSize}
              onChange={(e) => setChatFontSize(Number(e.target.value))}
              aria-label={t('settings.chatFont')}
            />
            <span>{t('settings.chatFontLarge')}</span>
          </div>

          {/* 实时预览：仿私聊界面，滑块拖动时字号即时变化 */}
          <div className="account-chat-preview" style={{ fontSize: `${chatFontSize}px` }}>
            <div className="chat-bubble is-theirs">{t('settings.chatFontPreviewTheirs')}</div>
            <div className="chat-bubble is-mine">{t('settings.chatFontPreviewMine')}</div>
            <div className="chat-bubble is-input">{t('settings.chatFontPreviewInput')}</div>
          </div>
        </section>
      </div>
    </AccountLayout>
  )
}
