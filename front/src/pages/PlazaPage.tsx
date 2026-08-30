import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Eye, Trophy, Plus, ArrowRight } from 'lucide-react'
import { socialApi } from '../api/social'
import { statsApi } from '../api/stats'
import type { LeaderboardData, LeaderboardItem, PlazaNote } from '../types/api'
import KnowledgeLayout, { KnowledgeHeader } from '../components/knowledge/KnowledgeLayout'
import { notePreview } from '../components/note/notePresentation'

type Rank = keyof LeaderboardData
const rankKeys: Rank[] = ['writing', 'review', 'streak']
const rankTitles = { writing: 'plaza.rankWriting', review: 'plaza.rankReview', streak: 'plaza.rankStreak' }
const rankUnits = { writing: 'plaza.unitChars', review: 'plaza.unitTimes', streak: 'plaza.unitDays' }
function RankList({ items, unit }: { items: LeaderboardItem[]; unit: string }) {
  const { t } = useTranslation()
  if (!items.length) return <p className="knowledge-footnote">{t('plaza.noRank')}</p>
  return <ol className="knowledge-rank-list">{items.map((item, index) => <li key={item.user_id}>
    <span>{index + 1}</span><Link to={'/user/' + item.user_id}><span className="knowledge-avatar">{item.avatar ? <img src={item.avatar} alt="" loading="lazy" /> : item.username.slice(0, 1)}</span><span>{item.username}</span></Link><small><b>{item.value.toLocaleString()}</b> {unit}</small>
  </li>)}</ol>
}

