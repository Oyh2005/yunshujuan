import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Bell, BookOpen, Check, ChevronRight, Circle, FileText, Flame, Heart, Library, Network, Plus, RefreshCw, Search, Settings, Sparkles, Upload, X } from 'lucide-react'
import { notesApi } from '../api/notes'
import { knowledgeApi } from '../api/knowledge'
import { reviewApi } from '../api/review'
import { statsApi, type PeriodBlock } from '../api/stats'
import { useUserStore } from '../stores/useUserStore'
import { getPetLevel, LEVEL_THRESHOLDS, usePetStore } from '../stores/usePetStore'
import { useHabitStore } from '../stores/useHabitStore'
import { getCharacter } from '../components/pet/characters/registry'
import { notePreview } from '../components/note/notePresentation'
import type { GraphData, KnowledgeDocument, NoteListResponse, ReviewListData } from '../types/api'
import '../styles/dashboard.css'

const cloudArt = '/illustrations/study-cloud.png'
const positions = [[22, 24], [67, 18], [84, 48], [70, 82], [29, 82], [12, 52]]
// 周报订阅/已读状态（localStorage；跨周检测用，无定时任务依赖）
const WEEKLY_SUB_KEY = 'weekly_report_subscribed'
const WEEKLY_SEEN_KEY = 'weekly_report_seen'

function growthBadge(current: number, previous: number): { up: boolean; label: string } | null {
  if (previous > 0) {
    const pct = Math.round(((current - previous) / previous) * 100)
    return { up: pct >= 0, label: pct === 0 ? 'FLAT' : `${pct > 0 ? '+' : ''}${pct}%` }
  }
  return current > 0 ? { up: true, label: 'NEW' } : null
}

