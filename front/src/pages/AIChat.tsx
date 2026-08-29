import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  MessageSquare,
  Paperclip,
  Pin,
  Plus,
  Send,
  Sparkles,
  User,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import rehypeRaw from 'rehype-raw'
import DOMPurify from 'dompurify'
import { useSSE } from '../hooks/useSSE'
import { sessionsApi } from '../api/sessions'
import { useThemeStore } from '../stores/useThemeStore'
import { usePetStore } from '../stores/usePetStore'
import { useUserStore } from '../stores/useUserStore'
import type { ChatSession } from '../types/api'
import ErrorBoundary from '../components/common/ErrorBoundary'
import { AiCompanionCard, AiTopbar } from '../components/ai/AiWorkspace'
import '../styles/ai-pages.css'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

// AI 消息安全渲染：先 DOMPurify 清洗（允许 details/summary 折叠等常用标签），
// 再经 rehype-raw 渲染原始 HTML —— 复习题答案的 <details> 折叠因此可用且无 XSS 风险
function AssistantMarkdown({ content }: { content: string }) {
  const safeContent = useMemo(() => DOMPurify.sanitize(content, {
    ALLOWED_TAGS: [
      'details', 'summary', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr',
      'strong', 'em', 'del', 'code', 'pre', 'blockquote',
      'ul', 'ol', 'li', 'a', 'img', 'span', 'div', 'input',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
    ],
    ALLOWED_ATTR: ['href', 'title', 'target', 'rel', 'src', 'alt', 'checked', 'type', 'class'],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
  }), [content])

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw, rehypeHighlight]}
    >
      {safeContent}
    </ReactMarkdown>
  )
}

const RENDER_WINDOW = 50

function validTime(value?: string) {
  const time = value ? Date.parse(value) : Number.NaN
  return Number.isFinite(time) ? time : 0
}

