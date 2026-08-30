import { useEffect } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Cloud, FileText, Heart, Network, PenLine, ShieldCheck, Sparkles, Sprout } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'

export default function AuthLayout() {
  const { t } = useTranslation()
  const location = useLocation()
  const { pathname } = location
  const reduceMotion = useReducedMotion()
  const variant = pathname === '/register' ? 'register' : pathname === '/forgot-password' ? 'recovery' : 'login'
  const routeState = location.state as { authDirection?: number } | null
  const direction = routeState?.authDirection === 1
    ? 1
    : routeState?.authDirection === -1 ? -1 : variant === 'register' ? 1 : -1

  // 标签页标题：登录 / 注册
  useEffect(() => {
    const key = pathname === '/register'
      ? 'auth.register'
      : pathname === '/forgot-password'
        ? 'auth.recoveryTitle'
        : 'auth.login'
    document.title = `${t(key)} · 云舒卷`
  }, [pathname, t])

  return (
    <div className={`auth-shell auth-shell--${variant}`}>
      <section className="auth-brand-panel" aria-labelledby="auth-story-title">
        <Link className="auth-brand" to="/login" state={{ authDirection: variant === 'recovery' ? 1 : -1 }} aria-label={t('app.name')}>
          <Cloud size={33} strokeWidth={2.1} />
          <strong>{t('app.name')}</strong>
        </Link>

        <div className="auth-orbit auth-orbit--one" aria-hidden />
        <div className="auth-orbit auth-orbit--two" aria-hidden />
        <span className="auth-float-icon auth-float-icon--document" aria-hidden><FileText size={23} /></span>
        <span className="auth-float-icon auth-float-icon--sparkle" aria-hidden><Sparkles size={22} /></span>

        <AnimatePresence mode="wait" initial={false} custom={direction}>
          <motion.div
            key={variant}
            className="auth-story"
            custom={direction}
            initial={reduceMotion ? false : { opacity: 0, x: direction * 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: direction * -18 }}
            transition={reduceMotion ? { duration: 0.01 } : { duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="auth-eyebrow"><Sparkles size={14} />{t(`auth.${variant}Eyebrow`)}</span>
            <h1 id="auth-story-title">
              {t(`auth.${variant}HeroLead`)}
              <strong>{t(`auth.${variant}HeroAccent`)}</strong>
            </h1>
            <p>{t(`auth.${variant}HeroDescription`)}</p>

            {variant === 'login' && <div className="auth-feature-chips" aria-label={t('auth.loginFeatures')}>
              <span><PenLine size={15} />{t('auth.featureRecord')}</span>
              <span><Network size={15} />{t('auth.featureConnect')}</span>
              <span><Heart size={15} />{t('auth.featureCompanion')}</span>
            </div>}

            {variant === 'register' && <ol className="auth-steps" aria-label={t('auth.registerSteps')}>
              <li><span><PenLine size={17} /></span><b>01</b>{t('auth.stepRecord')}</li>
              <li><span><Network size={17} /></span><b>02</b>{t('auth.stepConnect')}</li>
              <li><span><Sprout size={17} /></span><b>03</b>{t('auth.stepGrow')}</li>
            </ol>}

            {variant === 'recovery' && <div className="auth-recovery-note">
              <ShieldCheck size={18} />
              <span>{t('auth.recoveryPrivacy')}</span>
            </div>}
          </motion.div>
        </AnimatePresence>

        <img className="auth-mascot" src="/illustrations/study-cloud.png" alt="" />
      </section>

      <main className="auth-form-panel">
        <AnimatePresence mode="wait" initial={false} custom={direction}>
          <motion.div
            key={pathname}
            className={`auth-form-card auth-form-card--${variant}`}
            custom={direction}
            initial={reduceMotion ? false : { opacity: 0, x: direction * 54 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: direction * -42 }}
            transition={reduceMotion ? { duration: 0.01 } : { duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}
