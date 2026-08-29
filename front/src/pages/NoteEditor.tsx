import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ArrowLeft, Save, Trash2, Download, Link2, ListTree, FileText, Users, GraduationCap, BookOpen, ListTodo, BookMarked, Plus, GripVertical, Share2, GitBranch, ExternalLink, X, FileCode2, Printer } from 'lucide-react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { marked } from 'marked'
import TiptapEditor, { type TiptapEditorHandle } from '../components/TiptapEditor'
import TagInput from '../components/common/TagInput'
import RelatedFragments from '../components/note/RelatedFragments'
import BacklinksPanel from '../components/note/BacklinksPanel'
import OutlinePanel from '../components/note/OutlinePanel'
import NoteCardModal from '../components/note/NoteCardModal'
import TemplatePreview from '../components/note/TemplatePreview'
import { notesApi } from '../api/notes'
import { noteTemplatesApi } from '../api/noteTemplates'
import type { Note, NoteTemplate } from '../types/api'
import ConfirmDialog from '../components/common/ConfirmDialog'
import { usePetStore } from '../stores/usePetStore'

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  FileText, Users, GraduationCap, BookOpen, ListTodo, BookMarked,
}

const CATEGORY_LABEL_MAP: Record<string, string> = {
  work: '工作', study: '学习', life: '生活', project: '技术', other: '其他',
}

const CATEGORIES = [
  { label: '工作', value: 'work' },
  { label: '学习', value: 'study' },
  { label: '生活', value: 'life' },
  { label: '技术', value: 'project' },
  { label: '其他', value: 'other' },
]
const DRAFT_KEY = 'note_draft'

interface Draft {
  title: string
  content: string
  tags?: string[]
  category?: string
}

function draftField<T>(id: string | undefined, key: keyof Draft, fallback: T): T {
  if (id && id !== 'new') return fallback
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return fallback
    return (JSON.parse(raw)?.[key] ?? fallback) as T
  } catch {
    return fallback
  }
}

