import { useState } from 'react'
import { Outlet, Navigate, useLocation } from 'react-router-dom'
import Sidebar from '../components/layout/Sidebar'
import Pet from '../components/pet/Pet'
import CommandPalette from '../components/common/CommandPalette'
import { useUserStore } from '../stores/useUserStore'
import { useSettingsSync } from '../hooks/useSettingsSync'
import '../styles/knowledge-pages.css'
import '../styles/learning-pages.css'
import '../styles/social-pages.css'
import '../styles/note-authoring.css'

export default function MainLayout() {
  const isLogin = useUserStore((s) => s.isLogin)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const location = useLocation()
  const shellVariant = location.pathname === '/'
    ? ' is-dashboard'
    : location.pathname === '/notes/new' || /^\/notes\/[^/]+$/.test(location.pathname)
      ? ' is-note-authoring'
    : ['/notes', '/knowledge', '/graph', '/stats', '/plaza'].includes(location.pathname)
      ? ' is-knowledge'
      : location.pathname === '/sessions' || location.pathname === '/chat' || location.pathname.startsWith('/chat/')
        ? ' is-ai'
        : ['/review', '/habit', '/pomodoro'].includes(location.pathname)
          ? ' is-learning'
          : ['/social', '/friends', '/messages', '/notifications'].includes(location.pathname)
            ? ' is-social'
        : ''

  // 养成数据上云同步（小卷 + 打卡；登录后拉取，变更防抖上传）
  useSettingsSync(isLogin)

  if (!isLogin) {
    return <Navigate to="/login" replace />
  }

  return (
    <>
    {/* 全局弹层位于工作区层叠上下文之外，确保覆盖悬浮页宠。 */}
    <div className="global-command-palette"><CommandPalette /></div>
    <div className={`app-shell${shellVariant}`}>
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
      <main className="app-workspace">
        {/* 页面切换：仅纯 CSS 透明度淡入（key 变化触发重挂载，无 transform/布局副作用，
            不会引起滚动条宽度抖动）。
            ⚠️ AI 聊天会话（/chat 与 /chat/:id）归一化为同一 key：首问回答完自动跳转
            /chat/:id 时若重挂载，防闪屏守卫（AIChat 内 ref）会随组件销毁失效，
            导致历史重新加载 + 淡入动画的整页闪屏 */}
        <div key={location.pathname.startsWith('/chat') ? '/chat' : location.pathname} className="page-enter h-full">
          <Outlet />
        </div>
      </main>
    </div>
    {/* 独立于滚动工作区，跨路由保持挂载、保留成长事件监听。 */}
    <Pet /></>
  )
}