export default function Dashboard() {
  const { i18n } = useTranslation()
  const english = i18n.resolvedLanguage?.startsWith('en')
  const text = (zh: string, en: string) => english ? en : zh
  const user = useUserStore((s) => s.userInfo)
  const nickname = usePetStore((s) => s.nickname)
  const affection = usePetStore((s) => s.affection)
  const characterId = usePetStore((s) => s.characterId)
  const streak = useHabitStore((s) => s.noteStreak)
  const taskDate = useHabitStore((s) => s.taskDate)
  const tasksDone = useHabitStore((s) => s.tasksDone)
  const [notes, setNotes] = useState<NoteListResponse | null>(null)
  const [documents, setDocuments] = useState<{ documents: KnowledgeDocument[]; total_count: number } | null>(null)
  const [graph, setGraph] = useState<GraphData | null>(null)
  const [review, setReview] = useState<ReviewListData | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState<boolean | 'rate'>(false)
  const [reload, setReload] = useState(0)
  const [tab, setTab] = useState<'all' | 'note' | 'document'>('all')
  const [period, setPeriod] = useState<{ week: PeriodBlock; month: PeriodBlock } | null>(null)
  const [subscribed, setSubscribed] = useState(() => {
    try { return localStorage.getItem(WEEKLY_SUB_KEY) === '1' } catch { return false }
  })
  const [showWeeklyBanner, setShowWeeklyBanner] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.allSettled([
      notesApi.list({ page: 1, page_size: 20, sort_by: 'updated_at' }),
      knowledgeApi.list(), notesApi.graph({ include_semantic: false }), reviewApi.today(),
      // 周报/月报聚合：增强功能，失败不影响页面其他数据（不参与 failed 判定）
      statsApi.period(),
    ]).then(([noteResult, docResult, graphResult, reviewResult, periodResult]) => {
      if (cancelled) return
      setNotes(noteResult.status === 'fulfilled' ? noteResult.value.data : null)
      setDocuments(docResult.status === 'fulfilled' ? docResult.value.data : null)
      setGraph(graphResult.status === 'fulfilled' ? graphResult.value.data : null)
      setReview(reviewResult.status === 'fulfilled' ? reviewResult.value : null)
      setPeriod(periodResult.status === 'fulfilled' ? periodResult.value.data : null)
      const results = [noteResult, docResult, graphResult, reviewResult]
      const anyRejected = results.some((result) => result.status === 'rejected')
      const rateLimited = results.some((result) =>
        result.status === 'rejected' && (result.reason as { response?: { status?: number } })?.response?.status === 429)
      setFailed(rateLimited ? 'rate' : anyRejected)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [reload])

  // 周报订阅提醒：每周首次打开首页且上周有数据时显示横幅（跨周检测，无定时任务）
  useEffect(() => {
    if (!period || !subscribed) return
    const timer = window.setTimeout(() => {
      try {
        const monday = new Date()
        monday.setHours(0, 0, 0, 0)
        monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
        const lastSeen = localStorage.getItem(WEEKLY_SEEN_KEY)
        const hasPrevWeek = period.week.prev_notes > 0 || period.week.prev_chars > 0 || period.week.prev_reviews > 0
        if (hasPrevWeek && (!lastSeen || Date.parse(lastSeen) < monday.getTime())) setShowWeeklyBanner(true)
      } catch { /* localStorage 不可用时静默 */ }
    }, 0)
    return () => window.clearTimeout(timer)
  }, [period, subscribed])

  const toggleSubscribe = () => {
    const next = !subscribed
    try { localStorage.setItem(WEEKLY_SUB_KEY, next ? '1' : '0') } catch { /* ignore */ }
    setSubscribed(next)
  }
  const dismissWeeklyBanner = () => {
    try { localStorage.setItem(WEEKLY_SEEN_KEY, new Date().toISOString()) } catch { /* ignore */ }
    setShowWeeklyBanner(false)
  }
  const formatChars = (value: number) => value >= 10000 ? `${(value / 10000).toFixed(1)}w` : value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value)

  const level = getPetLevel(affection)
  const previousLevel = level === 1 ? 0 : LEVEL_THRESHOLDS[level === 2 ? 1 : 2]
  const nextLevel = LEVEL_THRESHOLDS[level]
  const growth = level === 3 ? 100 : Math.max(0, Math.min(100, (affection - previousLevel) / (nextLevel - previousLevel) * 100))
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const streakCount = [today.toDateString(), yesterday.toDateString()].includes(streak.lastDate) ? streak.count : 0
  const completed = taskDate === today.toDateString() ? tasksDone : []
  const rows = [
    ...(notes?.notes || []).map((note) => ({ id: note.id, kind: 'note' as const, title: note.title || text('未命名笔记', 'Untitled note'), description: notePreview(note.content) || text('一页空白，等待新的灵感', 'A fresh page for your next idea'), date: note.updated_at, to: `/notes/${note.id}`, detail: (note.tags ?? []).slice(0, 2).join(' · ') })),
    ...(documents?.documents || []).map((doc) => ({ id: doc.id, kind: 'document' as const, title: doc.filename, description: text('已加入知识库', 'In your knowledge base'), date: doc.created_at, to: '/knowledge', detail: `${doc.chunk_count} ${text('个知识片段', 'fragments')}` })),
  ].filter((row) => tab === 'all' || row.kind === tab).sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0)).slice(0, 3)
  const graphNodes = (graph?.nodes || []).slice(0, 6)
  const graphPositions = new Map(graphNodes.map((node, index) => [node.id, positions[index]]))
  const graphLinks = (graph?.links || []).filter((link) => graphPositions.has(link.source) && graphPositions.has(link.target))
  const Character = getCharacter(characterId).Renderer
  const tasks = [
    { id: 'note' as const, label: text('记录一篇新笔记', 'Write a new note'), to: '/notes/new' },
    { id: 'review' as const, label: text('回顾学过的知识', 'Review your knowledge'), to: '/review' },
    { id: 'chat' as const, label: text('和 AI 探讨一个问题', 'Explore a question with AI'), to: '/chat' },
  ]
  const formatDate = (value: string) => {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(english ? 'en-US' : 'zh-CN', { month: 'short', day: 'numeric' })
  }

  return (
    <div className="dashboard">
      <header className="dashboard-topbar">
        <div className="dashboard-greeting">{text('欢迎回来', 'Welcome back')}<span>{user?.username || text('知识探索者', 'Explorer')}</span></div>
        <button className="dashboard-search" onClick={() => window.dispatchEvent(new Event('open-command-palette'))}>
          <Search size={18} /><span>{text('搜索笔记，或快速前往你的知识空间…', 'Search notes or jump to your workspace…')}</span><kbd>⌘ K</kbd>
        </button>
        <div className="dashboard-top-actions"><Link to="/notifications" className="dashboard-icon-button" aria-label={text('通知', 'Notifications')}><Bell size={21} /></Link><Link to="/profile" className="dashboard-profile" aria-label={text('个人信息', 'Profile')}>{user?.username?.slice(0, 1) || <CloudAvatar />}</Link></div>
      </header>

      {failed && <div className="dashboard-error" role="alert">{failed === 'rate' ? text('请求过于频繁，请稍后再试。', 'Too many requests, please try again later.') : text('部分数据暂时未能加载，其他功能可以正常使用。', 'Some data could not be loaded. Your other tools are still available.')}<button disabled={loading} onClick={() => { setLoading(true); setReload((value) => value + 1) }}><RefreshCw size={14} />{text('重试', 'Retry')}</button></div>}

      {showWeeklyBanner && period && (
        <div className="dashboard-banner" role="status">
          <Bell size={16} />
          <span>{text(`上周你写了 ${period.week.prev_notes} 篇笔记、${formatChars(period.week.prev_chars)} 字，本周继续加油！`, `Last week: ${period.week.prev_notes} notes · ${formatChars(period.week.prev_chars)} chars. Keep the momentum!`)}</span>
          <Link to="/stats" onClick={dismissWeeklyBanner}>{text('查看统计', 'View stats')}</Link>
          <button onClick={dismissWeeklyBanner} aria-label={text('关闭提醒', 'Dismiss')}><X size={14} /></button>
        </div>
      )}

      <div className="dashboard-grid">
        <div className="dashboard-main">
          <section className="dashboard-hero">
            <div className="dashboard-hero-glow" aria-hidden="true" />
            <div className="dashboard-hero-copy">
              <span className="dashboard-eyebrow"><Sparkles size={14} />{text('每一点灵感，都值得被珍藏', 'A LITTLE SPACE FOR BIG IDEAS')}</span>
              <h1>{text('让你的知识，', 'Let your ideas')}<br />{text('慢慢', 'grow ')}<em>{text('连接起来', 'together.')}</em></h1>
              <p>{text('记录灵感，沉淀思考。', 'Capture inspiration. Make room to think. ')}{text('让 AI 帮你理解和串联每一份知识。', 'Let AI connect the dots in your knowledge.')}</p>
              <div className="dashboard-hero-actions"><Link className="dashboard-primary" to="/notes/new"><Plus size={18} />{text('新建笔记', 'New note')}</Link><Link className="dashboard-secondary" to="/chat">{text('问问知识库', 'Ask your knowledge')}<ArrowRight size={17} /></Link></div>
            </div>
            <div className="dashboard-hero-art" aria-hidden="true"><div className="dashboard-orbit orbit-one" /><div className="dashboard-orbit orbit-two" /><span className="dashboard-floating-token token-note"><FileText size={25} /></span><span className="dashboard-floating-token token-ai"><Sparkles size={21} /></span><img src={cloudArt} alt="" fetchPriority="high" /><span className="dashboard-art-caption"><span />{text('灵感正在生长', 'Ideas are growing')}</span></div>
          </section>

          <nav className="dashboard-quick-actions" aria-label={text('快捷操作', 'Quick actions')}>
            {[
              { to: '/notes/new', icon: FileText, title: text('写点什么', 'Write something'), sub: text('留住此刻的灵感', 'Capture a little inspiration'), tone: 'purple' },
              { to: '/knowledge', icon: Upload, title: text('上传资料', 'Add resources'), sub: text('丰富你的知识库', 'Grow your library'), tone: 'blue' },
              { to: '/chat', icon: Sparkles, title: text('问问 AI', 'Ask AI'), sub: text('让理解再深一点', 'Find a fresh perspective'), tone: 'pink' },
              { to: '/graph', icon: Network, title: text('探索图谱', 'Explore connections'), sub: text('发现知识的联系', 'See how ideas connect'), tone: 'mint' },
            ].map(({ to, icon: Icon, title, sub, tone }) => <Link key={to} to={to} className={`dashboard-quick ${tone}`}><span className="dashboard-quick-icon"><Icon size={21} /></span><span><strong>{title}</strong><small>{sub}</small></span><ChevronRight size={15} /></Link>)}
          </nav>

          <section className="dashboard-recents" aria-labelledby="recent-title">
            <div className="dashboard-section-heading"><h2 id="recent-title">{text('最近的记录', 'Recent activity')}</h2><div className="dashboard-tabs" role="group" aria-label={text('记录类型', 'Record type')}>{(['all', 'note', 'document'] as const).map((value, index) => <button key={value} aria-pressed={tab === value} className={tab === value ? 'active' : ''} onClick={() => setTab(value)}>{[text('全部', 'All'), text('笔记', 'Notes'), text('资料', 'Resources')][index]}</button>)}</div><Link to={tab === 'document' ? '/knowledge' : '/notes'}>{text('查看全部', 'View all')}<ArrowRight size={15} /></Link></div>
            <div className="dashboard-records" aria-busy={loading}>
              {loading ? <div className="dashboard-skeleton" aria-label={text('正在加载记录', 'Loading records')}>{[0, 1, 2].map((n) => <div key={n} />)}</div> : rows.length ? rows.map((row) => <Link to={row.to} className="dashboard-record" key={`${row.kind}-${row.id}`}><span className={`dashboard-file-icon ${row.kind}`}><FileText size={23} /></span><span className="dashboard-record-copy"><span><strong>{row.title}</strong><b>{row.kind === 'note' ? text('笔记', 'Note') : text('资料', 'Resource')}</b></span><small>{row.description}</small></span><span className={`dashboard-record-meta ${row.kind}`}>{row.detail || text('继续阅读', 'Continue reading')}</span><time dateTime={row.date}>{formatDate(row.date)}</time><ChevronRight size={16} /></Link>) : <div className="dashboard-empty"><span className="dashboard-empty-icon"><BookOpen size={30} /></span><strong>{text('你的知识故事，从这里开始', 'Your knowledge story starts here')}</strong><p>{text('写下第一个想法，或上传一份想读懂的资料。', 'Capture a first thought, or add something you want to learn.')}</p><Link to={tab === 'document' ? '/knowledge' : '/notes/new'}>{tab === 'document' ? text('上传第一份资料', 'Add your first resource') : text('创建第一篇笔记', 'Create your first note')}<ArrowRight size={15} /></Link></div>}
            </div>
          </section>

          <section className="dashboard-graph" aria-labelledby="graph-title">
            <div className="dashboard-section-heading"><div><h2 id="graph-title">{text('我的知识图谱', 'Your connected knowledge')}</h2><p>{graph?.nodes.length ? text(`${graph.nodes.length} 个知识节点，${graph.links.length} 条真实关联`, `${graph.nodes.length} nodes · ${graph.links.length} connections`) : text('每一次记录，都是下一次发现的起点', 'Every note is the start of a new discovery')}</p></div><Link to="/graph" aria-label={text('打开完整知识图谱', 'Open full knowledge graph')}><Network size={19} /></Link></div>
            <div className="dashboard-network">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{graphLinks.map((link, index) => { const a = graphPositions.get(link.source)!; const b = graphPositions.get(link.target)!; return <line key={index} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} /> })}</svg>
              <Link to="/graph" className="dashboard-network-center" aria-label={text('进入图谱', 'Explore graph')}><BookOpen size={30} /></Link>
              {graphNodes.map((node, index) => <Link to={`/notes/${node.id}`} key={node.id} className={`dashboard-network-node tone-${index % 3}`} style={{ left: `${positions[index][0]}%`, top: `${positions[index][1]}%` }}><FileText size={14} /><span>{node.title || text('未命名笔记', 'Untitled')}</span></Link>)}
              {!graphNodes.length && <p className="dashboard-network-empty">{loading ? text('正在寻找知识之间的联系…', 'Finding connections…') : graph === null ? text('图谱暂时不可用，可稍后重试', 'Graph unavailable. Please try again.') : text('添加笔记，种下第一颗知识的种子', 'Add a note and plant your first seed of knowledge')}</p>}
              <Link to="/graph" className="dashboard-graph-cta">{text('进入图谱分析', 'Explore your graph')}<ArrowRight size={17} /></Link>
            </div>
            <div className="dashboard-knowledge-counts"><span><FileText size={14} /><b>{notes?.total_count ?? '—'}</b>{text('篇笔记', 'notes')}</span><span><Library size={14} /><b>{documents?.total_count ?? '—'}</b>{text('份资料', 'resources')}</span><span><Network size={14} /><b>{graph?.links.length ?? '—'}</b>{text('条关联', 'connections')}</span></div>
          </section>
        </div>

        <aside className="dashboard-rail" aria-label={text('学习与成长', 'Learning and growth')}>
          <section className="dashboard-companion">
            <div className="dashboard-companion-heading"><h2>{text('我的页宠', 'My companion')}</h2><Link to="/pet" className="dashboard-icon-button" aria-label={text('页宠设置', 'Companion settings')}><Settings size={18} /></Link></div>
            <div className="dashboard-pet-scene"><div className="dashboard-pet-speech">{text('你好呀～', 'Hello there!')}<br />{completed.length ? text('你今天的每一份努力，我都有看到！', 'I see every little effort you make!') : text('今天也一起收集灵感吧！', 'Let’s collect a little inspiration today!')}</div>{characterId === 'cloud' ? <img src={cloudArt} alt={nickname} /> : <div className="dashboard-custom-pet"><Character mood="happy" level={level} /></div>}<span className="dashboard-scene-sparkle">✧</span></div>
            <div className="dashboard-pet-details"><div><h3>{nickname}</h3><span>Lv.{level}</span><Link to="/pet" aria-label={text('管理我的页宠', 'Manage companion')}><ChevronRight size={17} /></Link></div><div className="dashboard-growth-track" role="progressbar" aria-label={text('页宠成长进度', 'Companion growth')} aria-valuenow={Math.round(growth)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${growth}%` }} /></div><small>{level === 3 ? text('已到达最高成长阶段', 'Fully grown, always learning') : text(`好感度 ${affection} / ${nextLevel} · 陪伴中慢慢成长`, `Affection ${affection} / ${nextLevel} · Growing together`)}</small></div>
            <Link className="dashboard-affection" to="/pet"><span><Heart size={19} /></span><div><strong>{text('每一次陪伴，都算数', 'Little moments matter')}</strong><small>{text('记录、回顾，让我们一起成长', 'Write, review, and grow together')}</small></div><ChevronRight size={16} /></Link>
          </section>

          <div className="dashboard-period">
            <div className="dashboard-period-bar">
              <h2>{text('最近积累', 'Recent progress')}</h2>
              <button className={subscribed ? 'is-on' : ''} onClick={toggleSubscribe} aria-pressed={subscribed} title={text('开启后每周首次打开首页提醒查看上周数据', 'Remind you of last week\u2019s progress on the first visit each week')}>
                <Bell size={13} />{text(subscribed ? '周报提醒已开' : '订阅周报提醒', subscribed ? 'Weekly reminder on' : 'Subscribe to weekly report')}
              </button>
            </div>
            <div className="dashboard-period-grid">
              {([{ key: 'week', title: text('本周概览', 'This week'), block: period?.week }, { key: 'month', title: text('本月概览', 'This month'), block: period?.month }] as const).map(({ key, title, block }) => {
                const rows = [
                  { label: text('笔记', 'Notes'), value: block?.notes, prev: block?.prev_notes },
                  { label: text('字数', 'Chars'), value: block?.chars, prev: block?.prev_chars },
                  { label: text('回顾', 'Reviews'), value: block?.reviews, prev: block?.prev_reviews },
                ]
                return (
                  <section key={key} className="dashboard-period-card" aria-label={title}>
                    <h3>{title}</h3>
                    <ul>
                      {rows.map((row) => {
                        const badge = row.value !== undefined && row.prev !== undefined ? growthBadge(row.value, row.prev) : null
                        const badgeLabel = badge?.label === 'FLAT' ? text('持平', 'Flat') : badge?.label === 'NEW' ? text('新增', 'New') : badge?.label
                        return (
                          <li key={row.label}>
                            <span>{row.label}</span>
                            <strong>{row.value === undefined ? '—' : row.label === text('字数', 'Chars') ? formatChars(row.value) : row.value}</strong>
                            {badge && <em className={badge.up ? 'up' : 'down'}>{badgeLabel}</em>}
                          </li>
                        )
                      })}
                    </ul>
                    <Link className="dashboard-period-link" to="/stats">{text('查看统计', 'View stats')}<ArrowRight size={13} /></Link>
                  </section>
                )
              })}
            </div>
          </div>

          <div className="dashboard-learning-cards">
            <section className="dashboard-review"><span className="dashboard-card-kicker">DAILY REVIEW</span><h2>{text('温故，知新', 'A fresh look back')}</h2><p>{review ? text(`今天有 ${review.total_count} 篇笔记等待回顾`, `${review.total_count} notes to revisit today`) : text('回到那些值得记住的想法', 'Return to ideas worth remembering')}</p><BookOpen size={43} className="dashboard-review-book" /><Link to="/review">{text('去回顾', 'Review')}<ArrowRight size={15} /></Link></section>
            <section className="dashboard-tasks"><div><h2>{text('今日小目标', 'Today’s little goals')}</h2><span>{completed.length} / 3</span></div><ul>{tasks.map((task) => <li key={task.id}><Link to={task.to}><span className={completed.includes(task.id) ? 'done' : ''}>{completed.includes(task.id) ? <Check size={11} /> : <Circle size={15} />}</span>{task.label}</Link></li>)}</ul><p>{text('每天一点点，就很了不起', 'A little each day goes a long way')}</p></section>
          </div>
          <Link className="dashboard-streak" to="/habit"><span className="dashboard-streak-fire"><Flame size={30} fill="currentColor" /></span><div><strong>{streakCount ? text(`连续记录 ${streakCount} 天`, `${streakCount}-day writing streak`) : text('点亮今天的小火花', 'Start a little spark today')}</strong><small>{text('把微小的坚持，变成闪光的日常', 'Small steps make a brighter everyday')}</small></div><ChevronRight size={17} /></Link>
          <div className="dashboard-footer-note"><Sparkles size={13} />{text('不必一次懂得很多，每天懂得一点就好。', 'You don’t need to know it all. Just a little more each day.')}</div>
        </aside>
      </div>
    </div>
  )
}

function CloudAvatar() { return <BookOpen size={20} /> }
