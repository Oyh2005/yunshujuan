import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search,
  FileText,
  MessageSquare,
  History,
  GraduationCap,
  Library,
  Cloud,
  Flame,
  BarChart3,
  Network,
  Rss,
  Users,
  Bell,
  Compass,
  Timer,
  Settings,
  User,
  Info,
  Plus,
  Sun,
  Moon,
} from 'lucide-react'
import { notesApi } from '../../api/notes'
import { useThemeStore } from '../../stores/useThemeStore'
import { usePetStore } from '../../stores/usePetStore'
import type { Note } from '../../types/api'

interface PaletteItem {
  id: string
  label: string
  hint?: string
  icon: React.ReactNode
  action: () => void
}

/**
 * 命令面板 ⌘K：搜索笔记 / 跳转页面 / 快捷操作
 * Ctrl/⌘ + K 唤起，↑↓ 选择，Enter 执行，Esc 关闭
 */
export default function CommandPalette() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [searchResults, setSearchResults] = useState<Note[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)
  const petVisible = usePetStore((s) => s.visible)
  const setPetVisible = usePetStore((s) => s.setVisible)

  // 全局快捷键：⌘/Ctrl+K 命令面板；Ctrl+N 新建笔记（备选方向）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        navigate('/notes/new')
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  // 打开时重置并聚焦（setState 移入异步回调，避免 set-state-in-effect 规则报错）
  useEffect(() => {
    if (open) {
      const timer = window.setTimeout(() => {
        setQuery('')
        setSelected(0)
        setSearchResults([])
        inputRef.current?.focus()
      }, 60)
      return () => window.clearTimeout(timer)
    }
  }, [open])

  // 笔记搜索（防抖 300ms；空查询的清理放入异步回调）
  useEffect(() => {
    if (!query.trim()) {
      const resetTimer = window.setTimeout(() => setSearchResults([]), 0)
      return () => window.clearTimeout(resetTimer)
    }
    const timer = setTimeout(async () => {
      try {
        const res = await notesApi.search(query)
        setSearchResults((res.data?.notes as Note[]) || [])
      } catch {
        setSearchResults([])
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  const run = (item: PaletteItem) => {
    setOpen(false)
    item.action()
  }

  const items = useMemo<PaletteItem[]>(() => {
    const searches: PaletteItem[] = searchResults.map((n) => ({
      id: `note-${n.id}`,
      label: n.title || t('note.untitled'),
      hint: n.content?.slice(0, 36) || '',
      icon: <FileText size={16} className="shrink-0 text-[var(--color-accent)]" />,
      action: () => navigate(`/notes/${n.id}`),
    }))

    const pages: PaletteItem[] = [
      { id: 'page-notes', label: t('nav.notes'), icon: <FileText size={16} />, action: () => navigate('/notes') },
      { id: 'page-chat', label: t('nav.chat'), icon: <MessageSquare size={16} />, action: () => navigate('/chat') },
      { id: 'page-sessions', label: t('nav.sessions'), icon: <History size={16} />, action: () => navigate('/sessions') },
      { id: 'page-review', label: t('nav.review'), icon: <GraduationCap size={16} />, action: () => navigate('/review') },
      { id: 'page-knowledge', label: t('nav.knowledge'), icon: <Library size={16} />, action: () => navigate('/knowledge') },
      { id: 'page-pet', label: t('nav.pet'), icon: <Cloud size={16} />, action: () => navigate('/pet') },
      { id: 'page-habit', label: t('nav.habit'), icon: <Flame size={16} />, action: () => navigate('/habit') },
      { id: 'page-stats', label: t('nav.stats'), icon: <BarChart3 size={16} />, action: () => navigate('/stats') },
      { id: 'page-graph', label: t('nav.graph'), icon: <Network size={16} />, action: () => navigate('/graph') },
      { id: 'page-social', label: t('nav.social'), icon: <Rss size={16} />, action: () => navigate('/social') },
      { id: 'page-friends', label: t('nav.friends'), icon: <Users size={16} />, action: () => navigate('/friends') },
      { id: 'page-notifications', label: t('nav.notifications'), icon: <Bell size={16} />, action: () => navigate('/notifications') },
      { id: 'page-plaza', label: t('nav.plaza'), icon: <Compass size={16} />, action: () => navigate('/plaza') },
      { id: 'page-pomodoro', label: t('nav.pomodoro'), icon: <Timer size={16} />, action: () => navigate('/pomodoro') },
      { id: 'page-profile', label: t('nav.profile'), icon: <User size={16} />, action: () => navigate('/profile') },
      { id: 'page-settings', label: t('nav.settings'), icon: <Settings size={16} />, action: () => navigate('/settings') },
      { id: 'page-about', label: t('nav.about'), icon: <Info size={16} />, action: () => navigate('/about') },
    ]

    const actions: PaletteItem[] = [
      { id: 'new-note', label: t('palette.newNote'), icon: <Plus size={16} />, action: () => navigate('/notes/new') },
      {
        id: 'toggle-theme',
        label: theme === 'dark' ? t('palette.lightMode') : t('palette.darkMode'),
        icon: theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />,
        action: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
      },
      {
        id: 'toggle-pet',
        label: petVisible ? t('palette.hidePet') : t('palette.showPet'),
        icon: <Cloud size={16} />,
        action: () => setPetVisible(!petVisible),
      },
    ]

    return [...searches, ...pages, ...actions]
  }, [t, navigate, searchResults, theme, setTheme, petVisible, setPetVisible])

  const filtered = query.trim()
    ? items.filter(
        (i) =>
          i.label.toLowerCase().includes(query.toLowerCase()) ||
          (i.hint ?? '').toLowerCase().includes(query.toLowerCase())
      )
    : items

  useEffect(() => {
    const timer = window.setTimeout(() => setSelected(0), 0)
    return () => window.clearTimeout(timer)
  }, [query, open])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((s) => Math.min(s + 1, Math.max(filtered.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((s) => Math.max(s - 1, 0))
    } else if (e.key === 'Enter') {
      const item = filtered[selected]
      if (item) run(item)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[16vh] bg-black/30 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          onClick={() => setOpen(false)}
        >
          <motion.div
            className="w-[560px] max-w-[90vw] rounded-xl bg-[var(--color-card)] border border-[var(--color-border)] shadow-2xl overflow-hidden"
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-4 h-12 border-b border-[var(--color-border)]">
              <Search size={16} className="text-[var(--color-text-tertiary)]" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('palette.placeholder')}
                className="flex-1 bg-transparent text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-placeholder)] focus:outline-none"
              />
              <kbd className="px-1.5 py-0.5 text-[10px] rounded border border-[var(--color-border)] text-[var(--color-text-tertiary)]">ESC</kbd>
            </div>

            <div className="max-h-80 overflow-y-auto p-2">
              {filtered.length === 0 ? (
                <p className="py-8 text-center text-sm text-[var(--color-text-tertiary)]">{t('palette.noResults')}</p>
              ) : (
                filtered.map((item, i) => (
                  <div
                    key={item.id}
                    onMouseEnter={() => setSelected(i)}
                    onClick={() => run(item)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                      selected === i ? 'bg-[var(--color-accent-bg)]' : ''
                    }`}
                  >
                    <span className="text-[var(--color-text-secondary)]">{item.icon}</span>
                    <span className={`flex-1 text-sm truncate ${selected === i ? 'text-[var(--color-accent)] font-medium' : 'text-[var(--color-text)]'}`}>
                      {item.label}
                    </span>
                    {item.hint && (
                      <span className="text-xs text-[var(--color-text-tertiary)] truncate max-w-[180px]">{item.hint}</span>
                    )}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
