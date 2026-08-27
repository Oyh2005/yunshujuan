import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
}

/**
 * 全局错误边界：捕获渲染错误，避免整个应用白屏（React 无边界时渲染错误会卸载整个 root）。
 * 出错时展示可恢复的错误页，而不是闪退。
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    console.error('[ErrorBoundary] 捕获渲染错误:', error)
  }

  handleReset = () => {
    this.setState({ hasError: false })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)]">
          <div className="text-center space-y-4 px-6">
            <h1 className="text-lg font-semibold text-[var(--color-text)]">页面出错了</h1>
            <p className="text-sm text-[var(--color-text-secondary)]">
              渲染过程中发生异常，请尝试重新加载。
            </p>
            <div className="flex justify-center gap-3">
              <button
                onClick={this.handleReset}
                className="px-4 py-2 text-sm rounded-md bg-[var(--color-accent)] text-[var(--color-accent-foreground)] hover:bg-[var(--color-accent-hover)] transition-colors"
              >
                重试
              </button>
              <a
                href="/"
                className="secondary-button"
              >
                返回首页
              </a>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
