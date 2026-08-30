import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import zhCN from './locales/zh-CN'
import enUS from './locales/en-US'

type SupportedLanguage = 'zh-CN' | 'en-US'

const DEFAULT_LANGUAGE: SupportedLanguage = 'zh-CN'

function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return value === 'zh-CN' || value === 'en-US'
}

/**
 * `useLanguageStore` uses Zustand persist, so the `language` key contains a
 * JSON object rather than a bare locale string. Keep support for the old bare
 * string format as well, and fall back safely when local data is malformed.
 */
function getInitialLanguage(): SupportedLanguage {
  const stored = localStorage.getItem('language')
  if (!stored) return DEFAULT_LANGUAGE
  if (isSupportedLanguage(stored)) return stored

  try {
    const persisted = JSON.parse(stored) as { state?: { lang?: unknown } }
    return isSupportedLanguage(persisted?.state?.lang) ? persisted.state.lang : DEFAULT_LANGUAGE
  } catch {
    return DEFAULT_LANGUAGE
  }
}

i18n.use(initReactI18next).init({
  resources: {
    'zh-CN': { translation: zhCN },
    'en-US': { translation: enUS },
  },
  lng: getInitialLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: { escapeValue: false },
})

export default i18n
