import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import './index.css'
import './i18n'
import App from './App'
import ErrorBoundary from './components/common/ErrorBoundary'
import { reportError } from './api/telemetry'

// 全局错误监控（稳定性三件套）：未捕获异常 + 未处理 Promise 拒绝 → 自建接口上报
window.addEventListener('error', (event) => {
  reportError({
    kind: 'unhandled',
    message: event.message || 'Unknown script error',
    stack: event.error instanceof Error ? event.error.stack : undefined,
    page: window.location.pathname,
  })
})
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason
  reportError({
    kind: 'rejection',
    message: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
    page: window.location.pathname,
  })
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
        <Toaster position="top-center" richColors />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
