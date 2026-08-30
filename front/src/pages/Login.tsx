import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff, LockKeyhole, LogIn, UserRound } from 'lucide-react'
import { authApi } from '../api/auth'
import { useUserStore } from '../stores/useUserStore'
import { useLanguageStore } from '../stores/useLanguageStore'
import i18n from '../i18n'
import { FadeIn } from '../components/common/motion'

export default function Login() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const login = useUserStore((s) => s.login)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !password) { setError('请输入用户名和密码'); return }
    setLoading(true)
    setError('')
    try {
      const res = await authApi.login(username, password)
      login(res.token, res.user)
      i18n.changeLanguage(useLanguageStore.getState().lang)
      navigate('/')
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
      if (detail && typeof detail === 'object') {
        const msg = Object.values(detail as Record<string, unknown>).flat().join('；')
        setError(msg || '登录失败，请检查用户名和密码')
      } else if (typeof detail === 'string') {
        setError(detail)
      } else {
        setError('登录失败，请检查用户名和密码')
      }
    } finally {
      setLoading(false)
    }
  }

  const fillTestAccount = () => {
    setUsername('admin')
    setPassword('admin1234')
  }

  return (
    <FadeIn y={12} className="auth-form-page auth-form-page--login">
      <header className="auth-form-header">
        <span className="auth-form-kicker">{t('auth.loginKicker')}</span>
        <h2>{t('auth.welcomeBack')}</h2>
        <p>{t('auth.loginSubtitle')}</p>
      </header>

      <form onSubmit={handleLogin} className="auth-form">
        {error && (
          <div className="auth-alert auth-alert--danger" role="alert">
            {error}
          </div>
        )}

        <div className="auth-field">
          <label htmlFor="login-username">{t('auth.username')}</label>
          <div className="auth-input-wrap">
            <UserRound size={17} />
            <input id="login-username" type="text" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t('auth.usernamePlaceholder')} />
          </div>
        </div>

        <div className="auth-field">
          <div className="auth-label-row">
            <label htmlFor="login-password">{t('auth.password')}</label>
            <Link to="/forgot-password" state={{ authDirection: -1 }}>{t('auth.forgotPassword')}</Link>
          </div>
          <div className="auth-input-wrap">
            <LockKeyhole size={17} />
            <input id="login-password" type={showPwd ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('auth.passwordPlaceholder')} />
            <button type="button" onClick={() => setShowPwd(!showPwd)} className="auth-input-action" aria-label={t(showPwd ? 'auth.hidePassword' : 'auth.showPassword')}>
              {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="auth-primary-button"
        >
          {loading ? (
            <span className="auth-spinner" />
          ) : (
            <LogIn size={16} />
          )}
          {t('auth.login')}
        </button>
      </form>

      <footer className="auth-form-footer">
        <button onClick={fillTestAccount} className="auth-quiet-action">
          {t('auth.testAccount')}
        </button>
        <p>
          {t('auth.noAccount')}{' '}
          <Link to="/register" state={{ authDirection: 1 }}>{t('auth.createAccount')}</Link>
        </p>
      </footer>
    </FadeIn>
  )
}
