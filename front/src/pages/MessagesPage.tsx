import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ArrowLeft, ImagePlus, Loader2, MessageSquare, Pin, Search, Send, Smile, Trash2, Users, X } from 'lucide-react'
import { messagesApi, type ChatConversation, type ChatMessage, type ChatPeer } from '../api/messages'
import { socialApi } from '../api/social'
import { useChatSocket } from '../hooks/useChatSocket'
import { useChatStore } from '../stores/useChatStore'
import { useUserStore } from '../stores/useUserStore'
import ConfirmDialog from '../components/common/ConfirmDialog'
import SocialLayout, { SocialAvatar, SocialHeader } from '../components/social/SocialLayout'

const HISTORY_PAGE = 30

/** 微信式常用 emoji 面板（基础表情集） */
const EMOJIS = ['😀', '😄', '😁', '😂', '🤣', '😊', '😇', '🙂', '😉', '😍', '🥰', '😘', '😜', '🤪', '😎', '🤩', '🥳', '😏', '😢', '😭', '😤', '😡', '😱', '😳', '🤔', '🤗', '🤫', '😴', '👍', '👎', '👏', '🙏', '💪', '🤝', '👋', '✌️', '❤️', '💖', '💯', '✨', '🎉', '🔥', '🌟', '🌈', '🍀', '☕', '🍰', '🎁']

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