export default function NoteEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [title, setTitle] = useState(() => draftField<string>(id, 'title', ''))
  const [content, setContent] = useState(() => draftField<string>(id, 'content', ''))
  const [category, setCategory] = useState(() => draftField<string>(id, 'category', ''))
  const [tags, setTags] = useState<string[]>(() => draftField<string[]>(id, 'tags', []))
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'unsaved' | 'saved'>('unsaved')
  const [showDelete, setShowDelete] = useState(false)
  const [templateDeleteTarget, setTemplateDeleteTarget] = useState<NoteTemplate | null>(null)
  const [showRelated, setShowRelated] = useState(false)
  const [showOutline, setShowOutline] = useState(false)
  const [showCard, setShowCard] = useState(false)
  const [showBacklinks, setShowBacklinks] = useState(false)
  const [isPublic, setIsPublic] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [showTemplateManager, setShowTemplateManager] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [editingTemplate, setEditingTemplate] = useState<NoteTemplate | null>(null)
  const [showNewTemplateForm, setShowNewTemplateForm] = useState(false)
  const [showSaveAsTemplate, setShowSaveAsTemplate] = useState(false)
  const [templates, setTemplates] = useState<NoteTemplate[]>([])
  const [templateItems, setTemplateItems] = useState<NoteTemplate[]>([])
  const [editForm, setEditForm] = useState({ name: '', title: '', content: '', category: '', tags: '' })
  const [newTemplateForm, setNewTemplateForm] = useState({ name: '', title: '', content: '', category: '', tags: '' })
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const templateApplied = useRef(false)
  const editorRef = useRef<TiptapEditorHandle>(null)
  const dragItem = useRef<number | null>(null)
  const isNew = !id || id === 'new'

  const loadTemplateOrder = (): string[] => {
    try {
      const raw = localStorage.getItem('template_order')
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  }
  const saveTemplateOrder = (ids: string[]) => {
    localStorage.setItem('template_order', JSON.stringify(ids))
  }

  useEffect(() => {
    if (isNew) {
      // 异步回调中置位（避免 set-state-in-effect 规则报错）
      const timer = window.setTimeout(() => {
        setShowTemplatePicker(true)
        setLoading(false)
      }, 0)
      return () => window.clearTimeout(timer)
    }
    let cancelled = false
    notesApi.get(id).then((res) => {
      if (cancelled) return
      const note = res.data as Note
      setTitle(note.title)
      setContent(note.content)
      setCategory(note.category || '')
      setTags(note.tags || [])
      setIsPublic(!!note.is_public)
      setLoadFailed(false)
      setLoading(false)
    }).catch(() => {
      if (!cancelled) {
        // 笔记不存在 / 他人私有笔记（用户隔离 404）：显示错误页而非空白编辑器
        setLoadFailed(true)
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [id, isNew])

  const autoSave = useCallback(() => {
    if (isNew) {
      const draft: Draft = { title, content, tags, category }
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
      setSaveStatus('saved')
    }
  }, [title, content, tags, category, isNew])

  useEffect(() => {
    const timer = setTimeout(autoSave, 2000)
    return () => clearTimeout(timer)
  }, [autoSave])

  const handleSave = async () => {
    if (!title.trim() && !content.trim()) return
    setSaving(true)
    try {
      if (isNew) {
        const res = await notesApi.create({ title, content, category: category || undefined, tags })
        localStorage.removeItem(DRAFT_KEY)
        navigate(`/notes/${(res.data as Note).id}`, { replace: true })
      } else if (id) {
        await notesApi.update(id, { title, content, category, tags })
        toast.success('保存成功')
      }
      // 页宠联动：保存笔记成功
      usePetStore.getState().trigger('note_saved')
    } catch {
      toast.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!id) return
    try {
      await notesApi.delete(id)
      navigate('/notes')
    } catch {
      toast.error('删除失败')
    }
  }

  const handleDownload = async () => {
    if (!id) return
    try {
      const blob = await notesApi.download(id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${(title || 'note').replace(/[\\/:*?"<>|]/g, '_')}.md`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('下载失败')
    }
  }

  // ── 公开分享（方向 A）──
  const shareUrl = id ? `${window.location.origin}/share/${id}` : ''

  const handleMakePublic = async () => {
    if (!id) return
    setSharing(true)
    try {
      const res = await notesApi.update(id, { is_public: true })
      setIsPublic(!!(res.data as Note | undefined)?.is_public)
      toast.success(t('share.publicOn'))
    } catch {
      toast.error(t('common.error'))
    } finally {
      setSharing(false)
    }
  }

  const handleClosePublic = async () => {
    if (!id) return
    setSharing(true)
    try {
      await notesApi.update(id, { is_public: false })
      setIsPublic(false)
      toast.success(t('share.publicOff'))
    } catch {
      toast.error(t('common.error'))
    } finally {
      setSharing(false)
    }
  }

  const handleCopyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      toast.success(t('share.copied'))
    } catch {
      toast.error(t('share.copyFailed'))
    }
  }

  // ── 导出 HTML / 打印 PDF（备选方向）──
  const buildHtmlDoc = () => {
    const body = String(marked.parse(content || ''))
    const safeTitle = (title || '无标题').replace(/</g, '&lt;')
    const exportTime = new Date().toLocaleString('zh-CN', { dateStyle: 'long', timeStyle: 'short' })
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${safeTitle}</title>
<style>
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: -apple-system, "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif;
    max-width: 780px; margin: 44px auto; padding: 0 28px;
    color: #1f2328; font-size: 15.5px; line-height: 1.9;
    -webkit-font-smoothing: antialiased;
  }
  h1 { font-size: 30px; font-weight: 700; line-height: 1.35; margin: 0 0 6px; letter-spacing: .5px; }
  .meta { color: #8a8f98; font-size: 12.5px; padding-bottom: 18px; margin-bottom: 30px; border-bottom: 1px solid #e8eaed; }
  h2 { font-size: 22px; font-weight: 650; margin: 34px 0 12px; padding-bottom: 6px; border-bottom: 1px solid #f0f1f3; }
  h3 { font-size: 18px; font-weight: 650; margin: 26px 0 10px; }
  h4 { font-size: 16px; font-weight: 650; margin: 22px 0 8px; }
  p { margin: 12px 0; }
  a { color: #2563eb; text-decoration: none; }
  a:hover { text-decoration: underline; }
  img { max-width: 100%; height: auto; display: block; margin: 10px auto; border-radius: 8px; }
  pre {
    background: #f6f8fa; border: 1px solid #eceff3; border-radius: 10px;
    padding: 14px 16px; overflow-x: auto; font-size: 13px; line-height: 1.7;
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  }
  code {
    background: #f2f4f7; padding: 2px 6px; border-radius: 5px; font-size: .88em;
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  }
  pre code { background: none; padding: 0; border-radius: 0; font-size: 13px; }
  blockquote {
    margin: 14px 0; padding: 6px 18px; border-left: 4px solid #c7d2fe;
    color: #57606a; background: #fafbff; border-radius: 0 8px 8px 0;
  }
  table { border-collapse: collapse; width: 100%; margin: 16px 0; font-size: 14px; }
  th, td { border: 1px solid #dfe3e8; padding: 8px 12px; text-align: left; vertical-align: top; }
  th { background: #f6f8fa; font-weight: 600; }
  tbody tr:nth-child(even) td { background: #fafbfc; }
  ul, ol { padding-left: 24px; margin: 12px 0; }
  li { margin: 5px 0; }
  li::marker { color: #6b7280; }
  hr { border: none; border-top: 1px solid #e8eaed; margin: 28px 0; }
  .footer {
    margin-top: 42px; padding-top: 14px; border-top: 1px solid #e8eaed;
    color: #9aa0a8; font-size: 12px;
    display: flex; justify-content: space-between; gap: 16px;
  }
  /* ── 打印优化：A4 版式 + 分页保护 + 页码页脚 ── */
  @page { size: A4; margin: 16mm 15mm; }
  @media print {
    body { max-width: none; margin: 0; padding: 0; font-size: 12pt; line-height: 1.85; }
    h1 { font-size: 20pt; }
    h2 { font-size: 15pt; }
    h3 { font-size: 12.5pt; }
    h4 { font-size: 11.5pt; }
    pre, table, img, blockquote, .footer { break-inside: avoid; }
    h1, h2, h3, h4 { break-after: avoid; page-break-after: avoid; }
    a { color: inherit; text-decoration: none; }
    body { padding-bottom: 18mm; }
    .footer { position: fixed; bottom: 0; left: 0; right: 0; margin: 0; border-top: 1px solid #e8eaed; }
    .footer .page-num::before { content: "第 " counter(page) " 页"; }
  }
</style>
</head>
<body>
<h1>${safeTitle}</h1>
<div class="meta">由 云舒卷 · RAG Notebook 导出 · ${exportTime}</div>
${body}
<div class="footer"><span>由 云舒卷 · RAG Notebook 导出</span><span class="page-num"></span></div>
</body>
</html>`
  }

  const handleExportHtml = () => {
    const blob = new Blob([buildHtmlDoc()], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(title || 'note').replace(/[\\/:*?"<>|]/g, '_')}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handlePrintPdf = () => {
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(buildHtmlDoc())
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 300)
  }

  const applyTemplate = (tpl: NoteTemplate) => {
    setTitle(tpl.title)
    setContent(tpl.content)
    setCategory(tpl.category || '')
    setTags(tpl.tags || [])
    setShowTemplatePicker(false)
    templateApplied.current = true
  }

  const handleSaveAsTemplate = async () => {
    if (!templateName.trim()) return
    try {
      await noteTemplatesApi.create({
        name: templateName.trim(),
        category,
        title,
        content,
        tags,
      })
      toast.success('模板已保存')
      setShowSaveAsTemplate(false)
      setTemplateName('')
      refreshTemplates()
    } catch {
      toast.error('保存模板失败')
    }
  }

  const refreshTemplates = useCallback(() => {
    noteTemplatesApi.list().then((res) => {
      const list = (res.data as NoteTemplate[]) || []
      setTemplates(list)
      const order = loadTemplateOrder()
      if (order) {
        const map = new Map(list.map((t) => [t.id, t]))
        const ordered = order.map((id) => map.get(id)).filter(Boolean) as NoteTemplate[]
        const rest = list.filter((t) => !order.includes(t.id))
        setTemplateItems([...ordered, ...rest])
      } else {
        setTemplateItems(list)
      }
    }).catch(() => {})
  }, [])

  const startEditTemplate = (tpl: NoteTemplate) => {
    setEditingTemplate(tpl)
    setEditForm({
      name: tpl.name,
      title: tpl.title,
      content: tpl.content,
      category: tpl.category || '',
      tags: (tpl.tags || []).join(', '),
    })
  }

  const handleUpdateTemplate = async () => {
    if (!editingTemplate) return
    try {
      await noteTemplatesApi.update(editingTemplate.id, {
        name: editForm.name,
        title: editForm.title,
        content: editForm.content,
        category: editForm.category,
        tags: editForm.tags.split(',').map((t) => t.trim()).filter(Boolean),
      })
      toast.success('模板已更新')
      setEditingTemplate(null)
      refreshTemplates()
    } catch {
      toast.error('更新失败')
    }
  }

  const handleDeleteTemplate = async (tpl: NoteTemplate) => {
    if (tpl.is_default) return
    try {
      await noteTemplatesApi.delete(tpl.id)
      toast.success('已删除')
      refreshTemplates()
    } catch {
      toast.error('删除失败')
    }
  }

  const handleTemplateDragStart = (index: number) => {
    dragItem.current = index
  }

  const handleTemplateDragOver = (index: number) => {
    setDragOverIndex(index)
  }

  const handleTemplateDrop = async () => {
    const from = dragItem.current
    dragItem.current = null
    setDragOverIndex(null)
    if (from === null) return
    const reordered = [...templateItems]
    const [moved] = reordered.splice(from, 1)
    if (!moved) return
    reordered.splice(dragOverIndex ?? reordered.length, 0, moved)
    setTemplateItems(reordered)
    const ids = reordered.map((t) => t.id)
    saveTemplateOrder(ids)
    try {
      await noteTemplatesApi.reorder(ids)
    } catch {
      toast.error('排序保存失败')
    }
  }

  const handleCreateTemplate = async () => {
    if (!newTemplateForm.name.trim()) return
    try {
      await noteTemplatesApi.create({
        name: newTemplateForm.name.trim(),
        title: newTemplateForm.title,
        content: newTemplateForm.content,
        category: newTemplateForm.category,
        tags: newTemplateForm.tags.split(',').map((t) => t.trim()).filter(Boolean),
      })
      toast.success('模板已创建')
      setShowNewTemplateForm(false)
      setNewTemplateForm({ name: '', title: '', content: '', category: '', tags: '' })
      refreshTemplates()
    } catch {
      toast.error('创建失败')
    }
  }

  const handleSaveRef = useRef(handleSave)
  // ref 同步移入 effect（渲染期写 ref 违反 react-hooks/refs 规则）
  useEffect(() => {
    handleSaveRef.current = handleSave
  })

  useEffect(() => {
    if (showTemplatePicker) {
      refreshTemplates()
    }
  }, [showTemplatePicker, refreshTemplates])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSaveRef.current()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  if (loadFailed) {
    return (
      <div className="note-authoring-page h-full flex flex-col items-center justify-center gap-3 bg-[var(--color-bg)] text-center px-6">
        <FileText size={34} className="text-[var(--color-text-tertiary)]" />
        <p className="text-base font-medium text-[var(--color-text)]">{t('note.notFound')}</p>
        <p className="text-sm text-[var(--color-text-tertiary)] max-w-sm">{t('note.notFoundHint')}</p>
        <button onClick={() => navigate('/notes')} className="secondary-button mt-2">
          {t('note.notFoundBack')}
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-5 h-5 border-2 border-[var(--color-border)] border-t-[var(--color-accent)] rounded-full animate-spin" />
      </div>
    )
  }

  if (showTemplatePicker) {
    return (
      <div className="note-authoring-page note-template-picker h-full flex flex-col bg-[var(--color-bg)]">
        <header className="note-authoring-topbar note-template-picker-topbar flex items-center flex-shrink-0 h-11 px-6 border-b border-[var(--color-border-light)]">
          <button
            onClick={() => navigate('/notes')}
            className="note-authoring-back flex items-center justify-center w-8 h-8 text-[var(--color-text-tertiary)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-secondary)] rounded-lg transition-colors"
            aria-label="返回笔记列表"
          >
            <ArrowLeft size={18} />
          </button>
          <span className="note-template-picker-title ml-3 text-sm font-medium text-[var(--color-text)]">选择笔记模板</span>
          <button
            onClick={() => setShowTemplateManager(true)}
            className="note-template-manage secondary-button"
          >
            管理模板
          </button>
        </header>
        <div className="note-template-content flex-1 overflow-auto p-8">
          <div className="note-template-grid max-w-2xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-4">
            {templates?.map((tpl) => {
              const Icon = ICON_MAP[tpl.icon] || FileText
              return (
                <button
                  key={tpl.id}
                  aria-label={`使用模板：${tpl.name}`}
                  onClick={() => applyTemplate(tpl)}
                  className="note-template-card flex min-w-0 flex-col items-start p-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] hover:border-[var(--color-accent)] hover:shadow-sm transition-all text-left group"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="note-template-card-icon w-9 h-9 rounded-lg bg-[var(--color-bg-secondary)] flex items-center justify-center text-[var(--color-text-secondary)] group-hover:text-[var(--color-accent)] group-hover:bg-[var(--color-accent-bg)] transition-colors">
                      <Icon size={18} />
                    </div>
                    <span className="note-template-card-name text-sm font-medium text-[var(--color-text)]">{tpl.name}</span>
                  </div>
                  {tpl.category && (
                    <span className="note-template-card-category text-xs text-[var(--color-text-tertiary)]">{CATEGORY_LABEL_MAP[tpl.category] || tpl.category}</span>
                  )}
                  {tpl.content && (
                    <TemplatePreview content={tpl.content} />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {showTemplateManager && (
          <>
            <div className="note-authoring-backdrop fixed inset-0 bg-black/40 z-50" onClick={() => { setShowTemplateManager(false); setEditingTemplate(null); setShowNewTemplateForm(false) }} />
            <div className="note-authoring-dialog note-template-manager fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-[var(--color-card)] rounded-lg shadow-xl w-[600px] max-w-[90vw] max-h-[80vh] flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
                <h3 className="text-base font-medium text-[var(--color-text)]">管理模板</h3>
                <div className="flex items-center gap-2">
                  {!editingTemplate && !showNewTemplateForm && (
                    <button
                      onClick={() => { setShowNewTemplateForm(true); setEditingTemplate(null) }}
                      className="px-3 py-1 text-xs rounded-md bg-[var(--color-accent)] text-[var(--color-accent-foreground)] hover:opacity-90"
                    >
                      + 新建模板
                    </button>
                  )}
                  <button onClick={() => { setShowTemplateManager(false); setEditingTemplate(null); setShowNewTemplateForm(false) }} className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text)]">✕</button>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-6">
                {showNewTemplateForm ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setShowNewTemplateForm(false)} className="p-1 rounded text-[var(--color-text-tertiary)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-secondary)]">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
                      </button>
                      <h4 className="text-sm font-medium text-[var(--color-text)]">新建模板</h4>
                    </div>
                    <div>
                      <label className="text-xs text-[var(--color-text-secondary)] mb-1 block">名称 *</label>
                      <input type="text" value={newTemplateForm.name} onChange={(e) => setNewTemplateForm((f) => ({ ...f, name: e.target.value }))} placeholder="模板名称" className="w-full px-3 py-2 text-sm rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text)] placeholder:text-[var(--color-text-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]" />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--color-text-secondary)] mb-1 block">默认标题</label>
                      <input type="text" value={newTemplateForm.title} onChange={(e) => setNewTemplateForm((f) => ({ ...f, title: e.target.value }))} placeholder="笔记默认标题" className="w-full px-3 py-2 text-sm rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text)] placeholder:text-[var(--color-text-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]" />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--color-text-secondary)] mb-1 block">分类</label>
                      <select value={newTemplateForm.category} onChange={(e) => setNewTemplateForm((f) => ({ ...f, category: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]">
                        <option value="">无</option>
                        <option value="work">工作</option>
                        <option value="study">学习</option>
                        <option value="life">生活</option>
                        <option value="project">技术</option>
                        <option value="other">其他</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-[var(--color-text-secondary)] mb-1 block">标签（逗号分隔）</label>
                      <input type="text" value={newTemplateForm.tags} onChange={(e) => setNewTemplateForm((f) => ({ ...f, tags: e.target.value }))} placeholder="标签1, 标签2" className="w-full px-3 py-2 text-sm rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text)] placeholder:text-[var(--color-text-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]" />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--color-text-secondary)] mb-1 block">默认内容（Markdown）</label>
                      <textarea value={newTemplateForm.content} onChange={(e) => setNewTemplateForm((f) => ({ ...f, content: e.target.value }))} rows={10} placeholder={"## 标题\n\n内容..."} className="w-full px-3 py-2 text-sm rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text)] font-mono placeholder:text-[var(--color-text-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] resize-y" />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <button onClick={() => setShowNewTemplateForm(false)} className="secondary-button">返回</button>
                      <button onClick={handleCreateTemplate} disabled={!newTemplateForm.name.trim()} className="primary-button">创建模板</button>
                    </div>
                  </div>
                ) : editingTemplate ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setEditingTemplate(null)} className="p-1 rounded text-[var(--color-text-tertiary)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-secondary)]">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
                      </button>
                      <h4 className="text-sm font-medium text-[var(--color-text)]">编辑模板</h4>
                    </div>
                    <div>
                      <label className="text-xs text-[var(--color-text-secondary)] mb-1 block">名称</label>
                      <input type="text" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]" />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--color-text-secondary)] mb-1 block">默认标题</label>
                      <input type="text" value={editForm.title} onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]" />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--color-text-secondary)] mb-1 block">分类</label>
                      <select value={editForm.category} onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]">
                        <option value="">无</option>
                        <option value="work">工作</option>
                        <option value="study">学习</option>
                        <option value="life">生活</option>
                        <option value="project">技术</option>
                        <option value="other">其他</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-[var(--color-text-secondary)] mb-1 block">标签（逗号分隔）</label>
                      <input type="text" value={editForm.tags} onChange={(e) => setEditForm((f) => ({ ...f, tags: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]" />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--color-text-secondary)] mb-1 block">默认内容（Markdown）</label>
                      <textarea value={editForm.content} onChange={(e) => setEditForm((f) => ({ ...f, content: e.target.value }))} rows={10} className="w-full px-3 py-2 text-sm rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text)] font-mono focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] resize-y" />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <button onClick={() => setEditingTemplate(null)} className="secondary-button">返回</button>
                      <button onClick={handleUpdateTemplate} className="px-4 py-1.5 text-sm rounded-md bg-[var(--color-accent)] text-[var(--color-accent-foreground)]">保存修改</button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {templateItems.length === 0 && (
                      <p className="text-sm text-[var(--color-text-tertiary)] text-center py-8">暂无模板</p>
                    )}
                    {templateItems.map((tpl, index) => (
                      <div
                        key={tpl.id}
                        draggable
                        onDragStart={() => handleTemplateDragStart(index)}
                        onDragOver={(e) => { e.preventDefault(); handleTemplateDragOver(index) }}
                        onDrop={(e) => { e.preventDefault(); handleTemplateDrop() }}
                        onDragEnd={() => setDragOverIndex(null)}
                        className={`flex items-center justify-between p-3 rounded-lg border border-[var(--color-border)] transition-colors ${
                          dragOverIndex === index
                            ? 'border-t-2 border-t-[var(--color-accent)] bg-[var(--color-bg-secondary)]'
                            : 'hover:border-[var(--color-accent)]'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <GripVertical size={14} className="text-[var(--color-text-tertiary)] shrink-0 cursor-grab active:cursor-grabbing" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-[var(--color-text)]">{tpl.name}</span>
                              {tpl.is_default && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-bg-secondary)] text-[var(--color-text-tertiary)]">内置</span>
                              )}
                            </div>
                            {tpl.content && (
                              <TemplatePreview content={tpl.content} compact />
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 ml-3">
                          <button onClick={() => startEditTemplate(tpl)} className="px-2 py-1 text-xs rounded text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]">编辑</button>
                          {!tpl.is_default && (
                            <button onClick={() => setTemplateDeleteTarget(tpl)} className="px-2 py-1 text-xs rounded text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)]">删除</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="note-authoring-page note-writing-page h-full flex flex-col bg-[var(--color-bg)]">
      {/* ====== Top bar ====== */}
      <header className="note-authoring-topbar note-writing-topbar flex items-center justify-between flex-shrink-0 h-11 px-6 border-b border-[var(--color-border-light)]">
        <button
          onClick={() => navigate('/notes')}
          className="note-authoring-back flex items-center justify-center w-8 h-8 text-[var(--color-text-tertiary)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-secondary)] rounded-lg transition-colors"
          title="返回"
        >
          <ArrowLeft size={18} />
        </button>

        {isNew && saveStatus === 'saved' && (
          <span className="text-xs text-[var(--color-text-tertiary)] ml-3 select-none">草稿已保存</span>
        )}

        <div className="note-writing-actions flex items-center gap-1">
          <button
            onClick={() => setShowOutline((v) => !v)}
            className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
              showOutline
                ? 'text-[var(--color-accent)] bg-[var(--color-accent-bg)]'
                : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-secondary)]'
            }`}
            title="目录"
          >
            <ListTree size={16} />
          </button>
          <span className="w-px h-5 bg-[var(--color-border-light)] mx-0.5" />
          {!isNew && (
            <button
              onClick={() => setShowRelated((v) => !v)}
              className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
                showRelated
                  ? 'text-[var(--color-accent)] bg-[var(--color-accent-bg)]'
                  : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-secondary)]'
              }`}
              title="关联片段"
            >
              <Link2 size={16} />
            </button>
          )}
          {!isNew && (
            <button
              onClick={() => setShowBacklinks((v) => !v)}
              className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
                showBacklinks
                  ? 'text-[var(--color-accent)] bg-[var(--color-accent-bg)]'
                  : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-secondary)]'
              }`}
              title={t('backlinks.title')}
            >
              <GitBranch size={16} />
            </button>
          )}
          {!isNew && (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  className="flex items-center justify-center w-8 h-8 text-[var(--color-text-tertiary)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-secondary)] rounded-lg transition-colors"
                  title={t('note.export')}
                >
                  <Download size={16} />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content className="workspace-menu" sideOffset={6} align="end" collisionPadding={12}>
                  <DropdownMenu.Item className="workspace-menu-item" onSelect={() => void handleDownload()}><FileText size={15} />{t('note.download')}</DropdownMenu.Item>
                  <DropdownMenu.Item className="workspace-menu-item" onSelect={handleExportHtml}><FileCode2 size={15} />{t('note.exportHtml')}</DropdownMenu.Item>
                  <DropdownMenu.Separator className="workspace-menu-separator" />
                  <DropdownMenu.Item className="workspace-menu-item" onSelect={handlePrintPdf}><Printer size={15} />{t('note.printPdf')}</DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          )}
          {!isNew && (
            <button
              onClick={() => setShowCard(true)}
              className="flex items-center justify-center w-8 h-8 text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent-bg)] rounded-lg transition-colors"
              title={t('card.generate')}
            >
              <Share2 size={16} />
            </button>
          )}
          {!isNew && (
            <button
              onClick={() => setShareOpen(true)}
              className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
                isPublic
                  ? 'text-[var(--color-accent)] bg-[var(--color-accent-bg)]'
                  : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent-bg)]'
              }`}
              title={isPublic ? t('share.publicHint') : t('share.privateHint')}
            >
              <ExternalLink size={16} />
            </button>
          )}
          {!isNew && (
            <button
              onClick={() => setShowDelete(true)}
              className="flex items-center justify-center w-8 h-8 text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] rounded-lg transition-colors"
              title={t('note.delete')}
            >
              <Trash2 size={16} />
            </button>
          )}
          {!isNew && (
            <button
              onClick={() => setShowSaveAsTemplate(true)}
              className="flex items-center justify-center w-8 h-8 text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent-bg)] rounded-lg transition-colors"
              title="存为模板"
            >
              <Plus size={16} />
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="note-writing-save primary-button"
          >
            <Save size={15} />
            {saving ? '保存中' : t('note.save')}
          </button>
        </div>
      </header>

      <div className="note-writing-body flex-1 flex min-h-0">
        <OutlinePanel
          content={content}
          open={showOutline}
          onClose={() => setShowOutline(false)}
          onHeadingClick={(text, level) => editorRef.current?.scrollToHeading(text, level)}
        />
        <div className="note-writing-document flex flex-col flex-1 min-w-0">
          {/* ====== Title ====== */}
          <div className="note-writing-title flex-shrink-0 px-10 pt-10 pb-4">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="未命名笔记"
              className="note-writing-title-input w-full text-[30px] font-bold font-heading leading-tight tracking-tight text-[var(--color-text)] bg-transparent border-none outline-none placeholder:text-[var(--color-text-placeholder)]"
            />
          </div>

          {/* ====== Category pills + Tags ====== */}
          <div className="note-writing-meta flex-shrink-0 px-10 pb-6">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="note-writing-categories flex items-center gap-1">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.value}
                    onClick={() => setCategory(category === cat.value ? '' : cat.value)}
                    className={`note-writing-category px-3 py-1 text-xs rounded-full font-medium transition-all ${
                      category === cat.value
                        ? 'is-active bg-[var(--color-accent)] text-[var(--color-accent-foreground)] shadow-sm'
                        : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text)]'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
              <div className="note-writing-tags flex-1 min-w-[180px]">
                <TagInput tags={tags} onChange={setTags} placeholder="添加标签..." />
              </div>
            </div>
          </div>

          {/* ====== Crepe WYSIWYG Editor ====== */}
          <div className="note-writing-editor flex-1 min-h-0">
            <TiptapEditor
              ref={editorRef}
              key={id || 'new'}
              value={content}
              onChange={setContent}
              placeholder="开始写作..."
              onAutocomplete={async (context) => {
                try {
                  const res = await notesApi.autocomplete(context)
                  return (res.data as { completion?: string })?.completion || null
                } catch {
                  return null
                }
              }}
            />
          </div>
        </div>

        {id && (
          <RelatedFragments
            noteId={id}
            open={showRelated}
            onClose={() => setShowRelated(false)}
          />
        )}
        {id && (
          <BacklinksPanel
            noteId={id}
            open={showBacklinks}
            onClose={() => setShowBacklinks(false)}
          />
        )}
      </div>

      <NoteCardModal
        open={showCard}
        onOpenChange={setShowCard}
        title={title}
        content={content}
        tags={tags}
      />

      {/* 公开分享弹窗 */}
      {shareOpen && (
        <>
          <div className="note-authoring-backdrop fixed inset-0 bg-black/40 z-50" onClick={() => !sharing && setShareOpen(false)} />
          <div className="note-authoring-dialog note-share-dialog fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-[var(--color-card)] rounded-lg shadow-xl p-6 w-[480px] max-w-[90vw] border border-[var(--color-border)]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-medium text-[var(--color-text)] flex items-center gap-2">
                <ExternalLink size={16} className="text-[var(--color-accent)]" />
                {t('share.title')}
              </h3>
              <button
                onClick={() => setShareOpen(false)}
                disabled={sharing}
                className="workspace-icon-button"
              >
                <X size={16} />
              </button>
            </div>

            {isPublic ? (
              <>
                <p className="text-xs text-[var(--color-accent)] mb-3">{t('share.publicHint')}</p>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={shareUrl}
                    onFocus={(e) => e.target.select()}
                    className="flex-1 px-3 py-2 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  />
                  <button
                    onClick={handleCopyShareLink}
                    className="px-3 h-9 text-sm rounded-md bg-[var(--color-accent)] text-[var(--color-accent-foreground)] hover:opacity-90 transition-opacity shrink-0"
                  >
                    {t('share.copyLink')}
                  </button>
                </div>
                <div className="flex justify-end mt-4">
                  <button
                    onClick={handleClosePublic}
                    disabled={sharing}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-[var(--color-border)] text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] disabled:opacity-50"
                  >
                    {t('share.closePublic')}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-[var(--color-text-secondary)] mb-2">{t('share.confirmPublic')}</p>
                <p className="text-xs text-[var(--color-text-tertiary)] mb-4">{t('share.privateHint')}</p>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setShareOpen(false)}
                    className="secondary-button"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={handleMakePublic}
                    disabled={sharing}
                    className="primary-button"
                  >
                    {sharing && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                    {t('share.makePublic')}
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        open={showDelete}
        onOpenChange={setShowDelete}
        title={t('note.delete')}
        message={t('note.deleteConfirm')}
        variant="danger"
        confirmText={t('note.delete')}
        onConfirm={handleDelete}
      />

      <ConfirmDialog
        open={!!templateDeleteTarget}
        onOpenChange={() => setTemplateDeleteTarget(null)}
        title="删除模板"
        message={`确定要删除模板「${templateDeleteTarget?.title ?? ''}」吗？此操作不可恢复。`}
        variant="danger"
        confirmText="删除"
        onConfirm={() => {
          if (templateDeleteTarget) handleDeleteTemplate(templateDeleteTarget)
        }}
      />

      {showSaveAsTemplate && (
        <>
          <div className="note-authoring-backdrop fixed inset-0 bg-black/40 z-50" onClick={() => setShowSaveAsTemplate(false)} />
          <div className="note-authoring-dialog note-save-template-dialog fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-[var(--color-card)] rounded-lg shadow-xl p-6 w-[400px] max-w-[90vw]">
            <h3 className="text-base font-medium text-[var(--color-text)] mb-4">保存为模板</h3>
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="输入模板名称"
              className="w-full px-3 py-2 text-sm rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text)] placeholder:text-[var(--color-text-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveAsTemplate() }}
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowSaveAsTemplate(false)}
                className="secondary-button"
              >
                取消
              </button>
              <button
                onClick={handleSaveAsTemplate}
                disabled={!templateName.trim()}
                className="primary-button"
              >
                保存
              </button>
            </div>
          </div>
        </>
      )}

    </div>
  )
}
