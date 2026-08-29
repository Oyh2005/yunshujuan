import { useEffect } from 'react'
import { useRoutes } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import routes from './router'
import { useThemeStore } from './stores/useThemeStore'

function App() {
  const theme = useThemeStore((s) => s.theme)
  const routing = useRoutes(routes)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  // MotionConfig reducedMotion="user"：系统开启「减弱动态效果」时，
  // framer-motion 的 transform/布局动画自动降级为即时（透明度动画保留）
  return <MotionConfig reducedMotion="user">{routing}</MotionConfig>
}

export default App
