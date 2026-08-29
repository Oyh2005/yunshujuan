import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Loader2, MessageSquare, Send, Users } from 'lucide-react'
import { messagesApi, type ChatConversation, type ChatMessage, type ChatPeer } from '../api/messages'
import { socialApi } from '../api/social'
import { useChatSocket } from '../hooks/useChatSocket'
import { useChatStore } from '../stores/useChatStore'
import { useUserStore } from '../stores/useUserStore'
import SocialLayout, { SocialAvatar, SocialHeader } from '../components/social/SocialLayout'

const HISTORY_PAGE = 30

function validTime(value?: string | null): number {
  const t = value ? Date.parse(value) : Number.NaN
  return Number.isFinite(t) ? t : 0
}

function formatTime(value: string | null, english: boolean): string {
  const t = validTime(value)
  if (!t) return ''
  const date = new Date(t)
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  if (sameDay) return date.toLocaleTimeString(english ? 'en-US' : 'zh-CN', { hour: '2-digit', minute: '2-digit' })
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return english ? 'Yesterday' : '昨天'
  return date.toLocaleDateString(english ? 'en-US' : 'zh-CN', { month: 'short', day: 'numeric' })
}

export default function MessagesPage() {
  const { i18n } = useTranslation()
  const english = i18n.resolvedLanguage?.startsWith('en') ?? false
  const text = useCallback((zh: string, en: string) => english ? en : zh, [english])
  const userId = useUserStore((s) => s.userInfo?.uuid || s.userInfo?.user_id || s.userInfo?.id || '')
  const setUnread = useChatStore((s) => s.setUnread)
  const [searchParams, setSearchParams] = useSearchParams()
  const withId = searchParams.get('with')

  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [listFailed, setListFailed] = useState(false)
  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null)
  /** 无会话时的直聊对象（?with= 进入但从未私聊过 → 从好友列表取信息） */
  const [directPeer, setDirectPeer] = useState<ChatPeer | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [sending, setSending] = useState(false)
  const [input, setInput] = useState('')
  const [sendError, setSendError] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const selectedPeerRef = useRef<string | null>(null)
  useEffect(() => {
    selectedPeerRef.current = selectedPeerId
  }, [selectedPeerId])
  // conversations 的最新快照（openConversation 读取用，避免把 conversations 放进
  // useCallback 依赖 → 自身 setConversations 触发重建 → ?with= effect 重跑 → 循环闪烁）
  const conversationsRef = useRef(conversations)
  useEffect(() => {
    conversationsRef.current = conversations
  }, [conversations])
  // 防重复打开同一 with 会话（配合上面的依赖稳定，双保险）
  const openedWithRef = useRef<string | null>(null)

  const selectedPeer = conversations.find((c) => c.peer.user_id === selectedPeerId)?.peer ?? directPeer

  const loadConversations = useCallback(async () => {
    try {
      const data = await messagesApi.conversations()
      setConversations(data.conversations)
      setListFailed(false)
      const totalUnread = data.conversations.reduce((sum, c) => sum + c.unread, 0)
      setUnread(totalUnread)
    } catch {
      setListFailed(true)
    } finally {
      setLoadingList(false)
    }
  }, [setUnread])

  const loadHistory = useCallback(async (peerId: string, cursor?: number) => {
    setLoadingHistory(true)
    try {
      const data = await messagesApi.history(peerId, cursor, HISTORY_PAGE)
      setHasMore(data.has_more)
      setMessages((prev) => cursor ? [...data.messages, ...prev] : data.messages)
    } catch {
      // 历史加载失败保留现状
    } finally {
      setLoadingHistory(false)
    }
  }, [])

  const openConversation = useCallback(async (peerId: string) => {
    setSelectedPeerId(peerId)
    setMessages([])
    setHasMore(false)
    // 从未私聊过：会话列表里没有该好友 → 从好友列表取对方信息（聊天窗头部展示）
    const known = conversationsRef.current.find((c) => c.peer.user_id === peerId)?.peer
    if (!known) {
      try {
        const res = await socialApi.friendsList()
        const found = (res.data ?? []).find((f) => f.user_id === peerId)
        setDirectPeer(found ? { user_id: found.user_id, username: found.username, avatar: found.avatar } : null)
        if (!found) setSendError(text('仅好友之间可以私聊，先去添加好友吧', 'Only friends can chat. Add them as a friend first.'))
      } catch {
        // 好友列表加载失败不影响打开
      }
    } else {
      setDirectPeer(null)
    }
    await loadHistory(peerId)
    await messagesApi.markRead(peerId).then(setUnread).catch(() => {})
    // 本地会话未读清零（仅在确实有未读时更新引用，避免无谓重渲染）
    setConversations((prev) => prev.some((c) => c.peer.user_id === peerId && c.unread > 0)
      ? prev.map((c) => c.peer.user_id === peerId ? { ...c, unread: 0 } : c)
      : prev)
  }, [loadHistory, setUnread, text])

  // 初始加载
  useEffect(() => {
    const timer = window.setTimeout(() => void loadConversations(), 0)
    return () => window.clearTimeout(timer)
  }, [loadConversations])

  // ?with= 直达会话。守卫放在 timer 回调内：① StrictMode 双挂载时第一次挂载
  // 只设 timer 不置 ref，cleanup 清 timer 后 ref 保持空 → 第二次挂载正常打开；
  // ② openConversation 因内部 setState 重建时，effect 重跑会被守卫拦截，防循环
  useEffect(() => {
    if (!withId) return
    const timer = window.setTimeout(() => {
      if (openedWithRef.current === withId) return
      openedWithRef.current = withId
      void openConversation(withId)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [withId, openConversation])

  // 滚动到底部（新消息/切换会话）
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [messages.length, selectedPeerId])

  // WS 实时事件
  useChatSocket({
    onMessage: (msg) => {
      if (msg.sender_id === selectedPeerRef.current) {
        setMessages((prev) => [...prev, msg])
        // 当前会话收到消息立即标记已读
        void messagesApi.markRead(msg.sender_id).then(setUnread).catch(() => {})
        setConversations((prev) => prev.map((c) => c.peer.user_id === msg.sender_id ? { ...c, unread: 0, last_message: msg.content, last_message_at: msg.created_at, last_sender_id: msg.sender_id } : c))
      } else {
        // 其他会话：刷新列表（WS unread 事件已更新全局红点）
        setConversations((prev) => {
          const conv = prev.find((c) => c.peer.user_id === msg.sender_id)
          if (!conv) {
            void loadConversations()
            return prev
          }
          return prev.map((c) => c.peer.user_id === msg.sender_id ? { ...c, last_message: msg.content, last_message_at: msg.created_at, last_sender_id: msg.sender_id, unread: c.unread + 1 } : c)
        })
      }
    },
    onRead: () => {
      // 对方读了我们的消息：刷新已读状态
      setMessages((prev) => prev.map((m) => ({ ...m, read: true })))
    },
  })

  const handleSend = async () => {
    const content = input.trim()
    if (!content || !selectedPeerId || sending) return
    setSending(true)
    setSendError('')
    try {
      const msg = await messagesApi.send(selectedPeerId, content)
      if (msg) {
        setMessages((prev) => [...prev, msg])
        // 会话列表同步：已有会话更新预览；首聊（无会话）插入新会话项
        setConversations((prev) => {
          const exists = prev.some((c) => c.peer.user_id === selectedPeerId)
          const updated = prev.map((c) => c.peer.user_id === selectedPeerId
            ? { ...c, last_message: msg.content, last_message_at: msg.created_at, last_sender_id: msg.sender_id }
            : c)
          if (exists || !directPeer) return updated
          return [{ conversation_id: msg.conversation_id, peer: directPeer, last_message: msg.content, last_sender_id: msg.sender_id, last_message_at: msg.created_at, unread: 0 }, ...updated]
        })
        setInput('')
      }
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setSendError(status === 403 ? text('仅好友之间可以私聊，先去添加好友吧', 'Only friends can chat. Add them as a friend first.') : detail || text('发送失败，请重试', 'Failed to send. Please retry.'))
    } finally {
      setSending(false)
    }
  }

  const handleLoadEarlier = async () => {
    if (messages.length && hasMore) {
      await loadHistory(selectedPeerId!, messages[0].id)
    }
  }

  const closeChat = () => {
    setSelectedPeerId(null)
    setDirectPeer(null)
    // 重置直达守卫：关闭后再点同一好友需能重新打开
    openedWithRef.current = null
    setSearchParams({}, { replace: true })
  }

  return (
    <SocialLayout className="messages-page">
      <SocialHeader
        title={text('私信', 'Messages')}
        subtitle={text('和好友聊聊，让想法流动起来', 'Chat with friends and let ideas flow')}
        badge={<span className="social-title-badge">{conversations.filter((c) => c.unread > 0).length} {text('个未读会话', 'unread')}</span>}
      />
      <div className={`messages-layout${selectedPeerId ? ' has-chat' : ''}`}>
        <aside className="messages-list" aria-label={text('会话列表', 'Conversations')}>
          {loadingList ? (
            <div className="messages-loading"><Loader2 size={18} className="animate-spin" />{text('加载会话…', 'Loading…')}</div>
          ) : listFailed ? (
            <div className="messages-empty"><p>{text('加载失败', 'Could not load')}</p><button className="secondary-button" onClick={() => void loadConversations()}>{text('重试', 'Retry')}</button></div>
          ) : conversations.length === 0 ? (
            <div className="messages-empty">
              <MessageSquare size={26} />
              <p>{text('还没有私信会话', 'No conversations yet')}</p>
              <Link className="secondary-button" to="/friends"><Users size={15} />{text('去好友页找朋友', 'Find friends')}</Link>
            </div>
          ) : (
            <ul>
              {conversations.map((conv) => (
                <li key={conv.conversation_id}>
                  <button
                    className={`messages-conv${conv.peer.user_id === selectedPeerId ? ' is-active' : ''}`}
                    onClick={() => {
                      // 统一走 ?with= effect 打开（守卫防重复），避免 onClick 与 effect 双开
                      if (conv.peer.user_id !== withId) {
                        setSearchParams({ with: conv.peer.user_id }, { replace: true })
                      }
                    }}
                  >
                    <SocialAvatar username={conv.peer.username} avatar={conv.peer.avatar} size={42} />
                    <span className="messages-conv-copy">
                      <span className="messages-conv-top"><strong>{conv.peer.username}</strong><time>{formatTime(conv.last_message_at, english)}</time></span>
                      <span className="messages-conv-bottom">
                        <small>{conv.last_sender_id === userId ? `${text('我：', 'You: ')}${conv.last_message}` : conv.last_message}</small>
                        {conv.unread > 0 && <b>{conv.unread > 99 ? '99+' : conv.unread}</b>}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="messages-chat" aria-label={text('聊天窗', 'Chat window')}>
          {!selectedPeer ? (
            <div className="messages-chat-empty">
              <MessageSquare size={34} />
              <p>{text('选择左侧会话开始聊天', 'Pick a conversation to start chatting')}</p>
            </div>
          ) : (
            <>
              <header className="messages-chat-head">
                <button className="messages-chat-back" onClick={closeChat} aria-label={text('返回会话列表', 'Back')}><ArrowLeft size={17} /></button>
                <SocialAvatar username={selectedPeer.username} avatar={selectedPeer.avatar} size={34} />
                <strong>{selectedPeer.username}</strong>
              </header>
              <div className="messages-chat-body">
                {hasMore && (
                  <button className="messages-load-earlier" disabled={loadingHistory} onClick={() => void handleLoadEarlier()}>
                    {loadingHistory ? <Loader2 size={13} className="animate-spin" /> : null}{text('加载更早的消息', 'Load earlier messages')}
                  </button>
                )}
                {messages.length === 0 && !loadingHistory && (
                  <div className="messages-chat-welcome">{text('打个招呼，开启对话吧', 'Say hi and start the conversation')}</div>
                )}
                {messages.map((msg) => {
                  const mine = msg.sender_id === userId
                  return (
                    <div key={msg.id} className={`messages-bubble ${mine ? 'mine' : 'theirs'}`}>
                      <p>{msg.content}</p>
                      <time>{formatTime(msg.created_at, english)}{mine && (msg.read ? ` · ${text('已读', 'Read')}` : ` · ${text('未读', 'Unread')}`)}</time>
                    </div>
                  )
                })}
                <div ref={messagesEndRef} />
              </div>
              <footer className="messages-chat-input">
                {sendError && <p className="messages-send-error">{sendError}</p>}
                <textarea
                  value={input}
                  onChange={(event) => { setInput(event.target.value); if (sendError) setSendError('') }}
                  onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void handleSend() } }}
                  placeholder={text('输入消息，Enter 发送…', 'Type a message, Enter to send…')}
                  rows={1}
                  aria-label={text('消息内容', 'Message')}
                />
                <button className="messages-send" onClick={() => void handleSend()} disabled={!input.trim() || sending} aria-label={text('发送', 'Send')}>
                  {sending ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
                </button>
              </footer>
            </>
          )}
        </section>
      </div>
    </SocialLayout>
  )
}
