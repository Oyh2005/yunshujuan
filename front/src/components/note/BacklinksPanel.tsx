import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { GitBranch, X, FileText } from 'lucide-react'
import { notesApi } from '../../api/notes'
import type { BacklinksData } from '../../types/api'

interface Props {
  noteId: string
  open: boolean
  onClose: () => void
}

/**
 * 反向链接面板：谁通过 [[标题]] 引用了当前笔记 + 当前笔记引用的标题。
 * 样式与 RelatedFragments（右侧抽屉）保持一致。
 */
export default function BacklinksPanel({ noteId, open, onClose }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [data, setData] = useState<BacklinksData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!open || !noteId) return
    let cancelled = false
    notesApi
      .backlinks(noteId)
      .then((res) => {
        if (cancelled) return
        setData(res.data ?? { backlinks: [], outlinks: [] })
      })
      .catch(() => {
        if (!cancelled) setData({ backlinks: [], outlinks: [] })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [noteId, open])

  if (!open) return null

  const backlinks = data?.backlinks ?? []
  const outlinks = data?.outlinks ?? []

  return (
    <div className="w-80 flex flex-col border-l border-[var(--color-border)] bg-[var(--color-card)] shrink-0">
      <div className="flex items-center justify-between px-4 h-12 border-b border-[var(--color-border-light)]">
        <h2 className="text-sm font-medium text-[var(--color-text)] flex items-center gap-1.5">
          <GitBranch size={14} className="text-[var(--color-accent)]" />
          {t('backlinks.title')}
          {!loading && <span className="ml-0.5 text-xs text-[var(--color-text-tertiary)]">({backlinks.length})</span>}
        </h2>
        <button
          onClick={onClose}
          className="workspace-icon-button"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-5 h-5 border-2 border-[var(--color-border)] border-t-[var(--color-accent)] rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* 反向链接 */}
            {backlinks.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-[var(--color-text-tertiary)]">
                {t('backlinks.empty')}
              </div>
            ) : (
              <div className="space-y-2">
                {backlinks.map((b) => (
                  <button
                    key={b.note_id}
                    onClick={() => navigate(`/notes/${b.note_id}`)}
                    className="w-full flex items-start gap-2.5 px-3 py-2.5 rounded-lg border border-[var(--color-border-light)] bg-[var(--color-bg)] hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-bg)] transition-colors text-left"
                  >
                    <FileText size={14} className="shrink-0 mt-0.5 text-[var(--color-accent)]" />
                    <span className="min-w-0">
                      <span className="block text-sm text-[var(--color-text)] truncate">{b.title}</span>
                      {b.updated_at && (
                        <span className="block text-[10px] text-[var(--color-text-tertiary)] mt-0.5">
                          {new Date(b.updated_at).toLocaleDateString()}
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* 正向引用 */}
            {outlinks.length > 0 && (
              <div>
                <h3 className="text-xs font-medium text-[var(--color-text-secondary)] mb-2">{t('backlinks.outlinks')}</h3>
                <div className="flex flex-wrap gap-1.5">
                  {outlinks.map((title) => (
                    <span
                      key={title}
                      className="px-2 py-1 text-xs rounded-full bg-[var(--color-accent-bg)] text-[var(--color-accent)]"
                    >
                      {title}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
