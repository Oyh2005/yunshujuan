import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ArrowLeft, Check, Copy, Forward, ImagePlus, Loader2, MessageSquare, Pin, Quote, Search, Send, Smile, Trash2, Undo2, Users, X } from 'lucide-react'
import { messagesApi, type ChatConversation, type ChatMessage, type ChatPeer } from '../api/messages'
import { socialApi } from '../api/social'
import type { SocialUser } from '../types/api'
import { useChatSocket } from '../hooks/useChatSocket'
import { useChatStore } from '../stores/useChatStore'
import { useChatFontStore } from '../stores/useChatFontStore'
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

/** 微信式会话列表时间：今天 → 下午2:30；昨天 → 昨天；一周内 → 星期三；同年 → 8月27日；跨年 → 2022年8月27日 */
function formatTime(value: string | null, english: boolean): string {
  const t = validTime(value)
  if (!t) return ''
  const date = new Date(t)
  const now = new Date()
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const dayDiff = Math.round((startOfDay(now) - startOfDay(date)) / 86400000)
  if (dayDiff <= 0) return formatClock(date, english)
  if (dayDiff === 1) return english ? 'Yesterday' : '昨天'
  if (dayDiff < 7) return date.toLocaleDateString(english ? 'en-US' : 'zh-CN', { weekday: 'long' })
  return date.toLocaleDateString(
    english ? 'en-US' : 'zh-CN',
    date.getFullYear() === now.getFullYear() ? { month: 'short', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' },
  )
}

/** 微信式时刻：下午2:30（中文）/ 2:30 PM（英文） */
function formatClock(date: Date, english: boolean): string {
  return date.toLocaleTimeString(english ? 'en-US' : 'zh-CN', { hour: 'numeric', minute: '2-digit', hour12: true })
}

/**
 * 微信式时间分组标题（仿微信聊天时间显示规则）：
 * 今天 → 下午2:30；昨天 → 昨天 下午3:20；一周内 → 星期三 上午10:00；
 * 同年更早 → 8月27日 上午10:00；跨年 → 2022年8月27日 下午4:00
 */
function groupTitle(value: string | null, english: boolean): string {
  const t = validTime(value)
  if (!t) return ''
  const date = new Date(t)
  const now = new Date()
  const clock = formatClock(date, english)
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const dayDiff = Math.round((startOfDay(now) - startOfDay(date)) / 86400000)
  if (dayDiff <= 0) return clock
  if (dayDiff === 1) return `${english ? 'Yesterday' : '昨天'} ${clock}`
  if (dayDiff < 7) {
    const weekday = date.toLocaleDateString(english ? 'en-US' : 'zh-CN', { weekday: 'long' })
    return `${weekday} ${clock}`
  }
  const datePart = date.toLocaleDateString(
    english ? 'en-US' : 'zh-CN',
    date.getFullYear() === now.getFullYear() ? { month: 'short', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' },
  )
  return `${datePart} ${clock}`
}

/** 相邻消息超过该分钟数则单独显示时间（微信约 5 分钟） */
const TIME_SPLIT_MINUTES = 5

interface MessageView {
  msg: ChatMessage
  showTime: boolean
  groupKey: string
}

/** 消息右键/长按菜单状态（canRecall 在打开瞬间计算，比挂载时快照更准） */
interface MenuState {
  msg: ChatMessage
  x: number
  y: number
  canRecall: boolean
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
  const chatFontSize = useChatFontStore((s) => s.size)
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
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(() => new Set())
  const [peerTyping, setPeerTyping] = useState(false)
  // 消息右键/长按菜单（WeChat 式：菜单项在打开瞬间计算，含 2 分钟撤回窗口）
  const [menu, setMenu] = useState<MenuState | null>(null)
  // 转发弹窗
  const [forwardMsg, setForwardMsg] = useState<ChatMessage | null>(null)
  const [forwardFriends, setForwardFriends] = useState<SocialUser[]>([])
  const [forwardSelected, setForwardSelected] = useState<Set<string>>(() => new Set())
  const [forwardSearch, setForwardSearch] = useState('')
  const [forwardLoading, setForwardLoading] = useState(false)
  const [forwardBusy, setForwardBusy] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const chatInputRef = useRef<HTMLTextAreaElement>(null)
  const typingTimerRef = useRef<number | null>(null)
  const lastTypingAtRef = useRef(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  /** 移动端长按计时器（450ms 后弹出菜单） */
  const longPressTimerRef = useRef<number | null>(null)
  /** 长按后抑制随后的 click（否则长按图片会同时打开预览） */
  const suppressClickRef = useRef(false)
  // 渲染期不可调 Date.now()（purity 规则）：「重新编辑」的 2 分钟窗口用定时刷新的 nowTick 判断
  const [nowTick, setNowTick] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [])
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
  // 消息 id → 消息（引用条联动用：被引用消息撤回后，引用显示「消息已撤回」）
  const msgById = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages])

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
    setMenu(null)
    setForwardMsg(null)
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

  // 卸载时清理长按计时器
  useEffect(() => () => {
    if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current)
  }, [])

  // 菜单打开期间：点击外部 / Esc / 滚动 / 窗口变化 → 关闭（scroll 用捕获阶段监听所有滚动容器）
  useEffect(() => {
    if (!menu) return
    const closeMenu = (e: Event) => {
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return
      setMenu(null)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null) }
    window.addEventListener('mousedown', closeMenu)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', closeMenu)
    window.addEventListener('scroll', closeMenu, true)
    return () => {
      window.removeEventListener('mousedown', closeMenu)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', closeMenu)
      window.removeEventListener('scroll', closeMenu, true)
    }
  }, [menu])

  // 菜单越界修正：渲染后测量尺寸，超出视口则移回（setState 放 setTimeout 内，遵守 set-state-in-effect 规则）
  useLayoutEffect(() => {
    if (!menu || !menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const pad = 8
    let x = menu.x
    let y = menu.y
    if (x + rect.width > window.innerWidth - pad) x = Math.max(pad, window.innerWidth - rect.width - pad)
    if (y + rect.height > window.innerHeight - pad) y = Math.max(pad, window.innerHeight - rect.height - pad)
    if (x !== menu.x || y !== menu.y) {
      const timer = window.setTimeout(() => setMenu({ ...menu, x, y }), 0)
      return () => window.clearTimeout(timer)
    }
  }, [menu])

  // WS 实时事件
  const { sendTyping } = useChatSocket({
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
    onRecall: (messageId) => {
      // 对方撤回消息：本地标记撤回
      setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, recalled: true, status: undefined } : m))
    },
    onTyping: (fromUserId) => {
      // 仅当前会话显示"正在输入"（3 秒后消失）
      if (fromUserId !== selectedPeerRef.current) return
      setPeerTyping(true)
      if (typingTimerRef.current !== null) window.clearTimeout(typingTimerRef.current)
      typingTimerRef.current = window.setTimeout(() => setPeerTyping(false), 3000)
    },
    onOnline: (userId) => {
      setOnlineUsers((prev) => {
        if (prev.has(userId)) return prev
        const next = new Set(prev)
        next.add(userId)
        return next
      })
    },
    onOffline: (userId) => {
      setOnlineUsers((prev) => {
        if (!prev.has(userId)) return prev
        const next = new Set(prev)
        next.delete(userId)
        return next
      })
    },
    onOnlineList: (userIds) => {
      setOnlineUsers(new Set(userIds))
    },
  })

  /** 输入时通知对方"正在输入"（3s 节流，避免刷屏） */
  const notifyTyping = () => {
    if (!selectedPeerId) return
    const now = Date.now()
    if (now - lastTypingAtRef.current < 3000) return
    lastTypingAtRef.current = now
    sendTyping(selectedPeerId)
  }

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
  const sendMessage = useCallback(async (peerId: string, content: string, messageType: 'text' | 'image' = 'text', replyToId?: number) => {
    const tempId = -Date.now()
    const tempMsg: ChatMessage = {
      id: tempId,
      conversation_id: '',
      sender_id: userId,
      message_type: messageType,
      content,
      reply_to_id: replyToId,
      reply_content: replyToId ? replyTo?.reply_content || replyTo?.content : undefined,
      read: false,
      created_at: new Date().toISOString(),
      status: 'sending',
    }
    setMessages((prev) => [...prev, tempMsg])
    try {
      const msg = await messagesApi.send(peerId, content, messageType, replyToId)
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
  }, [replyTo, setSendError, syncConversationAfterSend, text, userId])

  const handleSend = async () => {
    const content = input.trim()
    if (!content || !selectedPeerId || sending) return
    setSending(true)
    setSendError('')
    setInput('')
    try {
      const ok = await sendMessage(selectedPeerId, content, 'text', replyTo?.id)
      if (ok) setReplyTo(null)
    } finally {
      setSending(false)
    }
  }

  /** 复制消息内容 */
  /** 复制消息内容（仅文本消息，图片消息菜单不提供复制） */
  const copyMessage = async (msg: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(msg.content)
      toast.success(text('已复制', 'Copied'))
    } catch {
      toast.error(text('复制失败', 'Copy failed'))
    }
  }

  /** 撤回消息（2 分钟内，仅本人） */
  const recallMessage = async (msg: ChatMessage) => {
    if (!selectedPeerId) return
    try {
      const updated = await messagesApi.recall(selectedPeerId, msg.id)
      if (updated) setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...updated } : m))
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(detail || text('撤回失败', 'Recall failed'))
    }
  }

  /** 撤回后 2 分钟内可重新编辑（微信规则；图片消息不支持） */
  const canReedit = (msg: ChatMessage) =>
    msg.recalled && msg.sender_id === userId && msg.message_type !== 'image' && (nowTick - validTime(msg.created_at)) <= 2 * 60 * 1000

  /** 重新编辑：把撤回的文本放回输入框（微信「重新编辑」，发送后是全新消息） */
  const reeditMessage = (msg: ChatMessage) => {
    setInput(msg.content)
    setReplyTo(null)
    setShowEmoji(false)
    setSendError('')
    window.setTimeout(() => {
      const el = chatInputRef.current
      if (el) {
        el.focus()
        const len = el.value.length
        el.setSelectionRange(len, len)
      }
    }, 0)
  }

  /** 跳转到指定消息在聊天中的位置（滚动居中 + 闪烁高亮，供引用缩略图跳转） */
  const jumpToMessage = (messageId: number) => {
    const el = document.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`)
    if (!el) {
      toast.info(text('原消息不在已加载范围内', 'The original message is not loaded yet'))
      return
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('messages-target-flash')
    window.setTimeout(() => el.classList.remove('messages-target-flash'), 1600)
  }

  /** 失败消息重发 */
  const resendMessage = async (msg: ChatMessage) => {
    if (!selectedPeerId) return
    setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, status: 'sending' } : m))
    setSendError('')
    const ok = await sendMessage(selectedPeerId, msg.content, msg.message_type === 'image' ? 'image' : 'text', msg.reply_to_id || undefined)
    if (ok) {
      // 重发成功：移除旧的失败消息（sendMessage 已插入新临时消息）
      setMessages((prev) => prev.filter((m) => m.id !== msg.id))
    } else {
      setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, status: 'failed' } : m))
    }
  }

  /**
   * 打开消息操作菜单（WeChat 式：桌面右键 / 移动端长按）。
   * 撤回窗口在打开瞬间计算（now 由事件回调传入），后端撤回接口仍严格校验兜底。
   */
  const openMessageMenu = (msg: ChatMessage, x: number, y: number, now: number) => {
    if (msg.recalled || msg.status === 'sending') return
    setMenu({
      msg,
      x,
      y,
      canRecall: msg.sender_id === userId && now - validTime(msg.created_at) <= 2 * 60 * 1000,
    })
  }

  const cancelBubbleLongPress = () => {
    if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current)
    longPressTimerRef.current = null
  }

  const onBubbleTouchStart = (e: React.TouchEvent, msg: ChatMessage) => {
    cancelBubbleLongPress()
    if (msg.recalled || msg.status === 'sending') return
    const touch = e.touches[0]
    if (!touch) return
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null
      // 长按后抑制紧随的 click（长按图片会同时触发点击预览）
      suppressClickRef.current = true
      window.setTimeout(() => { suppressClickRef.current = false }, 800)
      openMessageMenu(msg, touch.clientX, touch.clientY, Date.now())
    }, 450)
  }

  /** 打开转发弹窗（好友多选，文本/图片均可转发） */
  const openForward = async (msg: ChatMessage) => {
    setMenu(null)
    setForwardMsg(msg)
    setForwardSelected(new Set())
    setForwardSearch('')
    setForwardLoading(true)
    try {
      const res = await socialApi.friendsList()
      setForwardFriends((res.data ?? []).filter((f) => f.user_id !== userId))
    } catch {
      setForwardFriends([])
    } finally {
      setForwardLoading(false)
    }
  }

  const toggleForwardSelect = (peerId: string) => {
    setForwardSelected((prev) => {
      const next = new Set(prev)
      if (next.has(peerId)) next.delete(peerId)
      else next.add(peerId)
      return next
    })
  }

  const filteredForwardFriends = forwardFriends.filter((f) => {
    const q = forwardSearch.trim().toLocaleLowerCase()
    return !q || f.username.toLocaleLowerCase().includes(q)
  })

  /** 执行转发：给每位选中好友发送一份内容副本（图片转发复用 /media URL） */
  const doForward = async () => {
    if (!forwardMsg || forwardSelected.size === 0 || forwardBusy) return
    setForwardBusy(true)
    const type = forwardMsg.message_type === 'image' ? 'image' : 'text'
    const results = await Promise.allSettled([...forwardSelected].map((peerId) => messagesApi.send(peerId, forwardMsg.content, type)))
    const ok = results.filter((r) => r.status === 'fulfilled').length
    if (ok > 0) toast.success(ok === results.length ? text(`已转发给 ${ok} 位好友`, `Forwarded to ${ok} friends`) : text(`转发完成（${ok}/${results.length} 成功）`, `Forwarded ${ok}/${results.length}`))
    if (ok < results.length) toast.error(text('部分好友转发失败，请重试', 'Failed to forward to some friends'))
    setForwardBusy(false)
    setForwardMsg(null)
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
    setMenu(null)
    setForwardMsg(null)
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
      <div className={`messages-layout${selectedPeerId ? ' has-chat' : ''}`} style={{ '--chat-font-size': `${chatFontSize}px` } as React.CSSProperties}>
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
                        <span className="messages-peer-avatar">
                          <SocialAvatar username={conv.peer.username} avatar={conv.peer.avatar} size={42} />
                          {onlineUsers.has(conv.peer.user_id) && <i className="messages-online-dot" title={text('在线', 'Online')} />}
                        </span>
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
                <span className="messages-chat-peer">
                  <strong>{selectedPeer.username}</strong>
                  {peerTyping && <small className="messages-typing">{text('正在输入…', 'Typing…')}</small>}
                </span>
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
                      <div
                        className={`messages-bubble ${mine ? 'mine' : 'theirs'}`}
                        data-message-id={msg.id}
                        onContextMenu={(e) => { e.preventDefault(); if (menu?.msg.id !== msg.id) openMessageMenu(msg, e.clientX, e.clientY, Date.now()) }}
                        onTouchStart={(e) => onBubbleTouchStart(e, msg)}
                        onTouchMove={cancelBubbleLongPress}
                        onTouchEnd={cancelBubbleLongPress}
                        onTouchCancel={cancelBubbleLongPress}
                      >
                        {!mine && <SocialAvatar username={selectedPeer.username} avatar={selectedPeer.avatar} size={30} />}
                        <div className="messages-bubble-main">
                          <div className="messages-bubble-content">
                            {msg.recalled ? (
                              <p className="messages-recalled">
                                {mine ? text('你撤回了一条消息', 'You recalled a message') : text('对方撤回了一条消息', 'Message recalled')}
                                {canReedit(msg) && (
                                  <button className="messages-reedit" onClick={() => reeditMessage(msg)}>{text('重新编辑', 'Edit')}</button>
                                )}
                              </p>
                            ) : msg.status === 'failed' ? (
                              <>
                                {msg.message_type === 'image'
                                  ? <img className="messages-image failed" src={msg.content} alt="" onClick={() => { if (suppressClickRef.current) return; setPreviewImage(msg.content) }} />
                                  : <p className="messages-failed-text">{msg.content}</p>}
                                <button className="messages-resend" onClick={() => void resendMessage(msg)}>{text('发送失败，点击重发', 'Failed, tap to resend')}</button>
                              </>
                            ) : msg.message_type === 'image' ? (
                              <img className="messages-image" src={msg.content} alt={text('聊天图片', 'Chat image')} loading="lazy" onClick={() => { if (suppressClickRef.current) return; setPreviewImage(msg.content) }} />
                            ) : (
                              <>
                                {msg.reply_content && (
                                  <div className={`messages-quote${msgById.get(msg.reply_to_id ?? -1)?.recalled ? ' is-recalled' : ''}`} title={text('引用消息', 'Quoted message')}>
                                    {(() => {
                                      const ref = msg.reply_to_id != null ? msgById.get(msg.reply_to_id) : undefined
                                      if (ref?.recalled) return <span>{text('消息已撤回', 'Message recalled')}</span>
                                      if (ref?.message_type === 'image' && ref.content) {
                                        // 被引用的是图片：显示缩略图，左键查看大图，右键跳转到原消息位置
                                        return (
                                          <img
                                            className="messages-quote-image"
                                            src={ref.content}
                                            alt={text('[图片]', '[Image]')}
                                            title={text('点击查看大图，右键跳转到原消息', 'Click to view full image, right-click to jump to the original message')}
                                            loading="lazy"
                                            onClick={(e) => { e.stopPropagation(); setPreviewImage(ref.content) }}
                                            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); jumpToMessage(ref.id) }}
                                          />
                                        )
                                      }
                                      return <span>{msg.reply_content}</span>
                                    })()}
                                  </div>
                                )}
                                <p>{msg.content}</p>
                              </>
                            )}
                          </div>
                          {mine && (
                            <span className="messages-send-status">
                              {msg.status === 'sending' ? <Loader2 size={11} className="animate-spin" /> : msg.status === 'failed' ? <span className="messages-status-failed">{text('未发送', 'Not sent')}</span> : msg.recalled ? '' : msg.read ? text('已读', 'Read') : text('未读', 'Unread')}
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
                {replyTo && (
                  <div className="messages-reply-bar">
                    <Quote size={13} />
                    <span className="messages-reply-copy">{replyTo.message_type === 'image' ? text('[图片]', '[Image]') : replyTo.reply_content || replyTo.content}</span>
                    <button onClick={() => setReplyTo(null)} aria-label={text('取消引用', 'Cancel reply')}><X size={13} /></button>
                  </div>
                )}
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
                    ref={chatInputRef}
                    value={input}
                    onChange={(event) => { setInput(event.target.value); if (sendError) setSendError(''); notifyTyping() }}
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
      {menu && (
        <div ref={menuRef} className="workspace-menu messages-context-menu" style={{ left: menu.x, top: menu.y }} role="menu">
          {menu.msg.message_type !== 'image' && (
            <button className="workspace-menu-item" role="menuitem" onClick={() => { void copyMessage(menu.msg); setMenu(null) }}>
              <Copy size={14} />{text('复制', 'Copy')}
            </button>
          )}
          <button className="workspace-menu-item" role="menuitem" onClick={() => { setReplyTo(menu.msg); setMenu(null) }}>
            <Quote size={14} />{text('引用', 'Reply')}
          </button>
          <button className="workspace-menu-item" role="menuitem" onClick={() => void openForward(menu.msg)}>
            <Forward size={14} />{text('转发', 'Forward')}
          </button>
          {menu.canRecall && (
            <button className="workspace-menu-item workspace-menu-danger" role="menuitem" onClick={() => { setMenu(null); void recallMessage(menu.msg) }}>
              <Undo2 size={14} />{text('撤回', 'Recall')}
            </button>
          )}
        </div>
      )}
      {forwardMsg && (
        <div className="messages-forward-modal" onClick={(e) => { if (e.target === e.currentTarget) setForwardMsg(null) }}>
          <div className="messages-forward-card" role="dialog" aria-modal="true">
            <div className="messages-forward-head">
              <strong>{text('转发给', 'Forward to')}</strong>
              <button className="workspace-icon-button" onClick={() => setForwardMsg(null)} aria-label={text('关闭', 'Close')}><X size={16} /></button>
            </div>
            <div className="messages-forward-body">
              {forwardMsg.message_type === 'image'
                ? <img className="messages-forward-preview" src={forwardMsg.content} alt="" />
                : <p className="messages-forward-preview">{forwardMsg.content}</p>}
              <label className="messages-forward-search">
                <Search size={13} />
                <input value={forwardSearch} onChange={(e) => setForwardSearch(e.target.value)} placeholder={text('搜索好友…', 'Search friends…')} aria-label={text('搜索好友', 'Search friends')} />
              </label>
              <div className="messages-forward-list">
                {forwardLoading ? (
                  <div className="messages-forward-empty"><Loader2 size={16} className="animate-spin" />{text('加载好友…', 'Loading…')}</div>
                ) : filteredForwardFriends.length === 0 ? (
                  <div className="messages-forward-empty">{text('没有可选的好友', 'No friends available')}</div>
                ) : (
                  filteredForwardFriends.map((f) => (
                    <button key={f.user_id} className={`messages-forward-item${forwardSelected.has(f.user_id) ? ' is-selected' : ''}`} onClick={() => toggleForwardSelect(f.user_id)}>
                      <SocialAvatar username={f.username} avatar={f.avatar} size={34} />
                      <span className="messages-forward-name">{f.username}</span>
                      <span className="messages-forward-check">{forwardSelected.has(f.user_id) ? <Check size={12} /> : null}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
            <div className="messages-forward-foot">
              <button className="secondary-button" onClick={() => setForwardMsg(null)}>{text('取消', 'Cancel')}</button>
              <button className="primary-button" disabled={forwardSelected.size === 0 || forwardBusy} onClick={() => void doForward()}>
                {forwardBusy ? <Loader2 size={13} className="animate-spin" /> : null}{text('发送', 'Send')}{forwardSelected.size > 0 ? ` (${forwardSelected.size})` : ''}
              </button>
            </div>
          </div>
        </div>
      )}
    </SocialLayout>
  )
}
