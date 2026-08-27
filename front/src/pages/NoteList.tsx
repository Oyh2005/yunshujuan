import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import * as Dialog from '@radix-ui/react-dialog'
import { AlertCircle, CheckSquare, ChevronDown, FileText, LayoutGrid, List, LoaderCircle, PenLine, Plus, Search, Settings2, Sparkles, X } from 'lucide-react'
import { toast } from 'sonner'
import { notesApi } from '../api/notes'
import type { Note } from '../types/api'
import ConfirmDialog from '../components/common/ConfirmDialog'
import BatchActionBar from '../components/note/BatchActionBar'
import CategoryManageDialog from '../components/note/CategoryManageDialog'
import NoteCard from '../components/note/NoteCard'
import { predefinedCategories, sortNotes, type NoteSort, type NoteView } from '../components/note/notePresentation'
import { useDebounce } from '../hooks/useDebounce'

const PAGE_SIZE = 20
const VIEW_KEY = 'note_list_view'
const CATEGORY_ORDER_KEY = 'note_category_order'

function initialView(): NoteView {
  try { return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid' } catch { return 'grid' }
}

function orderedCategories(custom: string[]): string[] {
  const categories = [...new Set<string>([...predefinedCategories, ...custom.filter(Boolean)])]
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(CATEGORY_ORDER_KEY) || '[]')
    if (!Array.isArray(saved)) return categories
    const order = saved.filter((item): item is string => typeof item === 'string')
    return categories.sort((a, b) => {
      const ai = order.indexOf(a), bi = order.indexOf(b)
      return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi)
    })
  } catch { return categories }
}

