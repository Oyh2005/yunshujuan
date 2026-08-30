import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Heart,
  MessageCircle,
  Trash2,
  Send,
  ImagePlus,
  X,
  FileText,
  Loader2,
  Search,
  Quote,
  ShieldAlert,
  Bell,
  ChevronRight,
  Lightbulb,
  PenLine,
  Users,
} from 'lucide-react'
import { socialApi } from '../api/social'
import { notesApi } from '../api/notes'
import client from '../api/client'
import type { Note, Post, PostDetail } from '../types/api'
import ConfirmDialog from '../components/common/ConfirmDialog'
import ProgressiveImage from '../components/common/ProgressiveImage'
import SocialLayout, { SocialAvatar, SocialHeader, SocialPetCard } from '../components/social/SocialLayout'
import { usePetStore } from '../stores/usePetStore'
import { useUserStore } from '../stores/useUserStore'

function formatTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const sameDay = d.toDateString() === new Date().toDateString()
  return sameDay
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString()
}

export default function SocialFeed() {
  const { t, i18n } = useTranslation()
  const english = i18n.resolvedLanguage?.startsWith('en')
  const text = (zh: string, en: string) => english ? en : zh
  const navigate = useNavigate()
  const [posts, setPosts] = useState<Post[]>([])
  const [nextCursor, setNextCursor] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  // 发布框
  const [draft, setDraft] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [images, setImages] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [quoteNote, setQuoteNote] = useState<Note | null>(null)
  const [quoteOpen, setQuoteOpen] = useState(false)
  const [quoteQuery, setQuoteQuery] = useState('')
  const [quoteResults, setQuoteResults] = useState<Note[]>([])
  const [quoteSearching, setQuoteSearching] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 评论
  const [detailMap, setDetailMap] = useState<Record<number, PostDetail | null>>({})
  const [commentDrafts, setCommentDrafts] = useState<Record<number, string>>({})
  const [commentingId, setCommentingId] = useState<number | null>(null)

  // 删除确认
  const [deleteTarget, setDeleteTarget] = useState<Post | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let cancelled = false
    socialApi
      .feed()
      .then((res) => {
        if (cancelled) return
        setPosts(res.data.posts)
        setNextCursor(res.data.next_cursor)
        setLoadFailed(false)
      })
      .catch(() => {
        if (!cancelled) {
          setLoadFailed(true)
          toast.error(t('common.error'))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [t])

  // ── 发布 ──
  const handlePublish = async () => {
    const content = draft.trim()
    if (!content && images.length === 0) {
      toast.error(t('social.emptyPost'))
      return
    }
    setPublishing(true)
    try {
      await socialApi.createPost({
        content,
        images: images.length > 0 ? images : undefined,
        note_id: quoteNote?.id,
      })
      setDraft('')
      setImages([])
      setQuoteNote(null)
      toast.success(t('social.published'))
      usePetStore.getState().trigger('post_created')
      // 刷新时间线
      const res = await socialApi.feed()
      setPosts(res.data.posts)
      setNextCursor(res.data.next_cursor)
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(detail || t('social.publishFailed'))
    } finally {
      setPublishing(false)
    }
  }

  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)
    try {
      const urls: string[] = []
      for (const file of Array.from(files).slice(0, 9 - images.length)) {
        const form = new FormData()
        form.append('file', file)
        const res = await client.post<{ file_url?: string }>('/file/upload/', form)
        const url = res.data?.file_url
        if (url) urls.push(url)
      }
      setImages((prev) => [...prev, ...urls].slice(0, 9))
      if (urls.length === 0) toast.error(t('social.uploadFailed'))
    } catch {
      toast.error(t('social.uploadFailed'))
    } finally {
      setUploading(false)
    }
  }

  const handleQuoteSearch = async () => {
    const q = quoteQuery.trim()
    if (!q) return
    setQuoteSearching(true)
    try {
      const res = await notesApi.search(q)
      setQuoteResults((res.data?.notes as Note[] | undefined) || [])
    } catch {
      setQuoteResults([])
    } finally {
      setQuoteSearching(false)
    }
  }

  const handleLoadMore = async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const res = await socialApi.feed(nextCursor)
      setPosts((prev) => [...prev, ...res.data.posts])
      setNextCursor(res.data.next_cursor)
    } catch {
      toast.error(t('common.error'))
    } finally {
      setLoadingMore(false)
    }
  }

  // ── 点赞 / 评论 / 删除 ──
  // 点赞单飞守卫：同一动态在途请求期间忽略重复点击，避免乐观更新与服务端响应互相覆盖
  const likingRef = useRef(new Set<number>())
  const handleToggleLike = async (post: Post) => {
    if (likingRef.current.has(post.id)) return
    likingRef.current.add(post.id)
    const optimisticLiked = !post.liked_by_me
    // P1-5 乐观更新：立即翻转点赞态与计数，失败回滚，成功以服务端为准校准
    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id
          ? { ...p, liked_by_me: optimisticLiked, like_count: Math.max(0, p.like_count + (optimisticLiked ? 1 : -1)) }
          : p
      )
    )
    try {
      const res = await socialApi.toggleLike(post.id)
      const serverLiked = res.data?.liked
      // 服务端状态与乐观值不一致才校准（避免重复增减计数）
      if (serverLiked !== undefined && serverLiked !== optimisticLiked) {
        setPosts((prev) =>
          prev.map((p) =>
            p.id === post.id
              ? { ...p, liked_by_me: serverLiked, like_count: Math.max(0, p.like_count + (serverLiked ? 1 : -1)) }
              : p
          )
        )
      }
    } catch {
      // 回滚到点击前状态
      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id
            ? { ...p, liked_by_me: !optimisticLiked, like_count: Math.max(0, p.like_count + (optimisticLiked ? -1 : 1)) }
            : p
        )
      )
      toast.error(t('common.error'))
    } finally {
      likingRef.current.delete(post.id)
    }
  }

  const toggleComments = async (postId: number) => {
    const current = detailMap[postId]
    if (current !== undefined) {
      setDetailMap((prev) => {
        const next = { ...prev }
        delete next[postId]
        return next
      })
      return
    }
    try {
      const res = await socialApi.detail(postId)
      setDetailMap((prev) => ({ ...prev, [postId]: res.data }))
    } catch {
      toast.error(t('common.error'))
    }
  }

  const handleSendComment = async (postId: number) => {
    const content = (commentDrafts[postId] ?? '').trim()
    if (!content) return
    setCommentingId(postId)
    try {
      const res = await socialApi.addComment(postId, content)
      const comment = res.data
      setDetailMap((prev) => {
        const detail = prev[postId]
        if (!detail) return prev
        return {
          ...prev,
          [postId]: {
            ...detail,
            comments: [...detail.comments, comment],
            comment_count: detail.comment_count + 1,
          },
        }
      })
      setCommentDrafts((prev) => ({ ...prev, [postId]: '' }))
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, comment_count: p.comment_count + 1 } : p))
      )
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(detail || t('common.error'))
    } finally {
      setCommentingId(null)
    }
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await socialApi.deletePost(deleteTarget.id)
      setPosts((prev) => prev.filter((p) => p.id !== deleteTarget.id))
      toast.success(t('social.deleted'))
    } catch {
      toast.error(t('common.error'))
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  const handleDeleteComment = async (postId: number, commentId: string) => {
    try {
      await socialApi.deleteComment(commentId)
      setDetailMap((prev) => {
        const detail = prev[postId]
        if (!detail) return prev
        return {
          ...prev,
          [postId]: {
            ...detail,
            comments: detail.comments.filter((c) => c.id !== commentId),
            comment_count: Math.max(0, detail.comment_count - 1),
          },
        }
      })
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, comment_count: Math.max(0, p.comment_count - 1) } : p
        )
      )
    } catch {
      toast.error(t('common.error'))
    }
  }

  const myUserId = useUserStore((s) => s.userInfo?.user_id ?? s.userInfo?.uuid ?? '')
  const currentUser = useUserStore((s) => s.userInfo)

  const retryFeed = async () => {
    setLoading(true)
    setLoadFailed(false)
    try {
      const res = await socialApi.feed()
      setPosts(res.data.posts)
      setNextCursor(res.data.next_cursor)
    } catch {
      setLoadFailed(true)
      toast.error(t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <SocialLayout className="social-feed-page">
      <SocialHeader title={text('知识动态', 'Knowledge feed')} subtitle={text('分享灵感，也看看朋友们最近在思考什么', 'Share ideas and see what your friends are exploring')} />
      <div className="social-content-grid">
        <main className="social-main-stack">
          <section className="social-card social-composer">
            <div className="social-composer-user">
              <SocialAvatar username={currentUser?.username || text('我', 'Me')} avatar={currentUser?.avatar || null} size={38} />
              <strong>{text('分享此刻的想法…', 'Share what is on your mind…')}</strong>
            </div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={text('记录一个想法、学习收获或值得讨论的问题', 'Capture an idea, learning, or question worth discussing')}
            rows={3}
          />
          {images.length > 0 && (
            <div className="social-upload-preview">
              {images.map((url, i) => (
                <div key={`${url}-${i}`} className="social-upload-item">
                  <img src={url} alt="" loading="lazy" />
                  <button
                    onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                    aria-label={text('移除图片', 'Remove image')}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {quoteNote && (
            <div className="social-quote-chip">
              <Quote size={13} />
              <span>{quoteNote.title}</span>
              <button onClick={() => setQuoteNote(null)} aria-label={text('取消引用', 'Remove quote')}>
                <X size={13} />
              </button>
            </div>
          )}
          <div className="social-composer-actions">
            <div className="social-composer-tools">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => handleFilesSelected(e.target.files)}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || images.length >= 9}
                className="social-tool-button"
                title={t('social.addImage')}
              >
                {uploading ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
                <span>{t('social.addImage')}</span>
              </button>
              <button
                onClick={() => setQuoteOpen(true)}
                className="social-tool-button"
                title={t('social.quoteNote')}
              >
                <Quote size={16} />
                <span>{t('social.quoteNote')}</span>
              </button>
            </div>
            <button
              onClick={handlePublish}
              disabled={publishing || (!draft.trim() && images.length === 0)}
              className="social-publish-button"
            >
              {publishing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {t('social.publish')}
            </button>
          </div>
          </section>

          <div className="social-feed-heading"><h2>{text('最新动态', 'Latest posts')}</h2><p>{text('与朋友一起交流和成长', 'Learn and grow with friends')}</p></div>
          {loading ? (
            <div className="social-card social-loading"><Loader2 size={22} />{text('正在加载动态', 'Loading feed')}</div>
          ) : loadFailed ? (
            <div className="social-card social-inline-error"><p>{text('动态暂时加载失败', 'The feed could not be loaded')}</p><button onClick={retryFeed}>{text('重新加载', 'Try again')}</button></div>
          ) : posts.length === 0 ? (
            <div className="social-card social-empty"><PenLine size={27} /><p>{t('social.empty')}</p></div>
          ) : (
          <div className="social-main-stack">
            {posts.map((post) => {
              const detail = detailMap[post.id]
              const isMine = post.user_id === myUserId
              return (
                <article key={post.id} className="social-card social-post">
                  <div className="social-post-author">
                    <SocialAvatar username={post.author.username} avatar={post.author.avatar} />
                    <div>
                      <strong>{post.author.username}</strong>
                      <time>{formatTime(post.created_at)}</time>
                    </div>
                    {isMine && (
                      <button
                        onClick={() => setDeleteTarget(post)}
                        className="workspace-icon-button"
                        title={t('social.delete')}
                        aria-label={t('social.delete')}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>

                  {post.review_status === 'rejected' && (
                    <div className="social-review-alert">
                      <ShieldAlert size={13} />
                      {t('social.reviewRejected')}
                    </div>
                  )}
                  <p className="social-post-copy">{post.content}</p>

                  {post.images.length > 0 && (
                    <div className={`social-post-images${post.images.length === 1 ? ' is-single' : ''}`}>
                      {post.images.map((url, i) => (
                        <ProgressiveImage key={`${url}-${i}`} src={url} alt="" loading="lazy" />
                      ))}
                    </div>
                  )}

                  {post.note_id && post.note_title && (
                    <button
                      onClick={() => navigate(post.author.user_id === myUserId ? `/notes/${post.note_id}` : `/share/${post.note_id}`)}
                      className="social-note-reference"
                    >
                      <span><FileText size={17} /></span>
                      <span><strong>{post.note_title}</strong><small>{post.author.user_id === myUserId ? text('引用笔记', 'Quoted note') : text('TA 引用的笔记', 'Quoted note')}</small></span>
                      <ChevronRight size={16} />
                    </button>
                  )}

                  <div className="social-post-actions">
                    <button
                      onClick={() => handleToggleLike(post)}
                      className={`social-post-action${post.liked_by_me ? ' is-active' : ''}`}
                    >
                      <Heart size={14} fill={post.liked_by_me ? 'currentColor' : 'none'} />
                      {post.like_count > 0 ? post.like_count : t('social.like')}
                    </button>
                    <button
                      onClick={() => toggleComments(post.id)}
                      className={`social-post-action${detail ? ' is-active' : ''}`}
                    >
                      <MessageCircle size={14} />
                      {post.comment_count > 0 ? post.comment_count : t('social.comment')}
                    </button>
                  </div>

                  {detail && (
                    <div className="social-comments">
                      {detail.comments.length === 0 && (
                        <p className="social-empty">{t('social.noComments')}</p>
                      )}
                      {detail.comments.map((c) => (
                        <div key={c.id} className="social-comment">
                          <SocialAvatar username={c.username} avatar={c.avatar} size={28} />
                          <div className="social-comment-body">
                            <div className="social-comment-meta">
                              <strong>{c.username}</strong>
                              <time>{formatTime(c.created_at)}</time>
                              {c.user_id === myUserId && (
                                <button onClick={() => handleDeleteComment(post.id, c.id)} aria-label={text('删除评论', 'Delete comment')}>
                                  <X size={12} />
                                </button>
                              )}
                            </div>
                            <p>{c.content}</p>
                          </div>
                        </div>
                      ))}
                      <div className="social-comment-compose">
                        <input
                          value={commentDrafts[post.id] ?? ''}
                          onChange={(e) => setCommentDrafts((prev) => ({ ...prev, [post.id]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleSendComment(post.id) }}
                          placeholder={t('social.commentPlaceholder')}
                          className="social-comment-input"
                        />
                        <button
                          onClick={() => handleSendComment(post.id)}
                          disabled={commentingId === post.id || !(commentDrafts[post.id] ?? '').trim()}
                          className="social-comment-send"
                          aria-label={text('发送评论', 'Send comment')}
                        >
                          {commentingId === post.id ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              )
            })}

            {nextCursor && (
              <button onClick={handleLoadMore} disabled={loadingMore} className="social-load-more">{loadingMore ? t('common.loading') : t('social.loadMore')}</button>
            )}
          </div>
          )}
        </main>

        <aside className="social-rail">
          <section className="social-card social-entry-card">
            <h2>{text('社交入口', 'Social shortcuts')}</h2>
            <div className="social-entry-list">
              <Link className="social-entry-link" to="/friends"><span className="social-entry-icon violet"><Users size={18} /></span><strong>{t('friends.myFriends')}</strong><ChevronRight size={15} /></Link>
              <Link className="social-entry-link" to="/notifications"><span className="social-entry-icon rose"><Bell size={18} /></span><strong>{t('notifications.title')}</strong><ChevronRight size={15} /></Link>
            </div>
          </section>
          <section className="social-card social-tips-card">
            <h2>{text('分享小提示', 'Sharing tips')}</h2>
            <div className="social-tips-list">
              <div className="social-tip"><span className="social-tip-icon mint"><PenLine size={17} /></span>{text('可以发布文字想法', 'Share written ideas')}</div>
              <div className="social-tip"><span className="social-tip-icon blue"><ImagePlus size={17} /></span>{text('最多添加 9 张图片', 'Add up to 9 images')}</div>
              <div className="social-tip"><span className="social-tip-icon amber"><FileText size={17} /></span>{text('可以引用自己的笔记', 'Quote one of your notes')}</div>
            </div>
          </section>
          <SocialPetCard title={text('小卷陪你分享', 'Share with Xiao Juan')} message={text('把想法说出来，也许会遇见新的连接～', 'Share an idea and discover a new connection~')} />
        </aside>
      </div>

      {quoteOpen && (
        <>
          <div className="social-modal-backdrop" onClick={() => setQuoteOpen(false)} />
          <section className="social-modal" role="dialog" aria-modal="true" aria-label={t('social.quoteNote')}>
            <h3>{t('social.quoteNote')}</h3>
            <div className="social-modal-search">
              <input value={quoteQuery} onChange={(e) => setQuoteQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleQuoteSearch() }} placeholder={t('social.searchNotePlaceholder')} />
              <button onClick={handleQuoteSearch} disabled={quoteSearching} aria-label={t('friends.search')}>{quoteSearching ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}</button>
            </div>
            <div className="social-modal-results">
              {quoteResults.map((note) => <button key={note.id} className="social-modal-result" onClick={() => { setQuoteNote(note); setQuoteOpen(false) }}><FileText size={14} /><span>{note.title}</span></button>)}
              {quoteResults.length === 0 && !quoteSearching && <div className="social-empty"><Lightbulb size={22} /><p>{t('social.noNotes')}</p></div>}
            </div>
          </section>
        </>
      )}

      <ConfirmDialog open={!!deleteTarget} onOpenChange={() => !deleting && setDeleteTarget(null)} title={t('social.deleteTitle')} message={t('social.deleteConfirm')} variant="danger" confirmText={t('social.delete')} onConfirm={handleConfirmDelete} />
    </SocialLayout>
  )
}
