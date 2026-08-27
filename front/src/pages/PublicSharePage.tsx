import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import Markdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import { Link2, Eye, CalendarDays, Tag, Loader2 } from 'lucide-react'
import { shareApi, type PublicNote } from '../api/share'

/** 公开分享页：免登录只读展示已公开的笔记（/share/:id） */
export default function PublicSharePage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const [note, setNote] = useState<PublicNote | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    shareApi
      .get(id)
      .then((data) => {
        if (cancelled) return
        setNote(data)
        setNotFound(false)
      })
      .catch(() => {
        if (!cancelled) setNotFound(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      toast.success(t('share.copied'))
    } catch {
      toast.error(t('share.copyFailed'))
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return ''
    return new Date(dateStr).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex flex-col">
      {/* 渐变封面区 */}
      <div className="bg-gradient-to-br from-[#1f6c9f] via-[#7c6cf0] to-[#d0579b] text-white">
        <div className="max-w-3xl mx-auto px-6 py-14">
          <div className="flex items-center justify-between mb-8">
            <span className="text-sm font-medium tracking-wide opacity-90">云舒卷 · RAG Notebook</span>
            <a
              href="/"
              className="text-xs px-3 py-1.5 rounded-full bg-white/15 hover:bg-white/25 transition-colors"
            >
              {t('share.home')}
            </a>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={28} className="animate-spin opacity-80" />
            </div>
          ) : notFound || !note ? (
            <div className="py-16 text-center">
              <p className="text-lg font-medium mb-2">{t('share.notFound')}</p>
              <p className="text-sm opacity-75">{t('share.notFoundHint')}</p>
            </div>
          ) : (
            <>
              <h1 className="font-heading text-3xl md:text-4xl font-bold leading-tight mb-4">{note.title}</h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm opacity-90">
                {note.category && (
                  <span className="px-2.5 py-0.5 rounded-full bg-white/20">{note.category}</span>
                )}
                <span className="flex items-center gap-1.5">
                  <CalendarDays size={14} />
                  {formatDate(note.updated_at || note.created_at)}
                </span>
                <span className="flex items-center gap-1.5">
                  <Eye size={14} />
                  {note.view_count} {t('share.views')}
                </span>
                {note.tags.length > 0 && (
                  <span className="flex items-center gap-1.5">
                    <Tag size={14} />
                    {note.tags.join(' · ')}
                  </span>
                )}
              </div>
              <button
                onClick={handleCopy}
                className="mt-6 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-white text-[#1f6c9f] hover:opacity-90 transition-opacity"
              >
                <Link2 size={15} />
                {t('share.copyLink')}
              </button>
            </>
          )}
        </div>
      </div>

      {/* 正文区 */}
      {!loading && !notFound && note && (
        <div className="flex-1">
          <div className="max-w-3xl mx-auto px-6 py-10">
            <div className="prose prose-sm md:prose-base dark:prose-invert max-w-none">
              <Markdown rehypePlugins={[rehypeHighlight]}>{note.content}</Markdown>
            </div>
          </div>
        </div>
      )}

      {/* 底部品牌 */}
      <footer className="py-6 text-center text-xs text-[var(--color-text-tertiary)]">
        {t('share.poweredBy')} · 云舒卷
      </footer>
    </div>
  )
}
