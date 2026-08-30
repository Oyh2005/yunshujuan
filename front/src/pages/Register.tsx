import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff, LockKeyhole, Mail, Phone, UserPlus, UserRound } from 'lucide-react'
import { authApi } from '../api/auth'
import { useUserStore } from '../stores/useUserStore'
import { FadeIn } from '../components/common/motion'

export default function Register() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const login = useUserStore((s) => s.login)
  const [form, setForm] = useState({ username: '', email: '', phone: '', password: '', confirmPassword: '' })
  const [showPassword, setShowPassword] = useState({ password: false, confirmPassword: false })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleChange = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.username || !form.password || !form.email) { setError('请填写必填字段'); return }
    if (form.password !== form.confirmPassword) { setError('两次密码不一致'); return }
    setLoading(true)
    setError('')
    try {
      const res = await authApi.register({
        username: form.username,
        password: form.password,
        email: form.email,
        telephone: form.phone || undefined,
        confirm_password: form.confirmPassword,
      })
      login(res.token, res.user)
      navigate('/notes')
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
      if (detail && typeof detail === 'object') {
        const msg = Object.values(detail as Record<string, unknown>).flat().join('；')
        setError(msg || '注册失败，请重试')
      } else if (typeof detail === 'string') {
        setError(detail)
      } else {
        setError('注册失败，请重试')
      }
    } finally {
      setLoading(false)
    }
  }

  const fields = [
    { key: 'username', label: t('auth.username'), placeholder: t('auth.registerUsernamePlaceholder'), required: true, icon: UserRound, autoComplete: 'username' },
    { key: 'email', label: t('auth.email'), placeholder: t('auth.emailPlaceholder'), type: 'email', required: true, icon: Mail, autoComplete: 'email' },
    { key: 'phone', label: t('auth.phone'), placeholder: t('auth.optional'), type: 'tel', icon: Phone, autoComplete: 'tel' },
    { key: 'password', label: t('auth.password'), placeholder: t('auth.registerPasswordPlaceholder'), type: 'password', required: true, icon: LockKeyhole, autoComplete: 'new-password' },
    { key: 'confirmPassword', label: t('auth.confirmPassword'), placeholder: t('auth.confirmPasswordPlaceholder'), type: 'password', required: true, icon: LockKeyhole, autoComplete: 'new-password' },
  ]

  return (
    <FadeIn y={12} className="auth-form-page auth-form-page--register">
      <header className="auth-form-header">
        <span className="auth-form-kicker">{t('auth.registerKicker')}</span>
        <h2>{t('auth.registerTitle')}</h2>
        <p>{t('auth.registerSubtitle')}</p>
      </header>

      <form onSubmit={handleSubmit} className="auth-form auth-form--compact">
        {error && (
          <div className="auth-alert auth-alert--danger" role="alert">{error}</div>
        )}

        {fields.map(({ key, label, placeholder, type = 'text', required, icon: Icon, autoComplete }) => {
          const passwordKey = key === 'password' || key === 'confirmPassword' ? key : null
          const visible = passwordKey ? showPassword[passwordKey] : false
          return <div key={key} className="auth-field">
            <label htmlFor={`register-${key}`}>
              {label}{required && <span className="text-[var(--color-danger)] ml-0.5">*</span>}
            </label>
            <div className="auth-input-wrap">
              <Icon size={16} />
              <input id={`register-${key}`} type={passwordKey ? (visible ? 'text' : 'password') : type} autoComplete={autoComplete} value={form[key as keyof typeof form]} onChange={(e) => handleChange(key, e.target.value)} placeholder={placeholder} />
              {passwordKey && <button type="button" className="auth-input-action" onClick={() => setShowPassword((current) => ({ ...current, [passwordKey]: !current[passwordKey] }))} aria-label={t(visible ? 'auth.hidePassword' : 'auth.showPassword')}>
                {visible ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>}
            </div>
          </div>
        })}

        <button
          type="submit"
          disabled={loading}
          className="auth-primary-button"
        >
          {loading ? (
            <span className="auth-spinner" />
          ) : (
            <UserPlus size={16} />
          )}
          {t('auth.register')}
        </button>
      </form>

      <p className="auth-switch-link">
        {t('auth.hasAccount')}{' '}
        <Link to="/login" state={{ authDirection: -1 }}>{t('auth.goLogin')}</Link>
      </p>
    </FadeIn>
  )
}
