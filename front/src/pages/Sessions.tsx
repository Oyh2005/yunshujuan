import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Clock3,
  History,
  MessageSquare,
  MessagesSquare,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { sessionsApi } from '../api/sessions'
import { useSessionStore } from '../stores/useSessionStore'
import { useUserStore } from '../stores/useUserStore'
import { swrCache } from '../stores/useSwrCacheStore'
import type { ChatSession } from '../types/api'
import ConfirmDialog from '../components/common/ConfirmDialog'
import PromptDialog from '../components/common/PromptDialog'
import { AiCompanionCard, AiTopbar } from '../components/ai/AiWorkspace'
import '../styles/ai-pages.css'

type SessionFilter = 'all' | 'today' | 'week' | 'older'
type SessionSort = 'recent' | 'oldest'

const PAGE_SIZE = 8

function sessionTime(session: ChatSession) {
  const value = session.updated_at || session.created_at
  const time = value ? Date.parse(value) : Number.NaN
  return Number.isFinite(time) ? time : 0
}

function getDateBoundaries() {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const week = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const day = week.getDay() || 7
  week.setDate(week.getDate() - day + 1)
  return { today, week: week.getTime() }
}

export default function Sessions() {
  const { i18n } = useTranslation()
  const english = i18n.resolvedLanguage?.startsWith('en')
  const text = useCallback((zh: string, en: string) => english ? en : zh, [english])
  const navigate = useNavigate()
  const userId = useUserStore((state) => state.userInfo?.uuid || state.userInfo?.user_id || state.userInfo?.id || '')
  const { sessions, setSessions, removeSession, updateSession, setLoading, loading } = useSessionStore()
  const [deleteTarget, setDeleteTarget] = useState<ChatSession | null>(null)
  const [renameTarget, setRenameTarget] = useState<ChatSession | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<SessionFilter>('all')
  const [sort, setSort] = useState<SessionSort>('recent')
  const [page, setPage] = useState(1)
  const [failed, setFailed] = useState(false)

  const sessionTitle = useCallback(
    (session: ChatSession) => session.title || text('新的对话', 'New conversation'),
    [text],
  )

  const loadSessions = useCallback(async () => {
    if (!userId) {
      setLoading(false)
      return
    }
    // SWR 预填：store 为空且有本地缓存时先展示（刷新页面秒开），请求到达后替换
    if (useSessionStore.getState().sessions.length === 0) {
      const cached = swrCache.get<ChatSession[]>(`sessions:${userId}`)
      if (cached?.length) setSessions(cached)
    }
    setLoading(true)
    try {
      const response = await sessionsApi.list(String(userId))
      const data = response.data as { sessions?: ChatSession[] } | undefined
      const list = Array.isArray(data?.sessions) ? data.sessions : []
      setSessions(list)
      // 写入 SWR 本地缓存
      swrCache.set(`sessions:${userId}`, list)
      setFailed(false)
    } catch {
      setFailed(true)
      toast.error(text('加载会话列表失败', 'Could not load sessions'))
    } finally {
      setLoading(false)
    }
  }, [setLoading, setSessions, text, userId])

  useEffect(() => {
    const timer = window.setTimeout(loadSessions, 0)
    return () => window.clearTimeout(timer)
  }, [loadSessions])

  const { today, week } = getDateBoundaries()
  const counts = useMemo(() => {
    const todayCount = sessions.filter((session) => sessionTime(session) >= today).length
    const weekCount = sessions.filter((session) => sessionTime(session) >= week).length
    return {
      all: sessions.length,
      today: todayCount,
      week: weekCount,
      older: Math.max(0, sessions.length - weekCount),
    }
  }, [sessions, today, week])

  const filteredSessions = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase()
    const pinnedTime = (session: ChatSession) => {
      const value = session.pinned_at || session.updated_at || session.created_at
      const time = value ? Date.parse(value) : Number.NaN
      return Number.isFinite(time) ? time : 0
    }
    return sessions
      .filter((session) => {
        const time = sessionTime(session)
        const matchesQuery = !keyword || sessionTitle(session).toLocaleLowerCase().includes(keyword)
        const matchesFilter =
          filter === 'all' ||
          (filter === 'today' && time >= today) ||
          (filter === 'week' && time >= week) ||
          (filter === 'older' && time < week)
        return matchesQuery && matchesFilter
      })
      .sort((a, b) => {
        // 置顶会话永远优先（置顶组内按置顶时间降序），其余按用户选择的排序
        if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1
        if (a.is_pinned) return pinnedTime(b) - pinnedTime(a)
        return sort === 'recent' ? sessionTime(b) - sessionTime(a) : sessionTime(a) - sessionTime(b)
      })
  }, [filter, query, sessions, sort, today, week, sessionTitle])

  const totalPages = Math.max(1, Math.ceil(filteredSessions.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const visibleSessions = filteredSessions.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const newConversation = () => {
    sessionStorage.removeItem('lastSessionId')
    navigate('/chat')
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await sessionsApi.delete(deleteTarget.id)
      removeSession(deleteTarget.id)
      if (sessionStorage.getItem('lastSessionId') === deleteTarget.id) sessionStorage.removeItem('lastSessionId')
      toast.success(text('会话已删除', 'Conversation deleted'))
    } catch {
      toast.error(text('删除会话失败', 'Could not delete conversation'))
    } finally {
      setDeleteTarget(null)
    }
  }

  const openRename = (session: ChatSession) => {
    setRenameValue(session.custom_title ?? session.title ?? '')
    setRenameTarget(session)
  }

  const handleRename = async () => {
    if (!renameTarget) return
    const title = renameValue.trim()
    if (!title) return
    try {
      await sessionsApi.update(renameTarget.id, { title })
      updateSession(renameTarget.id, { title, custom_title: title })
      toast.success(text('会话已重命名', 'Conversation renamed'))
    } catch {
      toast.error(text('重命名失败', 'Could not rename conversation'))
    } finally {
      setRenameTarget(null)
    }
  }

  const handleTogglePin = async (session: ChatSession) => {
    const nextPinned = !session.is_pinned
    try {
      const response = await sessionsApi.update(session.id, { is_pinned: nextPinned })
      const data = response.data as { data?: { is_pinned?: boolean; pinned_at?: string | null } } | undefined
      updateSession(session.id, {
        is_pinned: data?.data?.is_pinned ?? nextPinned,
        pinned_at: data?.data?.pinned_at ?? null,
      })
      toast.success(nextPinned ? text('会话已置顶', 'Conversation pinned') : text('已取消置顶', 'Conversation unpinned'))
    } catch {
      toast.error(text('操作失败', 'Could not update conversation'))
    }
  }

  const formatDate = (session: ChatSession) => {
    const time = sessionTime(session)
    if (!time) return text('时间未知', 'Unknown time')
    const date = new Date(time)
    const now = new Date()
    if (date.toDateString() === now.toDateString()) {
      return text('今天 ', 'Today ') + date.toLocaleTimeString(english ? 'en-US' : 'zh-CN', { hour: '2-digit', minute: '2-digit' })
    }
    return date.toLocaleDateString(english ? 'en-US' : 'zh-CN', { month: 'short', day: 'numeric', year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric' })
  }

  const filterOptions: { value: SessionFilter; label: string }[] = [
    { value: 'all', label: text('全部', 'All') },
    { value: 'today', label: text('今天', 'Today') },
    { value: 'week', label: text('本周', 'This week') },
    { value: 'older', label: text('更早', 'Earlier') },
  ]

  return (
    <section className="ai-page ai-sessions-page">
      <AiTopbar />
      <header className="ai-sessions-hero">
        <div className="ai-sessions-hero-copy">
          <span><Sparkles size={14} />{text('每一次提问，都值得被记住', 'Every question is worth revisiting')}</span>
          <h1>{text('会话管理', 'Conversation history')}</h1>
          <p>{text('回顾每一次提问，让思考持续生长', 'Return to earlier questions and keep your thinking growing')}</p>
          <small>{text(`共 ${sessions.length} 个会话`, `${sessions.length} conversations`)}</small>
        </div>
        <img src="/illustrations/study-cloud.png" alt="" />
        <div className="ai-sessions-hero-actions">
          <button className="primary-button" onClick={newConversation}><Plus size={18} />{text('新建对话', 'New conversation')}</button>
        </div>
      </header>

      {failed && (
        <div className="ai-page-alert" role="alert">
          <span>{text('会话列表暂时没有更新，已保留当前可用内容。', 'The session list could not be refreshed. Existing content is preserved.')}</span>
          <button onClick={loadSessions}>{text('重试', 'Retry')}</button>
        </div>
      )}

      <div className="ai-sessions-toolbar">
        <label className="ai-session-search">
          <Search size={17} />
          <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} placeholder={text('搜索会话标题…', 'Search conversation titles…')} />
        </label>
        <div className="ai-session-filters" role="group" aria-label={text('会话时间筛选', 'Filter by date')}>
          {filterOptions.map((option) => (
            <button key={option.value} aria-pressed={filter === option.value} onClick={() => { setFilter(option.value); setPage(1) }}>
              {option.label}<span>{counts[option.value]}</span>
            </button>
          ))}
        </div>
        <label className="ai-session-sort">
          <Clock3 size={15} />
          <select value={sort} onChange={(event) => { setSort(event.target.value as SessionSort); setPage(1) }} aria-label={text('会话排序', 'Sort conversations')}>
            <option value="recent">{text('最近对话', 'Most recent')}</option>
            <option value="oldest">{text('最早对话', 'Oldest first')}</option>
          </select>
        </label>
      </div>

      <div className="ai-sessions-layout">
        <div className="ai-session-list-card" aria-busy={loading}>
          {loading && sessions.length === 0 ? (
            <div className="ai-session-skeletons">{Array.from({ length: 6 }, (_, index) => <div key={index}><span /><p /><small /></div>)}</div>
          ) : visibleSessions.length ? (
            <div className="ai-session-list">
              {visibleSessions.map((session) => (
                <article key={session.id} className={`ai-session-row${session.is_pinned ? ' is-pinned' : ''}`}>
                  <button className="ai-session-main" onClick={() => navigate(`/chat/${session.id}`)}>
                    <span className="ai-session-icon"><MessageSquare size={19} /></span>
                    <span className="ai-session-copy">
                      <strong>
                        {sessionTitle(session)}
                        {session.is_pinned && <Pin size={13} className="ai-session-pin-mark" />}
                      </strong>
                      <small>{session.is_pinned ? text('已置顶 · 继续这段对话', 'Pinned · continue this conversation') : text('继续这段对话，回到之前的思考', 'Continue from your earlier question')}</small>
                    </span>
                    <time dateTime={session.updated_at || session.created_at}>{formatDate(session)}</time>
                    <span className="ai-session-continue">{text('继续对话', 'Continue')}<ArrowRight size={14} /></span>
                  </button>
                  <div className="ai-session-actions">
                    <button
                      className={`ai-session-action${session.is_pinned ? ' is-active' : ''}`}
                      onClick={() => handleTogglePin(session)}
                      aria-label={session.is_pinned ? text('取消置顶', 'Unpin conversation') : text('置顶会话', 'Pin conversation')}
                      title={session.is_pinned ? text('取消置顶', 'Unpin conversation') : text('置顶会话', 'Pin conversation')}
                    >
                      {session.is_pinned ? <Pin size={16} /> : <PinOff size={16} />}
                    </button>
                    <button
                      className="ai-session-action"
                      onClick={() => openRename(session)}
                      aria-label={text('重命名会话', 'Rename conversation')}
                      title={text('重命名会话', 'Rename conversation')}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      className="ai-session-action"
                      onClick={() => setDeleteTarget(session)}
                      aria-label={text('删除会话', 'Delete conversation')}
                      title={text('删除会话', 'Delete conversation')}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="ai-sessions-empty">
              <span><MessagesSquare size={34} /></span>
              <h2>{query || filter !== 'all' ? text('没有找到匹配的会话', 'No matching conversations') : text('还没有历史会话', 'No conversations yet')}</h2>
              <p>{query || filter !== 'all' ? text('换个关键词或筛选条件试试。', 'Try another keyword or date filter.') : text('从一个问题开始，让小卷陪你一起探索。', 'Start with a question and explore it with your companion.')}</p>
              {query || filter !== 'all' ? <button className="secondary-button" onClick={() => { setQuery(''); setFilter('all') }}>{text('清除筛选', 'Clear filters')}</button> : <button className="primary-button" onClick={newConversation}><Plus size={17} />{text('开始新对话', 'Start a conversation')}</button>}
            </div>
          )}

          {filteredSessions.length > PAGE_SIZE && (
            <footer className="ai-session-pagination">
              <span>{text(`显示 ${(safePage - 1) * PAGE_SIZE + 1}–${Math.min(safePage * PAGE_SIZE, filteredSessions.length)} 条，共 ${filteredSessions.length} 条`, `${(safePage - 1) * PAGE_SIZE + 1}–${Math.min(safePage * PAGE_SIZE, filteredSessions.length)} of ${filteredSessions.length}`)}</span>
              <div>
                <button disabled={safePage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} aria-label={text('上一页', 'Previous page')}><ChevronLeft size={16} /></button>
                {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => <button key={pageNumber} className={pageNumber === safePage ? 'is-active' : ''} onClick={() => setPage(pageNumber)}>{pageNumber}</button>)}
                <button disabled={safePage === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} aria-label={text('下一页', 'Next page')}><ChevronRight size={16} /></button>
              </div>
            </footer>
          )}
        </div>

        <aside className="ai-sessions-rail">
          <section className="ai-session-overview">
            <h2>{text('对话概览', 'Overview')}</h2>
            <div><span className="violet"><History size={18} /></span><strong>{counts.all}</strong><small>{text('全部会话', 'All conversations')}</small></div>
            <div><span className="amber"><MessageSquare size={18} /></span><strong>{counts.today}</strong><small>{text('今天新增', 'Added today')}</small></div>
            <div><span className="mint"><MessagesSquare size={18} /></span><strong>{counts.week}</strong><small>{text('本周活跃', 'Active this week')}</small></div>
          </section>
          <AiCompanionCard
            compact
            title={text('和小卷继续聊聊', 'Keep exploring')}
            message={text('从一条旧问题出发，也能长出新的答案。', 'An old question can still lead to a new answer.')}
            action={<button className="secondary-button" onClick={newConversation}>{text('开始新对话', 'Start a conversation')}<ArrowRight size={14} /></button>}
          />
        </aside>
      </div>

      <PromptDialog
        open={!!renameTarget}
        onOpenChange={(open) => { if (!open) setRenameTarget(null) }}
        title={text('重命名会话', 'Rename conversation')}
        label={text('会话名称', 'Conversation name')}
        value={renameValue}
        onChange={setRenameValue}
        placeholder={text('输入新的会话名称…', 'Enter a new name…')}
        confirmText={text('保存', 'Save')}
        cancelText={text('取消', 'Cancel')}
        onConfirm={handleRename}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
        title={text('删除这段会话？', 'Delete this conversation?')}
        message={text('会话及其中的全部消息将被永久删除，此操作无法撤销。', 'The conversation and all of its messages will be permanently deleted.')}
        variant="danger"
        confirmText={text('删除', 'Delete')}
        cancelText={text('取消', 'Cancel')}
        onConfirm={handleDelete}
      />
    </section>
  )
}
