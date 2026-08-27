import { useEffect, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Upload, FileText, Trash2, Loader2, CheckCircle2, AlertCircle, Link2, X } from 'lucide-react'
import { knowledgeApi } from '../api/knowledge'
import { useSSE } from '../hooks/useSSE'
import type { KnowledgeSSEMessage } from '../types/api'
import EmptyState from '../components/common/EmptyState'
import ConfirmDialog from '../components/common/ConfirmDialog'
import DocumentDetailDrawer from '../components/knowledge/DocumentDetailDrawer'
import { usePetStore } from '../stores/usePetStore'

interface UploadFile {
  file: File
  progress: number
  status: 'pending' | 'uploading' | 'success' | 'fail'
  error?: string
}

export default function KnowledgeBase() {
  const { t } = useTranslation()
  const { start: startSSE } = useSSE()
  const [docs, setDocs] = useState<Array<{ id: string; filename: string; chunk_count: number; created_at: string }>>([])
  const [loading, setLoading] = useState(true)
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([])
  const [uploadTotal, setUploadTotal] = useState(0)
  const [uploadDone, setUploadDone] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const [showClean, setShowClean] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; filename: string } | null>(null)
  const [detailFilename, setDetailFilename] = useState<string | null>(null)
  const [clipOpen, setClipOpen] = useState(false)
  const [clipUrl, setClipUrl] = useState('')
  const [clipping, setClipping] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadDocs = async () => {
    setLoading(true)
    try {
      const res = await knowledgeApi.list()
      const documents = (res.data as { documents: Array<{ id: string; filename: string; chunk_count: number; created_at: string }> } | undefined)?.documents || []
      setDocs(documents)
    } catch {
      toast.error('加载文档列表失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // setTimeout 包裹：loadDocs 内部同步 setState（react-hooks/set-state-in-effect）
    const timer = window.setTimeout(() => { void loadDocs() }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  const handleClip = async () => {
    const url = clipUrl.trim()
    if (!url) {
      toast.error(t('clip.urlRequired'))
      return
    }
    setClipping(true)
    try {
      const res = await knowledgeApi.clip(url)
      const data = res.data as { filename?: string } | undefined
      toast.success(t('clip.success', { filename: data?.filename ?? '' }))
      setClipOpen(false)
      setClipUrl('')
      loadDocs()
      // 页宠联动：剪藏入库
      usePetStore.getState().trigger('doc_uploaded')
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(detail || t('clip.failed'))
    } finally {
      setClipping(false)
    }
  }

  const handleFilesSelected = (files: FileList) => {
    const newFiles: UploadFile[] = Array.from(files).map((f) => ({ file: f, progress: 0, status: 'pending' }))
    setUploadFiles(newFiles)
    setUploadTotal(newFiles.length)
    setUploadDone(0)

    const formData = new FormData()
    newFiles.forEach((f) => formData.append('files', f.file))

    startSSE(
      '/knowledge/add/multiple/stream',
      formData,
      {
        onKnowledgeProgress: (data: KnowledgeSSEMessage) => {
          if (data.event_type === 'processing') {
            setUploadFiles((prev) =>
              prev.map((uf) =>
                uf.file.name === data.filename
                  ? { ...uf, progress: data.progress || 0, status: 'uploading' }
                  : uf
              )
            )
          } else if (data.event_type === 'completed') {
            setUploadFiles((prev) =>
              prev.map((uf) =>
                uf.file.name === data.filename
                  ? { ...uf, progress: 100, status: 'success' }
                  : uf
              )
            )
            setUploadDone((c) => c + 1)
          } else if (data.event_type === 'error') {
            setUploadFiles((prev) =>
              prev.map((uf) =>
                uf.file.name === data.filename
                  ? { ...uf, status: 'fail', error: data.error_message || '上传失败' }
                  : uf
              )
            )
            setUploadDone((c) => c + 1)
          } else if (data.event_type === 'finish') {
            loadDocs()
            setUploadFiles((prev) => {
              const allSuccess = prev.length > 0 && prev.every((uf) => uf.status === 'success')
              return allSuccess ? [] : prev
            })
            setUploadTotal(0)
            setUploadDone(0)
            // 页宠联动：文档上传完成
            usePetStore.getState().trigger('doc_uploaded')
          }
        },
        onError: () => {
          setUploadFiles((prev) =>
            prev.map((uf) =>
              uf.status === 'uploading' ? { ...uf, status: 'fail' as const } : uf
            )
          )
        },
      }
    )
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = () => setDragOver(false)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length > 0) {
      handleFilesSelected(e.dataTransfer.files)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await knowledgeApi.deleteByFilename(deleteTarget.filename)
      setDocs((prev) => prev.filter((d) => d.id !== deleteTarget.id))
    } catch {
      toast.error('删除文档失败')
    }
    setDeleteTarget(null)
  }

  const handleCleanAll = async () => {
    try {
      await knowledgeApi.cleanAll()
      setDocs([])
    } catch {
      toast.error('清空知识库失败')
    }
    setShowClean(false)
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-xl font-semibold text-[var(--color-text)]">{t('knowledge.title')}</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setClipOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-md border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent-bg)] transition-colors"
          >
            <Link2 size={14} />
            {t('clip.button')}          </button>
          {docs.length > 0 && (
            <button
              onClick={() => setShowClean(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-md border border-[var(--color-border)] text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] transition-colors"
            >
              <Trash2 size={14} />
              {t('knowledge.cleanAll')}
            </button>
          )}
        </div>
      </div>

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-lg p-10 text-center transition-colors ${
          dragOver ? 'border-[var(--color-accent)] bg-[var(--color-accent-bg)]' : 'border-[var(--color-border)] hover:border-[var(--color-text-tertiary)]'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.txt,.md,.docx,.pptx"
          className="hidden"
          onChange={(e) => e.target.files && handleFilesSelected(e.target.files)}
        />
        <Upload size={24} className="mx-auto mb-3 text-[var(--color-text-tertiary)]" />
        <p className="text-sm text-[var(--color-text-secondary)] mb-1">{t('knowledge.dragDrop')}</p>
        <p className="text-xs text-[var(--color-text-tertiary)] mb-4">{t('knowledge.fileTypes')}</p>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-4 py-2 text-sm rounded-md bg-[var(--color-accent)] text-[var(--color-accent-foreground)] hover:bg-[var(--color-accent-hover)] transition-colors"
        >
          {t('knowledge.upload')}
        </button>
      </div>

      {uploadFiles.length > 0 && (
        <div className="mt-4 space-y-2">
          {uploadFiles.map((uf, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-lg bg-[var(--color-card)] border border-[var(--color-border)]">
              {uf.status === 'success' ? (
                <CheckCircle2 size={16} className="text-[var(--color-success)] shrink-0" />
              ) : uf.status === 'fail' ? (
                <AlertCircle size={16} className="text-[var(--color-danger)] shrink-0" />
              ) : (
                <Loader2 size={16} className="animate-spin text-[var(--color-accent)] shrink-0" />
              )}
              <span className="text-sm text-[var(--color-text)] flex-1 truncate">{uf.file.name}</span>
              {uf.status === 'fail' && uf.error ? (
                <span className="text-xs text-[var(--color-danger)] truncate max-w-[240px]">{uf.error}</span>
              ) : (
                <span className="text-xs text-[var(--color-text-tertiary)]">{formatSize(uf.file.size)}</span>
              )}
              {uf.status === 'uploading' && (
                <div className="w-24 h-1.5 rounded-full bg-[var(--color-bg-tertiary)] overflow-hidden">
                  <div className="h-full bg-[var(--color-accent)] rounded-full transition-all" style={{ width: `${uf.progress}%` }} />
                </div>
              )}
            </div>
          ))}
          {uploadDone === uploadTotal && uploadDone > 0 && (
            <p className="text-xs text-[var(--color-success)] text-center">{t('knowledge.success')}</p>
          )}
        </div>
      )}

      <div className="mt-8">
        <h2 className="text-sm font-medium text-[var(--color-text)] mb-4">{t('knowledge.title')} ({docs.length})</h2>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-[var(--color-bg-tertiary)] rounded-lg animate-pulse" />
            ))}
          </div>
        ) : docs.length === 0 ? (
          <EmptyState icon={<FileText size={48} />} message={t('knowledge.empty')} />
        ) : (
          <div className="space-y-2">
            {docs.map((doc) => (
              <div
                key={doc.id}
                onClick={() => setDetailFilename(doc.filename)}
                className="flex items-center justify-between px-4 py-3 rounded-lg bg-[var(--color-card)] border border-[var(--color-border)] hover:border-[var(--color-accent)] cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <FileText size={16} className="text-[var(--color-text-tertiary)] shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm text-[var(--color-text)] truncate">{doc.filename}</p>
                    <p className="text-xs text-[var(--color-text-tertiary)]">
                      {doc.chunk_count} chunks | {formatDate(doc.created_at)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(doc) }}
                    className="workspace-icon-button"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog open={showClean} onOpenChange={setShowClean} title={t('knowledge.cleanAll')} message={t('knowledge.cleanConfirm')} variant="danger" confirmText={t('knowledge.cleanAll')} onConfirm={handleCleanAll} />
      <ConfirmDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)} title={t('common.confirm')} message={t('knowledge.deleteConfirm')} variant="danger" confirmText={t('note.delete')} onConfirm={handleDelete} />
      <DocumentDetailDrawer filename={detailFilename} onClose={() => setDetailFilename(null)} />

      {/* 网页剪藏弹窗 */}
      {clipOpen && (
        <>
          <div className="fixed inset-0 bg-black/40 z-50" onClick={() => !clipping && setClipOpen(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-[var(--color-card)] rounded-lg shadow-xl p-6 w-[440px] max-w-[90vw] border border-[var(--color-border)]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-medium text-[var(--color-text)] flex items-center gap-2">
                <Link2 size={16} className="text-[var(--color-accent)]" />
                {t('clip.title')}
              </h3>
              <button
                onClick={() => setClipOpen(false)}
                disabled={clipping}
                className="workspace-icon-button"
              >
                <X size={16} />
              </button>
            </div>
            <input
              type="url"
              value={clipUrl}
              onChange={(e) => setClipUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !clipping) handleClip() }}
              placeholder={t('clip.placeholder')}
              disabled={clipping}
              autoFocus
              className="w-full px-3 py-2 text-sm rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text)] placeholder:text-[var(--color-text-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] disabled:opacity-60"
            />
            <p className="text-xs text-[var(--color-text-tertiary)] mt-2">{t('clip.hint')}</p>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setClipOpen(false)}
                disabled={clipping}
                className="secondary-button"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleClip}
                disabled={clipping || !clipUrl.trim()}
                className="primary-button"
              >
                {clipping && <Loader2 size={14} className="animate-spin" />}
                {clipping ? t('clip.processing') : t('clip.confirm')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