export default function AIChat() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const { i18n } = useTranslation()
  const english = i18n.resolvedLanguage?.startsWith('en')
  const text = useCallback((zh: string, en: string) => english ? en : zh, [english])
  const theme = useThemeStore((state) => state.theme)
  const userId = useUserStore((state) => state.userInfo?.uuid || state.userInfo?.user_id || state.userInfo?.id || '')
  const { start, abort, loading } = useSSE()
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [currentThinking, setCurrentThinking] = useState('')
  const [currentSteps, setCurrentSteps] = useState<string[]>([])
  const [showThinking, setShowThinking] = useState(true)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [visibleStart, setVisibleStart] = useState(0)
  const [recentSessions, setRecentSessions] = useState<ChatSession[]>([])
  const [sessionsFailed, setSessionsFailed] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef('')
  const rafRef = useRef<number | null>(null)
  const prevLenRef = useRef(0)
  // 当前内存中消息所属的会话 id + 消息快照：用于避免「新会话首个问题回答完
  // 自动跳转 /chat/:id 后 effect 重新拉历史」导致的闪屏（消息清空→加载→重绘）
  const activeSessionRef = useRef<string | null>(null)
  const messagesRef = useRef<Message[]>([])
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const quickQuestions = [
    text('总结我的知识库', 'Summarize my knowledge base'),
    text('根据笔记生成复习问题', 'Create review questions from my notes'),
    text('帮我制定一个学习计划', 'Help me create a study plan'),
  ]

  const stageLabel = (stage: string) => ({
    retrieval: text('检索相关知识', 'Retrieve knowledge'),
    hyde: text('理解并扩展问题', 'Expand the question'),
    reorder: text('筛选高相关内容', 'Rank relevant context'),
    summarize: text('组织并生成回答', 'Compose the answer'),
  }[stage] || stage || text('分析问题', 'Analyze question'))

  const formatSessionDate = (value?: string) => {
    const time = validTime(value)
    if (!time) return ''
    const date = new Date(time)
    const today = new Date()
    if (date.toDateString() === today.toDateString()) {
      return date.toLocaleTimeString(english ? 'en-US' : 'zh-CN', { hour: '2-digit', minute: '2-digit' })
    }
    return date.toLocaleDateString(english ? 'en-US' : 'zh-CN', { month: 'short', day: 'numeric' })
  }

  const loadRecentSessions = useCallback(async () => {
    if (!userId) return
    try {
      const response = await sessionsApi.list(String(userId))
      const data = response.data as { sessions?: ChatSession[] } | undefined
      const list = Array.isArray(data?.sessions) ? data.sessions : []
      // 置顶优先（后端已按置顶排序返回，这里保持稳定：置顶组在前，其余按更新时间降序）
      setRecentSessions(
        [...list]
          .sort((a, b) => {
            if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1
            return validTime(b.updated_at || b.created_at) - validTime(a.updated_at || a.created_at)
          })
          .slice(0, 6),
      )
      setSessionsFailed(false)
    } catch {
      setSessionsFailed(true)
    }
  }, [userId])

  useEffect(() => {
    const timer = window.setTimeout(loadRecentSessions, 0)
    return () => window.clearTimeout(timer)
  }, [loadRecentSessions])
  useEffect(() => () => abort(), [abort])

  useEffect(() => {
    const previousLength = prevLenRef.current
    prevLenRef.current = messages.length
    if (messages.length > previousLength && visibleStart + RENDER_WINDOW >= previousLength) {
      setVisibleStart(Math.max(0, messages.length - RENDER_WINDOW))
    }
  }, [messages.length, visibleStart])

  const flushContent = useCallback(() => {
    if (!contentRef.current) return
    setMessages((previous) => {
      const next = [...previous]
      const last = next[next.length - 1]
      if (last?.role === 'assistant') next[next.length - 1] = { ...last, content: contentRef.current }
      else next.push({ role: 'assistant', content: contentRef.current })
      return next
    })
  }, [])

  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
  }, [])

  useEffect(() => {
    if (!sessionId) return
    // 刚在当前页面聊完这个会话（回答完成自动跳转而来），消息已在内存中，
    // 跳过重新加载历史，避免闪屏。注意：activeSessionRef 只在「加载成功 /
    // 提问 / 回答完成」时更新，保证内存消息确实属于该会话，否则误判会导致
    // 切换到其他会话再切回时历史不加载
    if (activeSessionRef.current === sessionId && messagesRef.current.length > 0) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      setLoadingHistory(true)
      setMessages([])
      setVisibleStart(0)
      setCurrentSteps([])
      setCurrentThinking('')
      sessionsApi.get(sessionId)
        .then((response) => {
          if (cancelled) return
          const data = response.data as { history?: [string, string][] } | undefined
          const history = Array.isArray(data?.history) ? data.history : []
          setMessages(history.flatMap(([query, answer]) => [
            { role: 'user' as const, content: query },
            { role: 'assistant' as const, content: answer },
          ]))
          // 加载成功：内存消息现在确实属于该会话
          activeSessionRef.current = sessionId
        })
        .catch(() => {
          if (cancelled) return
          // 加载失败：禁止守卫命中，下次进入该会话重新加载
          activeSessionRef.current = null
          setMessages([{ role: 'assistant', content: text('这段会话暂时无法加载，请稍后重试。', 'This conversation could not be loaded. Please try again.') }])
        })
        .finally(() => { if (!cancelled) setLoadingHistory(false) })
    }, 0)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [sessionId, text])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [messages, currentThinking])

  useEffect(() => {
    if (!sessionId) {
      const lastId = sessionStorage.getItem('lastSessionId')
      if (lastId) navigate(`/chat/${lastId}`, { replace: true })
    }
  }, [sessionId, navigate])

  const newConversation = () => {
    abort()
    activeSessionRef.current = null
    sessionStorage.removeItem('lastSessionId')
    contentRef.current = ''
    setMessages([])
    setInput('')
    setCurrentThinking('')
    setCurrentSteps([])
    setVisibleStart(0)
    navigate('/chat')
  }

  const handleSend = useCallback(async (query: string) => {
    const trimmed = query.trim()
    if (!trimmed || loading) return

    // 继续当前会话：标记内存中的消息属于该会话
    activeSessionRef.current = sessionId || null
    setMessages((previous) => [...previous, { role: 'user', content: trimmed }])
    setInput('')
    setCurrentThinking('')
    setCurrentSteps([])
    setShowThinking(true)
    contentRef.current = ''
    const steps: string[] = []
    let hasResponseStarted = false

    await start('/chat/agent/query/stream', { query: trimmed, session_id: sessionId }, {
      onThinking: (stage, content) => {
        if (stage && !steps.includes(stage)) steps.push(stage)
        setCurrentSteps([...steps])
        setCurrentThinking((previous) => previous ? `${previous}\n${content || ''}` : (content || ''))
        usePetStore.getState().trigger('ai_thinking')
      },
      onResponse: (content, nextSessionId) => {
        if (!hasResponseStarted) {
          hasResponseStarted = true
          setShowThinking(false)
        }
        if (nextSessionId) sessionStorage.setItem('lastSessionId', nextSessionId)
        contentRef.current += content
        if (rafRef.current === null) {
          rafRef.current = requestAnimationFrame(() => {
            rafRef.current = null
            flushContent()
          })
        }
      },
      onDone: (nextSessionId) => {
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current)
          rafRef.current = null
        }
        flushContent()
        usePetStore.getState().trigger('ai_done')
        if (nextSessionId) {
          // 标记消息归属，跳转后 effect 跳过重载（防闪屏）
          activeSessionRef.current = nextSessionId
          sessionStorage.setItem('lastSessionId', nextSessionId)
        }
        if (nextSessionId && nextSessionId !== sessionId) navigate(`/chat/${nextSessionId}`, { replace: true })
        window.setTimeout(loadRecentSessions, 250)
      },
      onError: () => {
        usePetStore.getState().setMood('idle')
        setMessages((previous) => [...previous, {
          role: 'assistant',
          content: text('抱歉，这次回答没有成功生成。请检查服务状态后重试。', 'Sorry, the answer could not be generated. Please check the service and try again.'),
        }])
      },
    })
  }, [flushContent, loadRecentSessions, loading, navigate, sessionId, start, text])

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSend(input)
    }
  }

  const isLoading = loadingHistory || loading
  const hasStreamingAssistant = loading && messages.at(-1)?.role === 'assistant'
  const completedStages = currentSteps.map(stageLabel)

  return (
    <section className="ai-page ai-chat-page">
      <AiTopbar />
      <div className="ai-chat-layout">
        <aside className="ai-recent-panel" aria-label={text('最近对话', 'Recent conversations')}>
          <div className="ai-panel-heading">
            <h2>{text('最近对话', 'Recent')}</h2>
            <button className="workspace-icon-button" onClick={newConversation} aria-label={text('新建对话', 'New conversation')}><Plus size={17} /></button>
          </div>
          {sessionsFailed && <button className="ai-inline-error" onClick={loadRecentSessions}>{text('加载失败，点击重试', 'Could not load. Retry')}</button>}
          <div className="ai-recent-list">
            {recentSessions.length ? recentSessions.map((session) => (
              <button
                key={session.id}
                className={`ai-recent-item${session.id === sessionId ? ' is-active' : ''}`}
                onClick={() => navigate(`/chat/${session.id}`)}
              >
                <MessageSquare size={16} />
                <span><strong>{session.title || text('新的对话', 'New conversation')}{session.is_pinned && <Pin size={11} className="ai-recent-pin" />}</strong><small>{formatSessionDate(session.updated_at || session.created_at)}</small></span>
              </button>
            )) : !sessionsFailed && <div className="ai-recent-empty">{text('还没有历史对话', 'No conversations yet')}</div>}
          </div>
          <Link className="ai-view-all" to="/sessions">{text('查看全部会话', 'View all sessions')}<ArrowRight size={14} /></Link>
        </aside>

        <article className="ai-conversation-card">
          <div className="ai-conversation-scroll" aria-live="polite">
            <div className="ai-message-stack">
              {messages.length === 0 && !isLoading && (
                <div className="ai-welcome">
                  <div className="ai-welcome-art"><img src="/illustrations/study-cloud.png" alt="" /></div>
                  <span><Sparkles size={14} />{text('知识已经准备好', 'Your knowledge is ready')}</span>
                  <h2>{text('今天想和小卷聊点什么？', 'What would you like to explore today?')}</h2>
                  <p>{text('我会结合你的笔记与知识库资料，陪你一起梳理、总结和继续思考。', 'I can use your notes and resources to help you organize, summarize, and explore.')}</p>
                </div>
              )}

              {loadingHistory && <div className="ai-loading-row"><Loader2 size={20} />{text('正在打开会话…', 'Opening conversation…')}</div>}

              {visibleStart > 0 && (
                <button className="ai-load-earlier" onClick={() => setVisibleStart((startIndex) => Math.max(0, startIndex - RENDER_WINDOW))}>
                  {text('加载更早的消息', 'Load earlier messages')}
                </button>
              )}

              <ErrorBoundary fallback={<div className="ai-render-error">{text('消息渲染出错，请新建对话或刷新页面。', 'A message could not be rendered. Start a new conversation or refresh.')}</div>}>
                {messages.slice(visibleStart).map((message, index) => {
                  const absoluteIndex = visibleStart + index
                  const isLatestAssistant = message.role === 'assistant' && absoluteIndex === messages.length - 1
                  return (
                    <div key={absoluteIndex} className={`ai-message ${message.role}`}>
                      <span className="ai-message-avatar">{message.role === 'assistant' ? <Bot size={17} /> : <User size={17} />}</span>
                      <div className="ai-message-content">
                        {message.role === 'assistant' && isLatestAssistant && currentSteps.length > 0 && (
                          <ThinkingPanel
                            expanded={showThinking}
                            onToggle={() => setShowThinking((value) => !value)}
                            steps={completedStages}
                            detail={currentThinking}
                            label={text('思考过程', 'Thinking process')}
                            completeLabel={loading ? text('正在进行', 'In progress') : text('已完成', 'Complete')}
                          />
                        )}
                        {message.role === 'user' ? <p>{message.content}</p> : (
                          <div className={`markdown-body prose prose-sm max-w-none${theme === 'dark' ? ' prose-invert' : ''}`}>
                            <AssistantMarkdown content={message.content} />
                          </div>
                        )}
                        {hasStreamingAssistant && isLatestAssistant && <StreamingDots />}
                      </div>
                    </div>
                  )
                })}
              </ErrorBoundary>

              {loading && !hasStreamingAssistant && (
                <div className="ai-message assistant">
                  <span className="ai-message-avatar"><Bot size={17} /></span>
                  <div className="ai-message-content">
                    {currentSteps.length > 0 && (
                      <ThinkingPanel
                        expanded={showThinking}
                        onToggle={() => setShowThinking((value) => !value)}
                        steps={completedStages}
                        detail={currentThinking}
                        label={text('思考过程', 'Thinking process')}
                        completeLabel={text('正在进行', 'In progress')}
                      />
                    )}
                    <StreamingDots />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          <footer className="ai-composer-area">
            <div className="ai-suggestions">
              {quickQuestions.map((question) => <button key={question} onClick={() => handleSend(question)} disabled={loading}>{question}</button>)}
            </div>
            <div className="ai-composer">
              <button className="workspace-icon-button" disabled title={text('附件功能开发中', 'Attachments coming soon')} aria-label={text('附件功能开发中', 'Attachments coming soon')}><Paperclip size={18} /></button>
              <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={handleKeyDown} placeholder={text('输入你的问题，Enter 发送…', 'Type your question, press Enter to send…')} rows={1} />
              <span className="ai-composer-hint"><Sparkles size={14} />RAG</span>
              <button className="ai-send-button" onClick={() => handleSend(input)} disabled={!input.trim() || loading} aria-label={text('发送', 'Send')}>
                {loading ? <Loader2 size={18} /> : <Send size={18} />}
              </button>
            </div>
            <small>{text('内容由 AI 生成，请结合实际情况判断', 'AI-generated content may require verification')}</small>
          </footer>
        </article>

        <aside className="ai-chat-rail">
          <AiCompanionCard title={text('正在陪你思考', 'Thinking with you')} message={text('我会结合你的笔记和资料一起回答～', 'I will use your notes and resources to answer.')} />
          <section className="ai-progress-card">
            <div className="ai-panel-heading"><h2>{text('本次思考', 'Current process')}</h2><Sparkles size={16} /></div>
            {completedStages.length ? (
              <ol>{completedStages.map((stage) => <li key={stage}><span><Check size={12} /></span>{stage}</li>)}</ol>
            ) : (
              <div className="ai-progress-empty"><MessageSquare size={23} /><p>{text('提问后，这里会显示真实的检索和思考阶段。', 'Your real retrieval and reasoning stages will appear here.')}</p></div>
            )}
          </section>
        </aside>
      </div>
    </section>
  )
}

function ThinkingPanel({ expanded, onToggle, steps, detail, label, completeLabel }: { expanded: boolean; onToggle: () => void; steps: string[]; detail: string; label: string; completeLabel: string }) {
  return (
    <div className="ai-thinking-panel">
      <button onClick={onToggle} aria-expanded={expanded}>
        <span><Sparkles size={15} />{label}</span>
        <small>{steps.length} · {completeLabel}</small>
        {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
      </button>
      {expanded && (
        <div className="ai-thinking-detail">
          <div>{steps.map((step) => <span key={step}><Check size={11} />{step}</span>)}</div>
          {detail && <p>{detail}</p>}
        </div>
      )}
    </div>
  )
}

function StreamingDots() {
  return <div className="ai-streaming-dots" aria-label="AI 正在生成"><span /><span /><span /></div>
}