/** 时间分组标题：今天 / 昨天 / 具体日期 */
function groupTitle(value: string | null, english: boolean): string {
  const t = validTime(value)
  if (!t) return ''
  const date = new Date(t)
  const now = new Date()
  if (date.toDateString() === now.toDateString()) return english ? 'Today' : '今天'
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return english ? 'Yesterday' : '昨天'
  return date.toLocaleDateString(english ? 'en-US' : 'zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
}

/** 相邻消息超过该分钟数则单独显示时间（微信约 5 分钟） */
const TIME_SPLIT_MINUTES = 5

interface MessageView {
  msg: ChatMessage
  showTime: boolean
  groupKey: string
}

/** 为消息序列标注分组与是否显示时间 */
function buildMessageView(messages: ChatMessage[], english: boolean): MessageView[] {
  return messages.map((msg, index) => {
    const prev = messages[index - 1]
    const groupKey = groupTitle(msg.created_at, english)
    const groupChanged = !prev || groupTitle(prev.created_at, english) !== groupKey
    const timeGap = prev ? Math.abs(validTime(msg.created_at) - validTime(prev.created_at)) / 60000 : Infinity
    return { msg, showTime: groupChanged || timeGap >= TIME_SPLIT_MINUTES, groupKey }
  })
}

export default function MessagesPage() {
  const { i18n } = useTranslation()
  const english = i18n.resolvedLanguage?.startsWith('en') ?? false
  const text = useCallback((zh: string, en: string) => english ? en : zh, [english])
  const userId = useUserStore((s) => s.userInfo?.uuid || s.userInfo?.user_id || s.userInfo?.id || '')
  const user = useUserStore((s) => s.userInfo)
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
  const [searchQuery, setSearchQuery] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<ChatConversation | null>(null)
  const [settingBusy, setSettingBusy] = useState<string | null>(null)
  const [showEmoji, setShowEmoji] = useState(false)
  const [imageUploading, setImageUploading] = useState(false)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
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

  /** 会话列表同步：已有会话更新预览；首聊（无会话）插入新会话项 */
  const syncConversationAfterSend = useCallback((peerId: string, msg: ChatMessage) => {
    setConversations((prev) => {
      const exists = prev.some((c) => c.peer.user_id === peerId)
      const updated = prev.map((c) => c.peer.user_id === peerId
        ? { ...c, last_message: msg.content, last_message_at: msg.created_at, last_sender_id: msg.sender_id }
        : c)
      if (exists || !directPeer) return updated
      return [{ conversation_id: msg.conversation_id, peer: directPeer, last_message: msg.content, last_sender_id: msg.sender_id, last_message_at: msg.created_at, unread: 0, is_pinned: false }, ...updated]
    })
  }, [directPeer])

  /** 发送消息（乐观更新：先本地插入"发送中"，成功替换为服务端消息，失败标记可重发） */
  const sendMessage = useCallback(async (peerId: string, content: string, messageType: 'text' | 'image' = 'text') => {
    const tempId = -Date.now()
    const tempMsg: ChatMessage = {
      id: tempId,
      conversation_id: '',
      sender_id: userId,
      message_type: messageType,
      content,
      read: false,
      created_at: new Date().toISOString(),
      status: 'sending',
    }
    setMessages((prev) => [...prev, tempMsg])
    try {
      const msg = await messagesApi.send(peerId, content, messageType)
      if (msg) {
        setMessages((prev) => prev.map((m) => m.id === tempId ? { ...msg } : m))
        syncConversationAfterSend(peerId, msg)
      }
      return true
    } catch (err) {
      setMessages((prev) => prev.map((m) => m.id === tempId ? { ...m, status: 'failed' } : m))
      const status = (err as { response?: { status?: number } })?.response?.status
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setSendError(status === 403 ? text('仅好友之间可以私聊，先去添加好友吧', 'Only friends can chat. Add them as a friend first.') : detail || text('发送失败，请重试', 'Failed to send. Please retry.'))
      return false
    }
  }, [setSendError, syncConversationAfterSend, text, userId])

  const handleSend = async () => {
    const content = input.trim()
    if (!content || !selectedPeerId || sending) return
    setSending(true)
    setSendError('')
    setInput('')
    try {
      await sendMessage(selectedPeerId, content)
    } finally {
      setSending(false)
    }
  }

  /** 失败消息重发 */
  const resendMessage = async (msg: ChatMessage) => {
    if (!selectedPeerId) return
    setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, status: 'sending' } : m))
    setSendError('')
    const ok = await sendMessage(selectedPeerId, msg.content, msg.message_type === 'image' ? 'image' : 'text')
    if (ok) {
      // 重发成功：移除旧的失败消息（sendMessage 已插入新临时消息）
      setMessages((prev) => prev.filter((m) => m.id !== msg.id))
    } else {
      setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, status: 'failed' } : m))
    }
  }

  /** 选中图片 → 上传 → 发送图片消息 */
  const handlePickImage = async (file: File | undefined) => {
    if (!file || !selectedPeerId || imageUploading) return
    if (!/^image\/(png|jpe?g|gif|webp)$/.test(file.type)) {
      toast.error(text('仅支持 png/jpg/gif/webp 图片', 'Only png/jpg/gif/webp images are supported'))
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error(text('图片不能超过 10MB', 'Image must be under 10MB'))
      return
    }
    setImageUploading(true)
    try {
      const data = await messagesApi.uploadImage(file)
      if (data?.url) await sendMessage(selectedPeerId, data.url, 'image')
    } catch {
      toast.error(text('图片发送失败，请重试', 'Failed to send image. Please retry.'))
    } finally {
      setImageUploading(false)
    }
  }

  /** 置顶/取消置顶（个人视角） */
  const togglePin = async (conv: ChatConversation) => {
    if (settingBusy) return
    setSettingBusy(conv.peer.user_id)
    try {
      const res = await messagesApi.setSetting(conv.peer.user_id, { is_pinned: !conv.is_pinned })
      setConversations((prev) => prev
        .map((c) => c.peer.user_id === conv.peer.user_id ? { ...c, is_pinned: res?.is_pinned ?? !conv.is_pinned } : c)
        .sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned)))
    } catch {
      toast.error(text('操作失败，请重试', 'Failed. Please retry.'))
    } finally {
      setSettingBusy(null)
    }
  }

  /** 删除会话（个人视角隐藏，对方不受影响） */
  const handleDeleteConversation = async () => {
    if (!deleteTarget) return
    try {
      await messagesApi.setSetting(deleteTarget.peer.user_id, { hidden: true })
      setConversations((prev) => prev.filter((c) => c.peer.user_id !== deleteTarget.peer.user_id))
      if (selectedPeerId === deleteTarget.peer.user_id) closeChat()
      toast.success(text('会话已删除', 'Conversation deleted'))
    } catch {
      toast.error(text('删除失败，请重试', 'Failed to delete. Please retry.'))
    }
    setDeleteTarget(null)
  }

  /** 会话搜索过滤（好友名 / 最后消息内容） */
  const filteredConversations = conversations.filter((c) => {
    const q = searchQuery.trim().toLocaleLowerCase()
    if (!q) return true
    return c.peer.username.toLocaleLowerCase().includes(q) || c.last_message.toLocaleLowerCase().includes(q)
  })

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
            <>
              <label className="messages-search">
                <Search size={14} />
                <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={text('搜索会话…', 'Search conversations…')} aria-label={text('搜索会话', 'Search conversations')} />
              </label>
              {filteredConversations.length === 0 ? (
                <div className="messages-empty"><MessageSquare size={22} /><p>{text('没有匹配的会话', 'No matching conversations')}</p></div>
              ) : (
                <ul>
                  {filteredConversations.map((conv) => (
                    <li key={conv.conversation_id} className="messages-conv-wrap">
                      <button
                        className={`messages-conv${conv.peer.user_id === selectedPeerId ? ' is-active' : ''}${conv.is_pinned ? ' is-pinned' : ''}`}
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
                            <small>{conv.last_sender_id === userId ? `${text('我：', 'You: ')}${conv.last_message.startsWith('/media/') ? text('[图片]', '[Image]') : conv.last_message}` : conv.last_message.startsWith('/media/') ? text('[图片]', '[Image]') : conv.last_message}</small>
                            {conv.unread > 0 && <b>{conv.unread > 99 ? '99+' : conv.unread}</b>}
                          </span>
                        </span>
                      </button>
                      <div className="messages-conv-actions">
                        <button className={conv.is_pinned ? 'is-active' : ''} onClick={() => void togglePin(conv)} disabled={settingBusy === conv.peer.user_id} title={conv.is_pinned ? text('取消置顶', 'Unpin') : text('置顶', 'Pin')} aria-label={conv.is_pinned ? text('取消置顶', 'Unpin') : text('置顶', 'Pin')}><Pin size={13} /></button>
                        <button onClick={() => setDeleteTarget(conv)} title={text('删除会话', 'Delete conversation')} aria-label={text('删除会话', 'Delete conversation')}><Trash2 size={13} /></button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
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
                {buildMessageView(messages, english).map(({ msg, showTime, groupKey }) => {
                  const mine = msg.sender_id === userId
                  return (
                    <Fragment key={msg.id}>
                      {showTime && <div className="messages-group-title">{groupKey}</div>}
                      <div className={`messages-bubble ${mine ? 'mine' : 'theirs'}`}>
                        {!mine && <SocialAvatar username={selectedPeer.username} avatar={selectedPeer.avatar} size={30} />}
                        <div className="messages-bubble-main">
                          {showTime && <time className="messages-bubble-time">{formatTime(msg.created_at, english)}</time>}
                          <div className="messages-bubble-content">
                            {msg.status === 'failed' ? (
                              <>
                                {msg.message_type === 'image'
                                  ? <img className="messages-image failed" src={msg.content} alt="" onClick={() => setPreviewImage(msg.content)} />
                                  : <p className="messages-failed-text">{msg.content}</p>}
                                <button className="messages-resend" onClick={() => void resendMessage(msg)}>{text('发送失败，点击重发', 'Failed, tap to resend')}</button>
                              </>
                            ) : msg.message_type === 'image' ? (
                              <img className="messages-image" src={msg.content} alt={text('聊天图片', 'Chat image')} loading="lazy" onClick={() => setPreviewImage(msg.content)} />
                            ) : (
                              <p>{msg.content}</p>
                            )}
                          </div>
                          {mine && (
                            <span className="messages-send-status">
                              {msg.status === 'sending' ? <Loader2 size={11} className="animate-spin" /> : msg.status === 'failed' ? <span className="messages-status-failed">{text('未发送', 'Not sent')}</span> : msg.read ? text('已读', 'Read') : text('未读', 'Unread')}
                            </span>
                          )}
                        </div>
                        {mine && <SocialAvatar username={user?.username || ''} avatar={user?.avatar || null} size={30} />}
                      </div>
                    </Fragment>
                  )
                })}
                <div ref={messagesEndRef} />
              </div>
              <footer className="messages-chat-input">
                {sendError && <p className="messages-send-error">{sendError}</p>}
                <div className="messages-input-bar">
                  <div className="messages-input-tools">
                    <button className={`messages-tool${showEmoji ? ' is-active' : ''}`} onClick={() => setShowEmoji((v) => !v)} title={text('表情', 'Emoji')} aria-label={text('表情', 'Emoji')}><Smile size={18} /></button>
                    <button className="messages-tool" onClick={() => imageInputRef.current?.click()} disabled={imageUploading} title={text('发送图片', 'Send image')} aria-label={text('发送图片', 'Send image')}>{imageUploading ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}</button>
                    <input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={(e) => { void handlePickImage(e.target.files?.[0]); e.target.value = '' }} />
                  </div>
                  {showEmoji && (
                    <div className="messages-emoji-panel" role="listbox" aria-label={text('表情选择', 'Emoji picker')}>
                      {EMOJIS.map((emoji) => (
                        <button key={emoji} onClick={() => { setInput((v) => v + emoji); setShowEmoji(false) }}>{emoji}</button>
                      ))}
                    </div>
                  )}
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
                </div>
              </footer>
            </>
          )}
        </section>
      </div>
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
        title={text('删除会话', 'Delete conversation')}
        message={deleteTarget ? text(`确定删除与「${deleteTarget.peer.username}」的会话吗？聊天记录将不再显示（对方不受影响）。`, `Delete the conversation with ${deleteTarget.peer.username}? Messages will be hidden for you (not affected for them).`) : ''}
        variant="danger"
        confirmText={text('删除', 'Delete')}
        onConfirm={handleDeleteConversation}
      />
      {previewImage && (
        <div className="messages-image-preview" role="dialog" aria-modal="true" onClick={() => setPreviewImage(null)}>
          <button className="messages-image-preview-close" aria-label={text('关闭预览', 'Close preview')}><X size={20} /></button>
          <img src={previewImage} alt="" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </SocialLayout>
  )
}
