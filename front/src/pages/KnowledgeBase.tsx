import { useCallback, useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import * as Dialog from '@radix-ui/react-dialog'
import { toast } from 'sonner'
import { Upload, FileText, Trash2, Loader2, CheckCircle2, AlertCircle, Link2, X, Search, Layers3, Clock, ArrowRight } from 'lucide-react'
import { knowledgeApi } from '../api/knowledge'
import { useSSE } from '../hooks/useSSE'
import ConfirmDialog from '../components/common/ConfirmDialog'
import DocumentDetailDrawer from '../components/knowledge/DocumentDetailDrawer'
import KnowledgeLayout, { KnowledgeHeader } from '../components/knowledge/KnowledgeLayout'
import { usePetStore } from '../stores/usePetStore'

interface DocumentSummary { id: string; filename: string; chunk_count: number; created_at?: string | null }
interface UploadFile { file: File; progress: number; status: 'pending' | 'uploading' | 'success' | 'fail'; error?: string }
const extension = (filename: string) => filename.split('.').pop()?.toLowerCase() ?? ''

export default function KnowledgeBase() {
  const { t, i18n } = useTranslation()
  const { start: startSSE, abort, loading: uploading } = useSSE()
  const [docs, setDocs] = useState<DocumentSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<boolean | 'rate'>(false)
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [showClean, setShowClean] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<DocumentSummary | null>(null)
  const [detailFilename, setDetailFilename] = useState<string | null>(null)
  const [clipOpen, setClipOpen] = useState(false)
  const [clipUrl, setClipUrl] = useState('')
  const [clipping, setClipping] = useState(false)
  const [search, setSearch] = useState('')
  const [type, setType] = useState('all')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mounted = useRef(false)
  const uploadBusy = useRef(false)
  const listRequest = useRef(0)

  const loadDocs = useCallback(async () => {
    const request = ++listRequest.current
    setLoading(true)
    setLoadError(false)
    try {
      const res = await knowledgeApi.list()
      if (mounted.current && request === listRequest.current) setDocs(res.data?.documents ?? [])
    } catch (err) {
      if (mounted.current && request === listRequest.current) {
        setLoadError((err as { response?: { status?: number } })?.response?.status === 429 ? 'rate' : true)
      }
    } finally {
      if (mounted.current && request === listRequest.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    const requestVersion = listRequest
    const timer = window.setTimeout(() => void loadDocs(), 0)
    return () => { mounted.current = false; requestVersion.current++; window.clearTimeout(timer); abort() }
  }, [loadDocs, abort])

  const handleClip = async () => {
    if (clipping || !clipUrl.trim()) return
    setClipping(true)
    try {
      const res = await knowledgeApi.clip(clipUrl.trim())
      usePetStore.getState().trigger('doc_uploaded')
      if (!mounted.current) return
      toast.success(t('clip.success', { filename: res.data?.filename ?? '' }))
      setClipOpen(false)
      setClipUrl('')
      void loadDocs()
    } catch {
      if (mounted.current) toast.error(t('clip.failed'))
    } finally {
      if (mounted.current) setClipping(false)
    }
  }

  const handleFilesSelected = async (files: FileList) => {
    if (uploadBusy.current || !files.length) return
    uploadBusy.current = true
    const newFiles: UploadFile[] = Array.from(files).map((file) => ({ file, progress: 0, status: 'pending' }))
    setUploadFiles(newFiles)
    const successful = new Set<string>()
    const formData = new FormData()
    newFiles.forEach(({ file }) => formData.append('files', file))
    try {
      await startSSE('/knowledge/add/multiple/stream', formData, {
        onKnowledgeProgress: (data) => {
          if (!mounted.current) return
          if (data.event_type === 'completed' && data.filename) successful.add(data.filename)
          setUploadFiles((prev) => prev.map((item) => {
            if (item.file.name !== data.filename) return item
            if (data.event_type === 'completed') return { ...item, progress: 100, status: 'success' }
            if (data.event_type === 'error') return { ...item, status: 'fail', error: data.error_message || t('knowledge.fail') }
            if (data.event_type === 'processing') return { ...item, progress: Math.min(100, Math.max(0, data.progress || 0)), status: 'uploading' }
            return item
          }))
        },
        onError: () => {
          if (mounted.current) setUploadFiles((prev) => prev.map((item) => item.status === 'pending' || item.status === 'uploading' ? { ...item, status: 'fail', error: t('knowledge.fail') } : item))
        },
      })
    } finally {
      uploadBusy.current = false
      if (mounted.current) {
        // A dropped stream must not leave files showing "uploading" forever.
        setUploadFiles((prev) => prev.map((item) => item.status === 'pending' || item.status === 'uploading' ? { ...item, status: 'fail', error: t('knowledge.fail') } : item))
        if (successful.size) {
          void loadDocs()
          usePetStore.getState().trigger('doc_uploaded')
        }
      }
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await knowledgeApi.deleteByFilename(deleteTarget.filename)
      listRequest.current++
      setLoading(false)
      setDocs((prev) => prev.filter((doc) => doc.filename !== deleteTarget.filename))
    } catch { toast.error(t('common.error')) }
    setDeleteTarget(null)
  }
  const handleCleanAll = async () => {
    try {
      await knowledgeApi.cleanAll()
      listRequest.current++
      setLoading(false)
      setDocs([])
    } catch { toast.error(t('common.error')) }
    setShowClean(false)
  }
  const formatDate = (value?: string | null) => {
    if (!value || !Number.isFinite(Date.parse(value))) return '—'
    return new Date(value).toLocaleDateString(i18n.language, { month: 'short', day: 'numeric' })
  }
  const latest = docs.reduce<string | null>((latest, doc) => doc.created_at && Number.isFinite(Date.parse(doc.created_at)) && (!latest || Date.parse(doc.created_at) > Date.parse(latest)) ? doc.created_at : latest, null)
  const filtered = docs.filter((doc) => doc.filename.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) && (type === 'all' || (type === 'document' ? ['docx', 'pptx', 'txt'].includes(extension(doc.filename)) : extension(doc.filename) === type)))
  const metric = (value: number | string) => loading || loadError ? '—' : value
  return <KnowledgeLayout>
    <KnowledgeHeader title={t('knowledge.title')} subtitle={t('knowledgeUI.librarySubtitle')} actions={<>
      <button className="secondary-button" onClick={() => setClipOpen(true)}><Link2 size={16} />{t('clip.button')}</button>
      <button className="primary-button" disabled={uploading} onClick={() => fileInputRef.current?.click()}><Upload size={17} />{t('knowledge.upload')}</button>
    </>} />
    <div className={'knowledge-upload' + (dragOver ? ' is-dragging' : '')} onDragOver={(event) => { event.preventDefault(); setDragOver(true) }} onDragLeave={() => setDragOver(false)} onDrop={(event) => { event.preventDefault(); setDragOver(false); void handleFilesSelected(event.dataTransfer.files) }}>
      <input ref={fileInputRef} type="file" multiple accept=".pdf,.txt,.md,.docx,.pptx" className="hidden" onChange={(event) => { if (event.target.files) void handleFilesSelected(event.target.files); event.target.value = '' }} />
      <button className="knowledge-upload-target" disabled={uploading} onClick={() => fileInputRef.current?.click()}><Upload size={33} /><span><strong>{t(uploading ? 'knowledge.uploading' : 'knowledge.dragDrop')}</strong><small>{t('knowledge.fileTypes')}</small></span></button>
      <img src="/illustrations/study-cloud.png" alt="" />
    </div>
    {uploadFiles.length > 0 && <div className="mt-4 space-y-2" aria-live="polite">{uploadFiles.map((item, i) => <div key={i} className="knowledge-panel flex items-center gap-3 !p-4">
      {item.status === 'success' ? <CheckCircle2 size={18} className="text-[var(--color-success)] shrink-0" /> : item.status === 'fail' ? <AlertCircle size={18} className="text-[var(--color-danger)] shrink-0" /> : <Loader2 size={18} className="animate-spin shrink-0" />}
      <span className="text-sm truncate flex-1">{item.file.name}</span><span className="text-xs">{item.status === 'fail' ? item.error : item.status === 'success' ? t('knowledge.success') : Math.round(item.progress) + '%'}</span>
    </div>)}</div>}
    <div className="knowledge-metrics">
      <div className="knowledge-metric"><span><FileText size={24} /></span><div><small>{t('knowledgeUI.documentCount')}</small><strong>{metric(docs.length)}</strong></div></div>
      <div className="knowledge-metric"><span><Layers3 size={24} /></span><div><small>{t('knowledgeUI.chunkCount')}</small><strong>{metric(docs.reduce((sum, doc) => sum + doc.chunk_count, 0))}</strong></div></div>
      <div className="knowledge-metric"><span><Clock size={24} /></span><div><small>{t('knowledgeUI.latest')}</small><strong>{metric(formatDate(latest))}</strong></div></div>
    </div>
    <div className="knowledge-toolbar">
      <div className="knowledge-filters" role="group" aria-label={t('knowledgeUI.type')}>
        {['all', 'pdf', 'document', 'md'].map((value) => <button key={value} aria-pressed={type === value} onClick={() => setType(value)}>{value === 'all' ? t('note.all') : value === 'document' ? t('knowledgeUI.documents') : value === 'md' ? 'Markdown' : 'PDF'}</button>)}
      </div>
      <label className="knowledge-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} aria-label={t('knowledgeUI.searchFiles')} placeholder={t('knowledgeUI.searchFiles')} /></label>
    </div>
    {loadError && <div role="alert" className="knowledge-alert"><span>{loadError === 'rate' ? t('common.rateLimited') : t('knowledgeUI.loadError')}</span><button className="secondary-button" onClick={() => void loadDocs()}>{t('common.retry')}</button></div>}
    {loading && docs.length === 0 ? <div role="status" aria-label={t('common.loading')} className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl bg-[var(--color-bg-secondary)] animate-pulse" />)}</div>
      : !loadError && filtered.length === 0 ? <div className="knowledge-panel knowledge-empty"><img src="/illustrations/study-cloud.png" alt="" /><p>{t(docs.length ? 'note.ui.noResults' : 'knowledge.empty')}</p>{docs.length > 0 && <button className="secondary-button" onClick={() => { setType('all'); setSearch('') }}>{t('note.ui.clearFilters')}</button>}</div>
      : docs.length > 0 && <div className="knowledge-table-wrap"><table className="knowledge-table"><thead><tr>{['filename', 'type', 'chunkCount', 'status', 'added', 'actions'].map((key) => <th scope="col" key={key}>{t('knowledgeUI.' + key)}</th>)}</tr></thead><tbody>{filtered.map((doc) => <tr key={doc.id}>
        <td><button className="knowledge-document-name" onClick={() => setDetailFilename(doc.filename)}><span className={'knowledge-file-icon ' + extension(doc.filename)}><FileText size={20} /></span><span title={doc.filename}>{doc.filename}</span></button></td>
        <td><span className="knowledge-badge">{extension(doc.filename).toUpperCase() || '—'}</span></td><td>{doc.chunk_count}</td>
        <td><span className={'knowledge-badge' + (doc.chunk_count > 0 ? ' ready' : '')}>{t(doc.chunk_count > 0 ? 'knowledgeUI.ready' : 'knowledgeUI.noChunks')}</span></td><td><time>{formatDate(doc.created_at)}</time></td>
        <td><div className="knowledge-table-actions"><button className="knowledge-text-link" onClick={() => setDetailFilename(doc.filename)} aria-label={t('knowledge.detail') + '：' + doc.filename}>{t('knowledgeUI.view')}</button><button className="workspace-icon-button" disabled={uploading || clipping} onClick={() => setDeleteTarget(doc)} aria-label={t('note.delete') + '：' + doc.filename}><Trash2 size={16} /></button></div></td>
      </tr>)}</tbody></table></div>}
    {docs.length > 0 && <div className="flex justify-end mt-3"><button className="knowledge-text-link !text-[var(--color-text-tertiary)]" disabled={uploading || clipping} onClick={() => setShowClean(true)}><Trash2 size={14} />{t('knowledge.cleanAll')}</button></div>}
    <div className="knowledge-helper"><img src="/illustrations/study-cloud.png" alt="" /><div><strong>{t('knowledgeUI.askTitle')}</strong><p>{t('knowledgeUI.askHint')}</p></div><Link className="knowledge-text-link" to="/chat">{t('knowledgeUI.ask')}<ArrowRight size={16} /></Link></div>
    <ConfirmDialog open={showClean} onOpenChange={setShowClean} title={t('knowledge.cleanAll')} message={t('knowledge.cleanConfirm')} variant="danger" confirmText={t('knowledge.cleanAll')} onConfirm={handleCleanAll} />
    <ConfirmDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)} title={t('common.confirm')} message={t('knowledge.deleteConfirm')} variant="danger" confirmText={t('note.delete')} onConfirm={handleDelete} />
    <DocumentDetailDrawer filename={detailFilename} onClose={() => setDetailFilename(null)} />
    <Dialog.Root open={clipOpen} onOpenChange={(open) => { if (!clipping) setClipOpen(open) }}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" /><Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-[var(--color-card)] text-[var(--color-text)] rounded-2xl shadow-xl p-6 w-[440px] max-w-[90vw] border border-[var(--color-border)]">
      <div className="flex items-center justify-between mb-4"><Dialog.Title className="font-semibold">{t('clip.title')}</Dialog.Title><Dialog.Close disabled={clipping} className="workspace-icon-button" aria-label={t('common.cancel')}><X size={17} /></Dialog.Close></div>
      <form onSubmit={(event) => { event.preventDefault(); void handleClip() }}><input type="url" required value={clipUrl} onChange={(event) => setClipUrl(event.target.value)} aria-label={t('clip.placeholder')} placeholder={t('clip.placeholder')} disabled={clipping} className="w-full px-3 py-2 text-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]" /><Dialog.Description className="text-xs text-[var(--color-text-secondary)] mt-3">{t('clip.hint')}</Dialog.Description><div className="flex justify-end gap-2 mt-5"><Dialog.Close type="button" disabled={clipping} className="secondary-button">{t('common.cancel')}</Dialog.Close><button type="submit" disabled={clipping || !clipUrl.trim()} className="primary-button">{clipping && <Loader2 size={15} className="animate-spin" />}{t(clipping ? 'clip.processing' : 'clip.confirm')}</button></div></form>
    </Dialog.Content></Dialog.Portal></Dialog.Root>
  </KnowledgeLayout>
}
