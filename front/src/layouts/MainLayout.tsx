import { useEffect, useState } from 'react'
import { Outlet, Navigate, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import Sidebar from '../components/layout/Sidebar'
import Pet from '../components/pet/Pet'
import CommandPalette from '../components/common/CommandPalette'
import { useUserStore } from '../stores/useUserStore'
import { useSettingsSync } from '../hooks/useSettingsSync'
import { useChatSocket } from '../hooks/useChatSocket'
import { useChatStore } from '../stores/useChatStore'
import { PREFETCH_IDLE } from '../router/pages'

/** 路径前缀 → i18n 标题键（复用 nav.*；按前缀匹配，/notes/:id 等参数页归入所属域） */
const TITLE_BY_PATH: Array<[string, string]> = [
  ['/notes', 'nav.notes'],
  ['/chat', 'nav.chat'],
  ['/sessions', 'nav.sessions'],
  ['/review', 'nav.review'],
  ['/habit', 'nav.habit'],
  ['/pomodoro', 'nav.pomodoro'],
  ['/knowledge', 'nav.knowledge'],
  ['/stats', 'nav.stats'],
  ['/graph', 'nav.graph'],
  ['/plaza', 'nav.plaza'],
  ['/social', 'nav.social'],
  ['/friends', 'nav.friends'],
  ['/messages', 'nav.messages'],
  ['/notifications', 'nav.notifications'],
  ['/profile', 'nav.profile'],
  ['/settings', 'nav.settings'],
  ['/about', 'nav.about'],
]

function titleKeyForPath(pathname: string): string {
  if (pathname === '/') return 'nav.home'
  if (pathname.startsWith('/user/')) return 'nav.profile'
  for (const [prefix, key] of TITLE_BY_PATH) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) return key
  }
  return ''
}
import '../styles/knowledge-pages.css'
import '../styles/learning-pages.css'
import '../styles/social-pages.css'
import '../styles/note-authoring.css'
import '../styles/account-pages.css'

export default function MainLayout() {
  const isLogin = useUserStore((s) => s.isLogin)
  const { t } = useTranslation()
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
            : ['/profile', '/settings', '/pet', '/about'].includes(location.pathname)
              ? ' is-account'
              : ''

  // 页面切换 key：chat 归一化（/chat 与 /chat/:id 同 key，切会话不重挂载、不触发过渡）
  const pageKey = location.pathname.startsWith('/chat') ? '/chat' : location.pathname

  // 页面切换回顶部（避免新页面停留在旧滚动位置造成"跳变"感）
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pageKey])

  // 浏览器标签页标题随路由更新（番茄钟页的倒计时标题在其卸载时会恢复本标题）
  useEffect(() => {
    const key = titleKeyForPath(location.pathname)
    document.title = key ? `${t(key)} · 云舒卷` : '云舒卷'
  }, [location.pathname, t])

  // 空闲预取高频页面（登录后 2s；侧边栏 hover 预取未命中的情况兜底）
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void Promise.allSettled(PREFETCH_IDLE.map((load) => load()))
    }, 2000)
    return () => window.clearTimeout(timer)
  }, [])

  // 养成数据上云同步（小卷 + 打卡；登录后拉取，变更防抖上传）
  useSettingsSync(isLogin)

  // 全局 WS 连接（登录后任意页面保持在线）：在线状态事件写入全局 store，
  // 好友列表/私信页实时可见"谁在线"；私聊消息事件由私信页订阅同一连接处理
  const setOnlineUsers = useChatStore((s) => s.setOnlineUsers)
  const addOnlineUser = useChatStore((s) => s.addOnlineUser)
  const removeOnlineUser = useChatStore((s) => s.removeOnlineUser)
  useChatSocket({
    onOnline: addOnlineUser,
    onOffline: removeOnlineUser,
    onOnlineList: setOnlineUsers,
  }, isLogin)

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
        {/* 页面切换过渡：旧页 120ms 淡出 → 新页淡入（mode="wait"，避免叠放与布局跳动）。
            ⚠️ AI 聊天会话（/chat 与 /chat/:id）归一化为同一 key：首问回答完自动跳转
            /chat/:id 时若重挂载，防闪屏守卫（AIChat 内 ref）会随组件销毁失效，
            导致历史重新加载 + 淡入动画的整页闪屏；key 不变 → 无过渡无重挂载 */}
        <div className="h-full">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={pageKey}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
              className="h-full"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
    {/* 独立于滚动工作区，跨路由保持挂载、保留成长事件监听。 */}
    <Pet /></>
  )
}