export default function NoteList() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [notes, setNotes] = useState<Note[]>([])
  const [total, setTotal] = useState(0)
  const [category, setCategory] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const query = useDebounce(searchQuery.trim(), 300)
  const [sortBy, setSortBy] = useState<NoteSort>('updated_at')
  const [view, setView] = useState<NoteView>(initialView)
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const pageRef = useRef(0)
  const requestRef = useRef(0)
  const inFlight = useRef(false)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const statsRequest = useRef(0)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [pinPending, setPinPending] = useState<Set<string>>(new Set())
  const pinRequests = useRef(new Set<string>())
  const [busy, setBusy] = useState(false)
  const batchInFlight = useRef(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [categoryModalOpen, setCategoryModalOpen] = useState(false)
  const [customCategory, setCustomCategory] = useState('')
  const [manageOpen, setManageOpen] = useState(false)
  const [extraCategories, setExtraCategories] = useState<string[]>([])
  const [allCategories, setAllCategories] = useState<string[]>(() => [...predefinedCategories])
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({})

  const categoryLabel = (value: string) => predefinedCategories.some((item) => item === value)
    ? t('note.ui.categories.' + value) : value

  const exitSelectMode = () => {
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  const loadNotes = useCallback(async (pageNum: number, reset = false) => {
    if (!reset && inFlight.current) return false
    const request = reset ? ++requestRef.current : requestRef.current
    inFlight.current = true
    setLoading(true)
    setLoadError(false)
    if (reset) {
      setNotes([])
      setTotal(0)
      setSelectedIds(new Set())
      setSelectMode(false)
      setHasMore(false)
      pageRef.current = 0
    }
    try {
      const result = query
        ? await notesApi.search(query)
        : await notesApi.list({ page: pageNum, page_size: PAGE_SIZE, category: category || undefined, sort_by: sortBy })
      if (request !== requestRef.current) return false
      let items = result.data?.notes || []
      // Semantic search is unpaginated: retain relevance order, and apply the category locally.
      if (query && category) items = items.filter((note) => note.category === category)
      const count = query ? items.length : (result.data?.total_count || 0)
      setNotes((prev) => {
        if (reset) return items
        const known = new Set(prev.map((note) => note.id))
        return [...prev, ...items.filter((note) => !known.has(note.id))]
      })
      setTotal(count)
      setHasMore(!query && pageNum * PAGE_SIZE < count)
      pageRef.current = pageNum
      return true
    } catch {
      if (request === requestRef.current) setLoadError(true)
      return false
    } finally {
      if (request === requestRef.current) {
        setLoading(false)
        inFlight.current = false
      }
    }
  }, [category, query, sortBy])

  const refreshCategories = useCallback(async () => {
    const request = ++statsRequest.current
    try {
      const res = await notesApi.stats()
      if (request !== statsRequest.current) return
      const categories = res.data?.categories || []
      setCategoryCounts(Object.fromEntries(categories.map((item) => [item.category, item.count])))
      setAllCategories(orderedCategories([...categories.map((item) => item.category), ...extraCategories]))
    } catch {
      if (request === statsRequest.current) setAllCategories(orderedCategories(extraCategories))
    }
  }, [extraCategories])

  const invalidateNotes = useCallback(() => { requestRef.current++ }, [])
  const invalidateStats = useCallback(() => { statsRequest.current++ }, [])

  useEffect(() => {
    // Defer startup one task so StrictMode cleanup can cancel duplicate initial requests.
    const start = window.setTimeout(() => { void loadNotes(1, true) }, 0)
    return () => { window.clearTimeout(start); invalidateNotes() }
  }, [loadNotes, invalidateNotes])

  useEffect(() => {
    const start = window.setTimeout(() => { void refreshCategories() }, 0)
    return () => { window.clearTimeout(start); invalidateStats() }
  }, [refreshCategories, invalidateStats])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !hasMore || loading || loadError) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && pageRef.current > 0) void loadNotes(pageRef.current + 1)
    }, { rootMargin: '160px' })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, loading, loadError, loadNotes])

  const changeView = (next: NoteView) => {
    setView(next)
    try { localStorage.setItem(VIEW_KEY, next) } catch { /* View still works without storage. */ }
  }

  const selectNote = (id: string) => {
    setSelectMode(true)
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handlePin = async (note: Note) => {
    if (pinRequests.current.has(note.id)) return
    pinRequests.current.add(note.id)
    setPinPending(new Set(pinRequests.current))
    try {
      const result = await notesApi.pin(note.id)
      setNotes((prev) => {
        const updated = prev.map((item) => item.id === note.id
          ? { ...item, ...result.data, is_pinned: result.data?.is_pinned ?? !item.is_pinned } : item)
        return query ? updated : sortNotes(updated, sortBy)
      })
    } catch { toast.error(t('note.ui.actionError')) } finally {
      pinRequests.current.delete(note.id)
      setPinPending(new Set(pinRequests.current))
    }
  }

  const runBatch = async (action: () => Promise<void>) => {
    if (batchInFlight.current || selectedIds.size === 0) return
    batchInFlight.current = true
    setBusy(true)
    try { await action() } catch { toast.error(t('note.ui.actionError')) } finally {
      batchInFlight.current = false
      setBusy(false)
    }
  }

  const handleBatchPin = () => runBatch(async () => {
    const nextPinned = !notes.filter((note) => selectedIds.has(note.id)).every((note) => note.is_pinned)
    await notesApi.batchPin([...selectedIds], nextPinned)
    setNotes((prev) => {
      const updated = prev.map((note) => selectedIds.has(note.id) ? { ...note, is_pinned: nextPinned } : note)
      return query ? updated : sortNotes(updated, sortBy)
    })
    exitSelectMode()
  })

  const reload = () => { void refreshCategories(); void loadNotes(1, true) }

  const handleBatchDelete = () => runBatch(async () => {
    await notesApi.batchDelete([...selectedIds])
    toast.success(t('note.batch.deleteSuccess'))
    reload()
  })

  const handleBatchDownload = () => runBatch(async () => {
    const blob = await notesApi.batchDownload([...selectedIds])
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'notes_' + new Date().toISOString().slice(0, 10) + '.zip'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    exitSelectMode()
  })

  const handleBatchCategory = (value: string) => runBatch(async () => {
    await notesApi.batchUpdateCategory([...selectedIds], value)
    setCategoryModalOpen(false)
    setCustomCategory('')
    toast.success(t('note.batch.categorySuccess'))
    reload()
  })

  const clearFilters = () => { setSearchQuery(''); setCategory('') }
  const filtered = Boolean(query || category)
  const collectionClass = 'notes-collection' + (view === 'list' ? ' is-list' : '')

  return (
    <section className="notes-page" aria-labelledby="notes-heading">
      <header className="notes-header">
        <div>
          <h1 id="notes-heading" className="notes-title">{t('note.title')}</h1>
          <p className="notes-subtitle" aria-live="polite">
            {selectMode ? t('note.batch.selected', { count: selectedIds.size })
              : loading && notes.length === 0 ? t('note.ui.loading')
              : loadError && notes.length === 0 ? t('note.ui.loadError')
              : t(query ? 'note.ui.searchCount' : 'note.ui.total', { count: total })}
          </p>
        </div>
        <button className="primary-button" onClick={() => navigate('/notes/new')}><Plus size={19} />{t('note.newNote')}</button>
      </header>

      <div className="notes-search-row">
        <div className="notes-search">
          <Search size={19} aria-hidden="true" />
          <input aria-label={t('note.search')} type="text" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder={t('note.search')} />
          {searchQuery && <button className="workspace-icon-button" onClick={() => setSearchQuery('')} aria-label={t('note.ui.clearSearch')}><X size={16} /></button>}
        </div>
        <button className="secondary-button" onClick={() => setManageOpen(true)}><Settings2 size={17} />{t('note.ui.manageCategories')}</button>
      </div>

      <div className="notes-toolbar">
        <div className="notes-categories" role="group" aria-label={t('note.category')}>
          {['', ...allCategories].map((value) => (
            <button key={value} className="notes-filter" aria-pressed={category === value} onClick={() => setCategory(value)}>
              <span>{value ? categoryLabel(value) : t('note.all')}</span>
            </button>
          ))}
        </div>
        <div className="notes-tools">
          <label className="notes-sort">
            <select aria-label={t('note.ui.sortLabel')} value={query ? 'relevance' : sortBy} disabled={Boolean(query)} onChange={(event) => setSortBy(event.target.value as NoteSort)}>
              {query && <option value="relevance">{t('note.ui.relevance')}</option>}
              <option value="updated_at">{t('note.ui.updated')}</option>
              <option value="created_at">{t('note.ui.created')}</option>
              <option value="title">{t('note.ui.titleSort')}</option>
            </select>
            <ChevronDown size={14} aria-hidden="true" />
          </label>
          <div className="notes-view-switch" role="group" aria-label={t('note.ui.viewLabel')}>
            <button className={'workspace-icon-button' + (view === 'grid' ? ' is-active' : '')} onClick={() => changeView('grid')} aria-label={t('note.ui.grid')} title={t('note.ui.grid')} aria-pressed={view === 'grid'}><LayoutGrid size={16} /></button>
            <button className={'workspace-icon-button' + (view === 'list' ? ' is-active' : '')} onClick={() => changeView('list')} aria-label={t('note.ui.list')} title={t('note.ui.list')} aria-pressed={view === 'list'}><List size={17} /></button>
          </div>
          <button className={'workspace-icon-button' + (selectMode ? ' is-active' : '')} disabled={busy || notes.length === 0} onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)} aria-label={t('note.ui.batch')} title={t('note.ui.batch')} aria-pressed={selectMode}><CheckSquare size={18} /></button>
        </div>
      </div>

      {selectMode && <p className="notes-subtitle mb-4">{t('note.ui.selectHint')}</p>}
      {selectMode && selectedIds.size > 0 && <BatchActionBar selectedCount={selectedIds.size} disabled={busy} onDelete={() => setDeleteConfirmOpen(true)} onDownload={handleBatchDownload} onCategory={() => setCategoryModalOpen(true)} onPin={handleBatchPin} onCancel={exitSelectMode} />}

      <div aria-busy={loading}>
        {loadError && <div className="notes-error" role="alert"><AlertCircle size={21} /><p>{t('note.ui.loadError')}</p><button className="secondary-button" onClick={() => void loadNotes(pageRef.current + 1, pageRef.current === 0)}>{t('note.ui.retry')}</button></div>}
        {loading && notes.length === 0 ? (
          <div className={collectionClass} role="status" aria-label={t('note.ui.loading')}>
            {Array.from({ length: 6 }, (_, index) => <div className="note-skeleton" key={index} aria-hidden="true"><div /><div /><div /><div /><div /></div>)}
          </div>
        ) : notes.length === 0 && !loadError ? (
          <div className="notes-empty">
            <div className="notes-empty-art" aria-hidden="true"><div className="notes-empty-halo" /><div className="notes-empty-paper"><FileText size={48} strokeWidth={1.25} /></div><PenLine size={47} className="notes-empty-pen" strokeWidth={1.6} /><Sparkles size={23} className="notes-empty-spark" /></div>
            <h2>{t(filtered ? 'note.ui.noResults' : 'note.empty')}</h2>
            <p>{t(filtered ? 'note.ui.noResultsHint' : 'note.ui.emptyHint')}</p>
            <div className="notes-empty-actions">
              <button className="primary-button" onClick={() => navigate('/notes/new')}><Plus size={18} />{t('note.newNote')}</button>
              {filtered && <button className="secondary-button" onClick={clearFilters}>{t('note.ui.clearFilters')}</button>}
            </div>
          </div>
        ) : (
          <div className={collectionClass}>
            {notes.map((note) => <NoteCard key={note.id} note={note} selected={selectedIds.has(note.id)} selectMode={selectMode} pinPending={busy || pinPending.has(note.id)} onOpen={() => navigate('/notes/' + note.id)} onSelect={() => { if (!busy) selectNote(note.id) }} onPin={() => { if (!busy) void handlePin(note) }} />)}
          </div>
        )}
      </div>
      <div ref={sentinelRef} className="h-1" />
      {notes.length > 0 && <div className="notes-status" role="status">{loading ? <><LoaderCircle size={16} className="animate-spin" />{t('note.ui.loading')}</> : t('note.ui.shown', { count: notes.length, total })}</div>}

      <ConfirmDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen} title={t('note.delete')} message={t('note.batch.deleteConfirm', { count: selectedIds.size })} variant="danger" confirmText={t('note.delete')} cancelText={t('note.batch.cancel')} onConfirm={handleBatchDelete} />

      <Dialog.Root open={categoryModalOpen} onOpenChange={(open) => { setCategoryModalOpen(open); if (!open) setCustomCategory('') }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-[var(--color-card)] text-[var(--color-text)] rounded-2xl shadow-xl p-6 w-[400px] max-w-[90vw]">
            <div className="flex items-center justify-between mb-4"><Dialog.Title className="font-semibold">{t('note.batch.categoryTitle')}</Dialog.Title><Dialog.Close className="workspace-icon-button" aria-label={t('note.batch.cancel')}><X size={17} /></Dialog.Close></div>
            <Dialog.Description className="sr-only">{t('note.batch.selected', { count: selectedIds.size })}</Dialog.Description>
            <div className="flex flex-wrap gap-2 mb-4">{allCategories.map((value) => <button key={value} className="notes-filter" disabled={busy} onClick={() => void handleBatchCategory(value)}><span>{categoryLabel(value)}</span></button>)}</div>
            <form className="flex gap-2 border-t border-[var(--color-border)] pt-4" onSubmit={(event) => { event.preventDefault(); if (customCategory.trim()) void handleBatchCategory(customCategory.trim()) }}>
              <input className="min-w-0 flex-1 px-3 py-2 rounded-xl bg-[var(--color-bg-secondary)] text-sm" aria-label={t('note.batch.categoryCustom')} value={customCategory} onChange={(event) => setCustomCategory(event.target.value)} placeholder={t('note.batch.categoryCustomPlaceholder')} />
              <button type="submit" className="primary-button" disabled={busy || !customCategory.trim()}>{t('common.confirm')}</button>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <CategoryManageDialog open={manageOpen} onOpenChange={setManageOpen} categories={allCategories.map((value) => ({ category: value, count: categoryCounts[value] || 0 }))} onRefresh={() => void refreshCategories()} onCreateCategory={(name) => setExtraCategories((prev) => [...new Set([...prev, name])])} />
    </section>
  )
}
