import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  Circle,
  Flame,
  GraduationCap,
  Heart,
  MessageSquare,
  Sparkles,
  Star,
} from 'lucide-react'
import { useHabitStore, DAILY_TASKS, type TaskId } from '../stores/useHabitStore'
import { getPetLevel, LEVEL_THRESHOLDS, usePetStore } from '../stores/usePetStore'
import LearningLayout, { LearningHeader } from '../components/learning/LearningLayout'

const cloudArt = '/illustrations/study-cloud.png'

const TASK_META: Record<TaskId, { icon: typeof BookOpen; route: string; tone: string }> = {
  note: { icon: BookOpen, route: '/notes/new', tone: 'mint' },
  review: { icon: GraduationCap, route: '/review', tone: 'amber' },
  chat: { icon: MessageSquare, route: '/chat', tone: 'violet' },
}

export default function HabitPage() {
  const navigate = useNavigate()
  const { i18n, t } = useTranslation()
  const english = i18n.resolvedLanguage?.startsWith('en')
  const text = (zh: string, en: string) => english ? en : zh
  const noteStreak = useHabitStore((state) => state.noteStreak)
  const reviewStreak = useHabitStore((state) => state.reviewStreak)
  const taskDate = useHabitStore((state) => state.taskDate)
  const tasksDone = useHabitStore((state) => state.tasksDone)
  const affection = usePetStore((state) => state.affection)
  const nickname = usePetStore((state) => state.nickname)

  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const validStreakDates = [today.toDateString(), yesterday.toDateString()]
  const activeNoteStreak = validStreakDates.includes(noteStreak.lastDate) ? noteStreak.count : 0
  const activeReviewStreak = validStreakDates.includes(reviewStreak.lastDate) ? reviewStreak.count : 0
  const doneToday = taskDate === today.toDateString() ? tasksDone : []
  const doneCount = doneToday.length
  const allDone = doneCount >= DAILY_TASKS.length
  const progress = Math.min(100, doneCount / DAILY_TASKS.length * 100)

  const level = getPetLevel(affection)
  const previousLevel = level === 1 ? 0 : LEVEL_THRESHOLDS[level === 2 ? 1 : 2]
  const nextLevel = LEVEL_THRESHOLDS[level]
  const affectionProgress = level === 3 ? 100 : Math.max(0, Math.min(100, (affection - previousLevel) / (nextLevel - previousLevel) * 100))

  const labels: Record<TaskId, { title: string; description: string }> = {
    note: { title: text('记录一篇新笔记', 'Write a new note'), description: text('写下今天的想法或学习收获', 'Capture an idea or learning from today') },
    review: { title: text('完成一次回顾', 'Complete a review'), description: text('温习一条旧笔记，巩固记忆', 'Revisit a note and strengthen your memory') },
    chat: { title: text('与 AI 对话', 'Chat with AI'), description: text('向 AI 提出一个问题或整理思路', 'Ask a question or organize your thoughts') },
  }

  const summary = [
    { label: text('今日进度', 'Today'), value: `${doneCount} / ${DAILY_TASKS.length}`, icon: BarChart3, tone: 'violet' },
    { label: text('连续记录', 'Writing streak'), value: `${activeNoteStreak} ${text('天', 'days')}`, icon: CalendarDays, tone: 'mint' },
    { label: text('连续回顾', 'Review streak'), value: `${activeReviewStreak} ${text('天', 'days')}`, icon: Flame, tone: 'amber' },
    { label: text('当前好感度', 'Affection'), value: `${affection}`, icon: Heart, tone: 'rose' },
  ]

  return (
    <LearningLayout className="habit-page">
      <LearningHeader
        title={t('habit.title')}
        subtitle={text('每天完成一点点，知识就会慢慢长大', 'A little progress every day helps your knowledge grow')}
      />

      {allDone && (
        <div className="habit-celebration" role="status">
          <Sparkles size={18} /><strong>{t('habit.allDone')}</strong><span>{t('habit.rewardTip')}</span>
        </div>
      )}

      <section className="habit-hero">
        <div className="habit-hero-copy">
          <span className="learning-eyebrow"><Sparkles size={13} />{text('今日成长计划', 'Today’s growth plan')}</span>
          <h2>{allDone ? text('今天的目标全部完成啦', 'Every goal is complete today') : text('今天也向目标靠近了一步', 'One step closer to your goal')}</h2>
          <p>{text('完成每日小任务，培养稳定的学习节奏', 'Build a steady learning rhythm through small daily actions')}</p>
          <div className="habit-hero-progress"><span>{text('今日进度', 'Today')} <strong>{doneCount} / {DAILY_TASKS.length}</strong></span><div className="learning-progress"><i style={{ width: `${progress}%` }} /></div></div>
        </div>
        <div className="habit-hero-art"><img src={cloudArt} alt="" /><span className="habit-check-badge"><Check size={18} /></span></div>
      </section>

      <div className="habit-main-grid">
        <main className="habit-main-column">
          <section className="habit-summary-grid" aria-label={text('今日成长概览', 'Growth overview')}>
            {summary.map(({ label, value, icon: Icon, tone }) => (
              <article key={label} className="learning-card habit-summary-card">
                <div><span>{label}</span><strong>{value}</strong></div><span className={`learning-icon tone-${tone}`}><Icon size={22} /></span>
              </article>
            ))}
          </section>

          <section className="learning-card habit-tasks-card">
            <div className="learning-card-heading">
              <div><span>{text('每日三件小事', 'Three small actions')}</span><h2>{text('今天要完成的事', 'Today’s tasks')}</h2><p>{allDone ? text('全部完成，做得真棒！', 'All complete — wonderful work!') : text(`还差 ${DAILY_TASKS.length - doneCount} 项就全部完成啦`, `${DAILY_TASKS.length - doneCount} task left`)}</p></div>
              <small>{doneCount}/{DAILY_TASKS.length}</small>
            </div>
            <div className="habit-task-list">
              {DAILY_TASKS.map((task) => {
                const meta = TASK_META[task.id]
                const copy = labels[task.id]
                const done = doneToday.includes(task.id)
                const Icon = meta.icon
                return (
                  <button
                    type="button"
                    key={task.id}
                    className={`habit-task-row${done ? ' is-done' : ''}`}
                    onClick={() => navigate(meta.route)}
                  >
                    <span className={`learning-icon tone-${meta.tone}`}><Icon size={20} /></span>
                    <span className="habit-task-copy"><strong>{copy.title}</strong><small>{copy.description}</small></span>
                    <span className="habit-task-status">{done ? <><CheckCircle2 size={17} />{text('已完成', 'Done')}</> : <>{text('去完成', 'Start')}<ArrowRight size={17} /></>}</span>
                  </button>
                )
              })}
            </div>
            <div className="habit-task-footer">
              <div className="habit-segments" aria-hidden="true">{DAILY_TASKS.map((task) => <i key={task.id} className={doneToday.includes(task.id) ? 'is-done' : ''} />)}</div>
              <p><Heart size={13} />{t('habit.rewardTip')} · {t('habit.taskReset')}</p>
            </div>
          </section>
        </main>

        <aside className="habit-side-column">
          <section className="learning-card habit-streak-card">
            <div className="learning-card-heading"><div><span>{text('保持好节奏', 'Keep the rhythm')}</span><h2>{text('成长连续记录', 'Growth streaks')}</h2></div><Sparkles size={17} /></div>
            <div className="habit-streak-list">
              <div><span className="learning-icon tone-mint"><CalendarDays size={20} /></span><div><strong>{text('记录笔记', 'Write notes')}</strong><small>{text('当前', 'Current')} <em>{activeNoteStreak}</em> {text('天', 'days')}</small></div><p>{text('最佳', 'Best')} <strong>{noteStreak.best}</strong> {text('天', 'days')}</p></div>
              <div><span className="learning-icon tone-amber"><Flame size={20} /></span><div><strong>{text('每日回顾', 'Daily review')}</strong><small>{text('当前', 'Current')} <em>{activeReviewStreak}</em> {text('天', 'days')}</small></div><p>{text('最佳', 'Best')} <strong>{reviewStreak.best}</strong> {text('天', 'days')}</p></div>
            </div>
          </section>

          <section className="learning-card habit-companion-card">
            <div className="learning-card-heading"><div><span>{text('成长伙伴', 'Growth companion')}</span><h2>{nickname}{text('的心情', '’s mood')}</h2></div><Heart size={17} /></div>
            <div className="habit-companion-scene"><img src={cloudArt} alt="" /><p>{allDone ? text('今天的任务全部完成，你真的很棒！', 'You completed everything today — amazing!') : text('今天已经很努力啦，再完成一个任务吧～', 'You have worked hard. Let’s finish one more task!')}</p></div>
            <div className="habit-affection"><span><strong>{affection}</strong> / {level === 3 ? text('已满级', 'max') : nextLevel}</span><div className="learning-progress rose"><i style={{ width: `${affectionProgress}%` }} /></div></div>
            <button type="button" onClick={() => navigate('/pet')}>{text(`看看${nickname}`, `Visit ${nickname}`)}<ArrowRight size={15} /></button>
          </section>

          <section className="learning-card habit-reward-card">
            <span className="learning-icon tone-amber"><Star size={21} /></span>
            <div><strong>{text('今日奖励', 'Today’s reward')}</strong><p>{text('全部完成：额外获得成长鼓励', 'Complete all tasks for a growth bonus')}</p></div>
            {allDone ? <CheckCircle2 size={18} /> : <Circle size={18} />}
          </section>
        </aside>
      </div>
    </LearningLayout>
  )
}
