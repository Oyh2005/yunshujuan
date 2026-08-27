import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Rss,
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
} from 'lucide-react'
import { socialApi } from '../api/social'
import { notesApi } from '../api/notes'
import client from '../api/client'
import type { Note, Post, PostDetail } from '../types/api'
import { FadeIn } from '../components/common/motion'
import ConfirmDialog from '../components/common/ConfirmDialog'
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

function Avatar({ username, avatar, size = 36 }: { username: string; avatar: string | null; size?: number }) {
  return avatar ? (
    <img
      src={avatar}
      alt={username}
      className="rounded-full object-cover shrink-0"
      style={{ width: size, height: size }}
    />
  ) : (
    <div
      className="rounded-full bg-[var(--color-accent-bg)] text-[var(--color-accent)] font-medium flex items-center justify-center shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {username.slice(0, 1).toUpperCase()}
    </div>
  )
}

export default function SocialFeed() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [posts, setPosts] = useState<Post[]>([])
  const [nextCursor, setNextCursor] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
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
      })
      .catch(() => {
        if (!cancelled) toast.error(t('common.error'))
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
  const handleToggleLike = async (post: Post) => {
    try {
      const res = await socialApi.toggleLike(post.id)
      const liked = res.data?.liked
      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id
            ? { ...p, liked_by_me: liked, like_count: p.like_count + (liked ? 1 : -1) }
            : p
        )
      )
    } catch {
      toast.error(t('common.error'))
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

  return (
    <div className="max-w-2xl mx-auto py-8 px-6">
      <FadeIn>
        <h1 className="font-heading text-xl font-semibold text-[var(--color-text)] flex items-center gap-2 mb-6">
          <Rss size={22} className="text-[var(--color-accent)]" />
          {t('social.title')}
        </h1>

        {/* 发布框 */}
        <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-4 mb-6">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t('social.placeholder')}
            rows={3}
            className="w-full resize-none bg-transparent text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-placeholder)] focus:outline-none"
          />
          {images.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {images.map((url, i) => (
                <div key={`${url}-${i}`} className="relative">
                  <img src={url} alt="" className="w-20 h-20 object-cover rounded-lg border border-[var(--color-border)]" />
                  <button
                    onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                    className="absolute -top-1.5 -right-1.5 p-0.5 rounded-full bg-[var(--color-danger)] text-white shadow"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {quoteNote && (
            <div className="flex items-center gap-2 px-3 py-2 mb-3 rounded-lg bg-[var(--color-accent-bg)] text-[var(--color-accent)] text-xs">
              <Quote size={13} />
              <span className="truncate flex-1">{quoteNote.title}</span>
              <button onClick={() => setQuoteNote(null)} className="hover:opacity-70">
                <X size={13} />
              </button>
            </div>
          )}
          <div className="flex items-center justify-between pt-2 border-t border-[var(--color-border-light)]">
            <div className="flex items-center gap-1">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleFilesSelected(e.target.files)}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || images.length >= 9}
                className="p-2 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent-bg)] transition-colors disabled:opacity-40"
                title={t('social.addImage')}
              >
                {uploading ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
              </button>
              <button
                onClick={() => setQuoteOpen(true)}
                className="p-2 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent-bg)] transition-colors"
                title={t('social.quoteNote')}
              >
                <Quote size={16} />
              </button>
            </div>
            <button
              onClick={handlePublish}
              disabled={publishing || (!draft.trim() && images.length === 0)}
              className="primary-button"
            >
              {publishing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {t('social.publish')}
            </button>
          </div>
        </div>

        {/* 引用笔记弹窗 */}
        {quoteOpen && (
          <>
            <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setQuoteOpen(false)} />
            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-[var(--color-card)] rounded-lg shadow-xl p-5 w-[420px] max-w-[90vw] border border-[var(--color-border)]">
              <h3 className="text-sm font-medium text-[var(--color-text)] mb-3">{t('social.quoteNote')}</h3>
              <div className="flex items-center gap-2 mb-3">
                <input
                  value={quoteQuery}
                  onChange={(e) => setQuoteQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleQuoteSearch() }}
                  placeholder={t('social.searchNotePlaceholder')}
                  className="flex-1 px-3 py-2 text-sm rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                />
                <button
                  onClick={handleQuoteSearch}
                  disabled={quoteSearching}
                  className="p-2 rounded-md bg-[var(--color-accent)] text-[var(--color-accent-foreground)] disabled:opacity-50"
                >
                  {quoteSearching ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
                </button>
              </div>
              <div className="max-h-60 overflow-y-auto space-y-1">
                {quoteResults.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => { setQuoteNote(n); setQuoteOpen(false) }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-accent-bg)] transition-colors"
                  >
                    <FileText size={14} className="shrink-0 text-[var(--color-text-tertiary)]" />
                    <span className="truncate">{n.title}</span>
                  </button>
                ))}
                {quoteResults.length === 0 && !quoteSearching && (
                  <p className="py-6 text-center text-xs text-[var(--color-text-tertiary)]">{t('social.noNotes')}</p>
                )}
              </div>
            </div>
          </>
        )}

        {/* 动态列表 */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={22} className="animate-spin text-[var(--color-text-tertiary)]" />
          </div>
        ) : posts.length === 0 ? (
          <div className="py-16 text-center text-sm text-[var(--color-text-tertiary)]">{t('social.empty')}</div>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => {
              const detail = detailMap[post.id]
              const isMine = post.user_id === myUserId
              return (
                <div key={post.id} className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-4">
                  {/* 作者行 */}
                  <div className="flex items-center gap-3 mb-3">
                    <Avatar username={post.author.username} avatar={post.author.avatar} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--color-text)]">{post.author.username}</p>
                      <p className="text-[11px] text-[var(--color-text-tertiary)]">{formatTime(post.created_at)}</p>
                    </div>
                    {isMine && (
                      <button
                        onClick={() => setDeleteTarget(post)}
                        className="workspace-icon-button"
                        title={t('social.delete')}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>

                  {/* 内容 */}
                  {post.review_status === 'rejected' && (
                    <div className="flex items-center gap-2 px-3 py-2 mb-2 rounded-lg bg-[var(--color-danger-bg)] text-[var(--color-danger)] text-xs">
                      <ShieldAlert size={13} />
                      {t('social.reviewRejected')}
                    </div>
                  )}
                  <p className="text-sm text-[var(--color-text)] whitespace-pre-wrap leading-relaxed">{post.content}</p>

                  {/* 图片 */}
                  {post.images.length > 0 && (
                    <div className={`grid gap-2 mt-3 ${post.images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                      {post.images.map((url, i) => (
                        <img
                          key={`${url}-${i}`}
                          src={url}
                          alt=""
                          className="w-full rounded-lg object-cover max-h-72 border border-[var(--color-border)]"
                        />
                      ))}
                    </div>
                  )}

                  {/* 引用笔记 */}
                  {post.note_id && post.note_title && (
                    <button
                      onClick={() => navigate(`/notes/${post.note_id}`)}
                      className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--color-accent-bg)] text-[var(--color-accent)] text-xs hover:opacity-80 transition-opacity w-full text-left"
                    >
                      <FileText size={13} />
                      <span className="truncate">{post.note_title}</span>
                    </button>
                  )}

                  {/* 操作行 */}
                  <div className="flex items-center gap-1 mt-3 pt-3 border-t border-[var(--color-border-light)]">
                    <button
                      onClick={() => handleToggleLike(post)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                        post.liked_by_me
                          ? 'text-[var(--color-danger)] bg-[var(--color-danger-bg)]'
                          : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]'
                      }`}
                    >
                      <Heart size={14} fill={post.liked_by_me ? 'currentColor' : 'none'} />
                      {post.like_count > 0 ? post.like_count : t('social.like')}
                    </button>
                    <button
                      onClick={() => toggleComments(post.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                        detail
                          ? 'text-[var(--color-accent)] bg-[var(--color-accent-bg)]'
                          : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]'
                      }`}
                    >
                      <MessageCircle size={14} />
                      {post.comment_count > 0 ? post.comment_count : t('social.comment')}
                    </button>
                  </div>

                  {/* 评论区 */}
                  {detail && (
                    <div className="mt-3 pt-3 border-t border-[var(--color-border-light)] space-y-3">
                      {detail.comments.length === 0 && (
                        <p className="text-xs text-[var(--color-text-tertiary)] text-center py-2">{t('social.noComments')}</p>
                      )}
                      {detail.comments.map((c) => (
                        <div key={c.id} className="flex items-start gap-2.5">
                          <Avatar username={c.username} avatar={c.avatar} size={28} />
                          <div className="flex-1 min-w-0 bg-[var(--color-bg-secondary)] rounded-lg px-3 py-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-[var(--color-text)]">{c.username}</span>
                              <span className="text-[10px] text-[var(--color-text-tertiary)]">{formatTime(c.created_at)}</span>
                              {c.user_id === myUserId && (
                                <button
                                  onClick={() => handleDeleteComment(post.id, c.id)}
                                  className="ml-auto text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)]"
                                >
                                  <X size={12} />
                                </button>
                              )}
                            </div>
                            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5 whitespace-pre-wrap">{c.content}</p>
                          </div>
                        </div>
                      ))}
                      <div className="flex items-center gap-2">
                        <input
                          value={commentDrafts[post.id] ?? ''}
                          onChange={(e) => setCommentDrafts((prev) => ({ ...prev, [post.id]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleSendComment(post.id) }}
                          placeholder={t('social.commentPlaceholder')}
                          className="flex-1 px-3 py-2 text-xs rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] placeholder:text-[var(--color-text-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                        />
                        <button
                          onClick={() => handleSendComment(post.id)}
                          disabled={commentingId === post.id || !(commentDrafts[post.id] ?? '').trim()}
                          className="p-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-accent-foreground)] disabled:opacity-40"
                        >
                          {commentingId === post.id ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            {/* 加载更多 */}
            {nextCursor && (
              <div className="text-center pt-2">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="secondary-button"
                >
                  {loadingMore ? t('common.loading') : t('social.loadMore')}
                </button>
              </div>
            )}
          </div>
        )}

        <ConfirmDialog
          open={!!deleteTarget}
          onOpenChange={() => !deleting && setDeleteTarget(null)}
          title={t('social.deleteTitle')}
          message={t('social.deleteConfirm')}
          variant="danger"
          confirmText={t('social.delete')}
          onConfirm={handleConfirmDelete}
        />
      </FadeIn>
    </div>
  )
}
