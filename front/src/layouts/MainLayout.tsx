import { useState } from 'react'
import { Outlet, Navigate, useLocation } from 'react-router-dom'
import Sidebar from '../components/layout/Sidebar'
import Pet from '../components/pet/Pet'
import CommandPalette from '../components/common/CommandPalette'
import { useUserStore } from '../stores/useUserStore'
import { useSettingsSync } from '../hooks/useSettingsSync'

export default function MainLayout() {
  const isLogin = useUserStore((s) => s.isLogin)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const location = useLocation()

  // 养成数据上云同步（小卷 + 打卡；登录后拉取，变更防抖上传）
  useSettingsSync(isLogin)

  if (!isLogin) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="app-shell">
      {/* 氛围光晕背景 */}
      <div className="aurora-bg" aria-hidden>
        <div className="aurora-blob aurora-blob-1" />
        <div className="aurora-blob aurora-blob-2" />
        <div className="aurora-blob aurora-blob-3" />
      </div>

      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
      />
      {/* 页宠「小卷」 */}
      <Pet />
      {/* 命令面板 ⌘K */}
      <CommandPalette />
      <main className="app-workspace">
        {/* 页面切换：仅纯 CSS 透明度淡入（key 变化触发重挂载，无 transform/布局副作用，
            不会引起滚动条宽度抖动） */}
        <div key={location.pathname} className="page-enter h-full">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