export default function PlazaPage() {
  const { t, i18n } = useTranslation()
  const [tab, setTab] = useState<'notes' | 'rank'>('notes')
  const [rank, setRank] = useState<Rank>('writing')
  const [notes, setNotes] = useState<PlazaNote[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<boolean | 'rate'>(false)
  const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null)
  const [rankLoading, setRankLoading] = useState(true)
  const [rankError, setRankError] = useState<boolean | 'rate'>(false)
  const mounted = useRef(false)
  const noteRequest = useRef(0)
  const rankRequest = useRef(0)
  const notesBusy = useRef(false)

  const loadNotes = useCallback(async (nextPage = 1) => {
    if (notesBusy.current) return
    notesBusy.current = true
    const request = ++noteRequest.current
    if (nextPage === 1) setLoading(true)
    else setLoadingMore(true)
    setError(false)
    try {
      const res = await socialApi.plaza(nextPage)
      if (!mounted.current || request !== noteRequest.current) return
      setNotes((prev) => nextPage === 1 ? res.data.notes : [...prev, ...res.data.notes.filter((note) => !prev.some((item) => item.id === note.id))])
      setPage(nextPage)
      setHasMore(res.data.has_more)
    } catch (err) {
      if (mounted.current && request === noteRequest.current) {
        setError((err as { response?: { status?: number } })?.response?.status === 429 ? 'rate' : true)
      }
    } finally {
      if (mounted.current && request === noteRequest.current) { setLoading(false); setLoadingMore(false); notesBusy.current = false }
    }
  }, [])

  const loadRanks = useCallback(async () => {
    const request = ++rankRequest.current
    setRankLoading(true)
    setRankError(false)
    try {
      const res = await statsApi.leaderboard()
      if (mounted.current && request === rankRequest.current) setLeaderboard(res.data)
    } catch (err) {
      if (mounted.current && request === rankRequest.current) {
        setRankError((err as { response?: { status?: number } })?.response?.status === 429 ? 'rate' : true)
      }
    } finally {
      if (mounted.current && request === rankRequest.current) setRankLoading(false)
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    const notesVersion = noteRequest, ranksVersion = rankRequest
    const timer = window.setTimeout(() => { void loadNotes(); void loadRanks() }, 0)
    return () => { mounted.current = false; notesBusy.current = false; notesVersion.current++; ranksVersion.current++; window.clearTimeout(timer) }
  }, [loadNotes, loadRanks])

  const locale = i18n.resolvedLanguage === 'en-US' ? 'en-US' : 'zh-CN'
  const formatTime = (value: string | null) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString(locale, { month: 'short', day: 'numeric' }) : ''
  const rankStatus = rankError ? <div className="knowledge-alert" role="alert"><span>{rankError === 'rate' ? t('common.rateLimited') : t('knowledgeUI.rankError')}</span><button className="knowledge-text-link" onClick={() => void loadRanks()}>{t('common.retry')}</button></div> : rankLoading ? <p className="knowledge-footnote" role="status">{t('common.loading')}</p> : null
  return <KnowledgeLayout>
    <KnowledgeHeader title={t('plaza.title')} subtitle={t('knowledgeUI.plazaSubtitle')} hero actions={<Link to="/notes/new" className="primary-button"><Plus size={17} />{t('note.newNote')}</Link>} />
    <div className="knowledge-toolbar"><div className="knowledge-filters" role="group" aria-label={t('plaza.title')}>
      <button aria-pressed={tab === 'notes'} onClick={() => setTab('notes')}>{t('plaza.tabNotes')}</button><button aria-pressed={tab === 'rank'} onClick={() => setTab('rank')}><Trophy size={14} className="inline mr-1" />{t('plaza.tabRank')}</button>
    </div><span className="knowledge-footnote !pt-0">{t('knowledgeUI.publicOnly')}</span></div>
    {tab === 'notes' ? <div className="knowledge-plaza-layout">
      <div>
        {error && <div className="knowledge-alert" role="alert"><span>{error === 'rate' ? t('common.rateLimited') : t('knowledgeUI.loadError')}</span><button className="secondary-button" onClick={() => void loadNotes(notes.length ? page + 1 : 1)}>{t('common.retry')}</button></div>}
        {loading ? <div role="status" aria-label={t('common.loading')} className="knowledge-plaza-grid">{[1, 2, 3, 4].map((i) => <div className="h-64 rounded-2xl animate-pulse bg-[var(--color-bg-secondary)]" key={i} />)}</div>
          : notes.length === 0 && !error ? <div className="knowledge-panel knowledge-empty"><img src="/illustrations/study-cloud.png" alt="" /><p>{t('plaza.empty')}</p><Link to="/notes" className="knowledge-text-link">{t('knowledgeUI.myNotes')}<ArrowRight size={16} /></Link></div>
          : <div className="knowledge-plaza-grid">{notes.map((note) => <article className="knowledge-public-note" key={note.id}>
            <Link className="knowledge-public-author" to={'/user/' + note.author.user_id}><span className="knowledge-avatar">{note.author.avatar ? <img src={note.author.avatar} alt="" loading="lazy" /> : note.author.username.slice(0, 1)}</span><span>{note.author.username}</span></Link>
            <Link className="knowledge-public-body" to={'/share/' + note.id}><h2>{note.title || t('note.ui.untitled')}</h2><p>{notePreview(note.content_preview || '')}</p></Link>
            <div className="flex flex-wrap gap-2">{note.category && <span className="knowledge-badge">{t('note.ui.categories.' + note.category, { defaultValue: note.category })}</span>}{(note.tags ?? []).slice(0, 2).map((tag, index) => <span className="knowledge-badge ready" key={tag + index}>{tag}</span>)}</div>
            <div className="knowledge-public-footer"><time>{formatTime(note.updated_at)}</time><span><Eye size={13} />{t('knowledgeUI.views', { count: note.view_count })}</span></div>
          </article>)}</div>}
        {hasMore && <div className="text-center pt-5"><button className="secondary-button" disabled={loadingMore} onClick={() => void loadNotes(page + 1)}>{t(loadingMore ? 'common.loading' : 'plaza.loadMore')}</button></div>}
      </div>
      <aside className="knowledge-plaza-aside"><section className="knowledge-panel"><h2><Trophy size={17} className="inline mr-2 text-[var(--color-accent)]" />{t('knowledgeUI.learningRank')}</h2>
        <div className="knowledge-rank-tabs" role="group" aria-label={t('knowledgeUI.learningRank')}>{rankKeys.map((key) => <button key={key} aria-pressed={rank === key} onClick={() => setRank(key)}>{t('knowledgeUI.rank.' + key)}</button>)}</div>
        <p className="knowledge-footnote !pt-0 !pb-2">{t(rankTitles[rank])}</p>{rankStatus}{!rankLoading && !rankError && <RankList items={(leaderboard?.[rank] ?? []).slice(0, 5)} unit={t(rankUnits[rank])} />}
        <button className="knowledge-text-link mt-3" onClick={() => setTab('rank')}>{t('knowledgeUI.allRanks')}<ArrowRight size={15} /></button>
      </section><div className="knowledge-helper"><img src="/illustrations/study-cloud.png" alt="" /><div><strong>{t('knowledgeUI.shareTitle')}</strong><p>{t('knowledgeUI.shareHint')}</p><Link className="knowledge-text-link mt-2" to="/notes">{t('knowledgeUI.myNotes')}<ArrowRight size={15} /></Link></div></div></aside>
    </div> : <>{rankStatus}{!rankLoading && !rankError && <div className="knowledge-rank-all">{rankKeys.map((key) => <section className="knowledge-panel" key={key}><h2>{t(rankTitles[key])}</h2><RankList items={leaderboard?.[key] ?? []} unit={t(rankUnits[key])} /></section>)}</div>}<p className="knowledge-footnote">{t('plaza.rankHint')}</p></>}
  </KnowledgeLayout>
}
