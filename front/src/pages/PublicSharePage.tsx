import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import Markdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import { Link2, Eye, CalendarDays, Home, Loader2 } from 'lucide-react'
import { shareApi, type PublicNote } from '../api/share'
import '../styles/share-page.css'

/** 公开分享页：免登录只读展示已公开的笔记（/share/:id）
 *  不进 MainLayout，是独立沉浸界面。 */
export default function PublicSharePage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const [note, setNote] = useState<PublicNote | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const progressRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    shareApi
      .get(id)
      .then((data) => {
        if (cancelled) return
        setNote(data)
        setNotFound(false)
        // 标签页标题用笔记标题（分享页独立于 MainLayout，自行设置）
        document.title = `${data.title} · 云舒卷`
      })
      .catch(() => {
        if (cancelled) return
        setNotFound(true)
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  // 阅读进度：直接改 DOM 宽度，不进 state，避免滚动时反复重渲染
  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const el = progressRef.current
      if (!el) return
      const scrollable = document.documentElement.scrollHeight - window.innerHeight
      const ratio = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0
      el.style.width = `${ratio * 100}%`
    }
    const onScroll = () => {
      if (frame) return
      frame = window.requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [loading, notFound])

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

  const author = note?.author ?? null
  const authorInitial = (author?.username || '?').slice(0, 1).toUpperCase()

  return (
    <div className="share-page">
      <header className="share-topbar">
        <Link className="share-brand" to="/">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M17.5 19a4.5 4.5 0 0 0 .3-9 6.5 6.5 0 0 0-12.6 2A4 4 0 0 0 6 19Z" />
          </svg>
          <span>云舒卷</span>
        </Link>
        <div className="share-topbar-actions">
          {!loading && !notFound && note && (
            <button className="share-btn share-btn-ghost" onClick={handleCopy}>
              <Link2 size={14} />
              {t('share.copyLink')}
            </button>
          )}
          <Link className="share-btn share-btn-primary" to="/register">{t('share.ctaPrimary')}</Link>
        </div>
      </header>

      <div className="share-progress" ref={progressRef} style={{ width: 0 }} />

      {loading ? (
        <div className="share-loading">
          <Loader2 size={26} className="animate-spin" />
          <span style={{ marginLeft: 10 }}>{t('share.loading')}</span>
        </div>
      ) : notFound || !note ? (
        <main className="share-empty">
          <div className="share-empty-inner">
            <div className="share-empty-art">
              <span className="share-empty-halo" />
              <img src="/illustrations/study-cloud.png" alt="" />
              <span className="share-empty-spark">✧</span>
            </div>
            <h1>{t('share.notFound')}</h1>
            <p>
              {t('share.notFoundHint')}
              <br />
              {t('share.notFoundAuthorHint')}
            </p>
            <div className="share-empty-actions">
              <Link className="share-btn share-btn-primary" to="/">
                <Home size={14} />
                {t('share.home')}
              </Link>
              <Link className="share-btn share-btn-ghost" to="/register">{t('share.ctaPrimary')}</Link>
            </div>
            <p className="share-empty-hint">{t('share.privacyNote')}</p>
          </div>
        </main>
      ) : (
        <>
          <section className="share-hero">
            <div className="share-hero-inner">
              {note.category && <span className="share-category">{note.category}</span>}
              <h1 className="share-title">{note.title}</h1>

              <div className="share-meta">
                {author ? (
                  <span className="share-author">
                    <span className="share-author-avatar">
                      {author.avatar
                        ? <img src={author.avatar} alt="" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                        : authorInitial}
                    </span>
                    <span className="share-author-copy">
                      <strong>{author.username}</strong>
                      <small>{t('share.authorNotes', { count: author.public_note_count ?? 0 })}</small>
                    </span>
                  </span>
                ) : (
                  <span className="share-author">
                    <span className="share-author-avatar">云</span>
                    <span className="share-author-copy"><strong>云舒卷</strong></span>
                  </span>
                )}
                <span className="share-meta-div" />
                <span className="share-meta-item">
                  <CalendarDays size={14} />
                  {t('share.updatedAt')} {formatDate(note.updated_at || note.created_at)}
                </span>
                <span className="share-meta-item">
                  <Eye size={14} />
                  {note.view_count} {t('share.views')}
                </span>
              </div>

              {note.tags.length > 0 && (
                <div className="share-tags">
                  {note.tags.map((tag) => (
                    <span key={tag} className="share-tag">{tag}</span>
                  ))}
                </div>
              )}
            </div>
          </section>

          <main className="share-body">
            <article className="share-prose">
              <Markdown rehypePlugins={[rehypeHighlight]} remarkPlugins={[remarkGfm]}>{note.content}</Markdown>
            </article>

            {author && (
              <section className="share-author-card">
                <span className="share-author-card-avatar">
                  {author.avatar
                    ? <img src={author.avatar} alt="" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                    : authorInitial}
                </span>
                <div className="share-author-card-copy">
                  <strong>{author.username}</strong>
                  <p>{author.bio || t('share.poweredBy')}</p>
                </div>
                <Link className="share-btn share-btn-ghost" to={`/user/${author.id}`}>{t('share.viewProfile')}</Link>
              </section>
            )}

            <section className="share-cta">
              <div className="share-cta-inner">
                <div className="share-cta-copy">
                  <h3>{t('share.ctaTitle')}</h3>
                  <p>{t('share.ctaDesc')}</p>
                  <div className="share-cta-actions">
                    <Link className="share-btn share-btn-primary" to="/register">{t('share.ctaPrimary')}</Link>
                    <Link className="share-btn share-btn-ghost" to="/login">{t('share.ctaSecondary')}</Link>
                  </div>
                </div>
                <div className="share-cta-art">
                  <img src="/illustrations/study-cloud.png" alt="" />
                </div>
              </div>
            </section>
          </main>
        </>
      )}

      <footer className="share-footer">
        {t('share.poweredBy')}
      </footer>
    </div>
  )
}
