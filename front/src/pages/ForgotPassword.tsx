import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Mail } from 'lucide-react'
import { FadeIn } from '../components/common/motion'

export default function ForgotPassword() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email.trim())) {
      setMessage(t('auth.emailInvalid'))
      return
    }
    // The password-recovery API is intentionally not wired yet. Keep the
    // frontend flow honest until the backend endpoint is available.
    setMessage(t('auth.recoveryPending'))
  }

  return (
    <FadeIn y={12} className="auth-form-page auth-form-page--recovery">
      <header className="auth-form-header auth-form-header--centered">
        <span className="auth-form-icon">
          <Mail size={22} />
        </span>
        <h2>{t('auth.recoveryTitle')}</h2>
        <p>{t('auth.recoverySubtitle')}</p>
      </header>

      <form onSubmit={handleSubmit} className="auth-form">
        {message && (
          <div className="auth-alert auth-alert--info" role="status">
            {message}
          </div>
        )}

        <div className="auth-field">
          <label htmlFor="recovery-email">{t('auth.email')}</label>
          <div className="auth-input-wrap">
            <Mail size={17} />
            <input id="recovery-email" type="email" autoComplete="email" value={email} onChange={(event) => { setEmail(event.target.value); setMessage('') }} placeholder={t('auth.recoveryEmailPlaceholder')} />
          </div>
        </div>

        <button type="submit" className="auth-primary-button">
          <Mail size={16} />
          {t('auth.sendRecovery')}
        </button>
      </form>

      <Link to="/login" state={{ authDirection: 1 }} className="auth-back-link">
        <ArrowLeft size={15} />
        {t('auth.backToLogin')}
      </Link>
    </FadeIn>
  )
}
