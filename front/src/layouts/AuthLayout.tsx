import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export default function AuthLayout() {
  const { t } = useTranslation()
  const { pathname } = useLocation()

  // 标签页标题：登录 / 注册
  useEffect(() => {
    const key = pathname === '/register' ? 'auth.register' : 'auth.login'
    document.title = `${t(key)} · 云舒卷`
  }, [pathname, t])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)] relative">
      {/* 氛围光晕背景 */}
      <div className="aurora-bg" aria-hidden>
        <div className="aurora-blob aurora-blob-1" />
        <div className="aurora-blob aurora-blob-2" />
        <div className="aurora-blob aurora-blob-3" />
      </div>
      <div className="w-full max-w-md mx-auto p-8">
        <Outlet />
      </div>
    </div>
  )
}
