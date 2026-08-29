import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  Circle,
  Flame,
  GraduationCap,
  RefreshCw,
  Sparkles,
  XCircle,
} from 'lucide-react'
import { reviewApi } from '../api/review'
import type { ReviewItem, ReviewQuestion } from '../types/api'
import { usePetStore } from '../stores/usePetStore'
import { useHabitStore } from '../stores/useHabitStore'
import LearningLayout, { LearningHeader } from '../components/learning/LearningLayout'

const cloudArt = '/illustrations/study-cloud.png'

export default function DailyReview() {
  const { i18n, t } = useTranslation()
  const english = i18n.resolvedLanguage?.startsWith('en')
  const text = (zh: string, en: string) => english ? en : zh
  const reviewStreak = useHabitStore((state) => state.reviewStreak)
  const nickname = usePetStore((state) => state.nickname)
  const [items, setItems] = useState<ReviewItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [quizNotes, setQuizNotes] = useState<Record<string, ReviewQuestion>>({})
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null)
  const [showResult, setShowResult] = useState(false)
  const [doneCount, setDoneCount] = useState(0)
  const [completed, setCompleted] = useState(false)
  const [questionLoading, setQuestionLoading] = useState(false)

  const applyReviews = (data: { reviews?: ReviewItem[] } | null | undefined) => {
    setItems(data?.reviews ?? [])
    setCurrentIndex(0)
    setDoneCount(0)
    setCompleted(false)
    setSelectedAnswer(null)
    setShowResult(false)
    setQuizNotes({})
  }

  const loadReviews = async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const data = await reviewApi.today()
      applyReviews(data)
    } catch {
      setLoadError(true)
      toast.error(text('加载复习内容失败', 'Could not load review items'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    reviewApi.today().then((data) => {
      if (!cancelled) {
        setItems(data?.reviews ?? [])
        setCurrentIndex(0)
        setDoneCount(0)
        setCompleted(false)
        setSelectedAnswer(null)
        setShowResult(false)
        setQuizNotes({})
      }
    }).catch(() => {
      if (!cancelled) {
        setLoadError(true)
        toast.error(english ? 'Could not load review items' : '加载复习内容失败')
      }
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [english])

  const current = items[currentIndex]
  const currentQuestion = current ? quizNotes[current.note_id] : null
  const showQuiz = currentQuestion != null || questionLoading
  const progress = items.length ? Math.min(100, doneCount / items.length * 100) : 0

  const handleStartQuiz = async (noteId: string) => {
    if (quizNotes[noteId]) {
      setSelectedAnswer(null)
      setShowResult(false)
      return
    }
    setQuestionLoading(true)
    try {
      const question = await reviewApi.getQuestion(noteId)
      if (question) setQuizNotes((previous) => ({ ...previous, [noteId]: question }))
    } catch {
      toast.error(text('获取题目失败', 'Could not generate a question'))
    } finally {
      setQuestionLoading(false)
    }
  }

  const handleAnswer = (answer: string) => {
    setSelectedAnswer(answer)
    setShowResult(true)
  }

  const advance = (markDone: boolean) => {
    if (!current) return
    if (markDone) {
      reviewApi.markDone(current.note_id).catch(() => {})
      setDoneCount((count) => count + 1)
      usePetStore.getState().trigger('review_done')
    }
    if (currentIndex >= items.length - 1) {
      setCompleted(true)
      return
    }
    setSelectedAnswer(null)
    setShowResult(false)
    setCurrentIndex((index) => index + 1)
  }

  const handleRegenerate = async () => {
    if (!current) return
    setQuizNotes((previous) => {
      const next = { ...previous }
      delete next[current.note_id]
      return next
    })
    setSelectedAnswer(null)
    setShowResult(false)
    setQuestionLoading(true)
    try {
      const question = await reviewApi.getQuestion(current.note_id)
      if (question) setQuizNotes((previous) => ({ ...previous, [current.note_id]: question }))
    } catch {
      toast.error(text('重新生成题目失败', 'Could not regenerate the question'))
    } finally {
      setQuestionLoading(false)
    }
  }

  const isCorrect = selectedAnswer === currentQuestion?.answer
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const activeStreak = [today.toDateString(), yesterday.toDateString()].includes(reviewStreak.lastDate)
    ? reviewStreak.count
    : 0

  return (
    <LearningLayout className="daily-review-page">
      <LearningHeader
        title={t('review.title')}
        subtitle={text('温故旧知，让每一次回看都有新收获', 'Return to what you know and make every review count')}
        actions={(
          <button type="button" className="secondary-button" disabled={loading} onClick={() => void loadReviews()}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            {text('刷新题目', 'Refresh')}
          </button>
        )}
      />

      {loadError && (
        <div className="learning-inline-error" role="alert">
          <span>{text('回顾内容暂时没有加载成功，其他功能不受影响。', 'Review items could not be loaded. Other tools are still available.')}</span>
          <button type="button" onClick={() => void loadReviews()}>{t('common.retry')}</button>
        </div>
      )}

      <section className="review-hero" aria-label={text('今日回顾概览', 'Review overview')}>
        <img src={cloudArt} alt="" />
        <div className="review-hero-title">
          <span className="learning-icon tone-violet"><BookOpen size={19} /></span>
          <div><small>{text('今日学习计划', 'Today’s learning plan')}</small><strong>{text('今日待回顾', 'Due today')} <em>{items.length}</em> {text('条笔记', 'notes')}</strong></div>
        </div>
        <div className="review-hero-progress">
          <span>{text('已完成', 'Completed')} <strong>{doneCount}</strong> / {items.length || 0}</span>
          <div className="learning-progress"><i style={{ width: `${progress}%` }} /></div>
        </div>
      </section>

      {loading ? (
        <div className="review-workspace learning-skeleton-grid" aria-label={t('common.loading')}>
          <div /><div /><div />
        </div>
      ) : items.length === 0 ? (
        <section className="learning-empty-card">
          <img src={cloudArt} alt="" />
          <GraduationCap size={29} />
          <h2>{t('review.empty')}</h2>
          <p>{text('今天没有到期的内容，可以去记录一些新想法。', 'Nothing is due today. This is a good time to capture a new idea.')}</p>
        </section>
      ) : completed ? (
        <section className="learning-complete-card">
          <div className="learning-complete-icon"><Sparkles size={28} /></div>
          <div><span>{text('今日回顾', 'Daily review')}</span><h2>{t('review.allDone')}</h2><p>{t('review.progress')}: {doneCount}/{items.length}</p></div>
          <img src={cloudArt} alt="" />
        </section>
      ) : (
        <div className="review-workspace">
          <aside className="review-queue learning-card">
            <div className="learning-card-heading"><div><span>{text('学习清单', 'Learning list')}</span><h2>{text('今日回顾', 'Today’s review')}</h2></div><small>{currentIndex + 1}/{items.length}</small></div>
            <div className="review-queue-list">
              {items.map((item, index) => {
                const done = index < currentIndex
                const active = index === currentIndex
                return (
                  <div key={item.review_id || item.note_id} className={`review-queue-item${done ? ' is-done' : ''}${active ? ' is-active' : ''}`}>
                    <span className="review-queue-marker">{done ? <Check size={13} /> : active ? <span /> : <Circle size={15} />}</span>
                    <div><strong>{item.title || text('未命名笔记', 'Untitled note')}</strong><small>{done ? t('review.done') : active ? text('当前回顾中', 'Reviewing now') : text('待回顾', 'Up next')}</small></div>
                  </div>
                )
              })}
            </div>
            <div className="review-queue-footer"><Sparkles size={14} />{text('每次回看，都让知识更牢固', 'Every review makes knowledge stronger')}</div>
          </aside>

          <main className="review-stage learning-card">
            {!showQuiz ? (
              <div className="review-intro">
                <span className="learning-eyebrow">{text('当前笔记', 'Current note')}</span>
                <h2>{current?.title}</h2>
                <p>{current?.content_preview || text('准备好后生成一道小题，检验一下记忆效果。', 'Generate a quick question when you are ready.')}</p>
                <div className="review-intro-meta"><span>{current?.review_count || 0} {text('次回顾', 'reviews')}</span><span>{text('间隔', 'Interval')} {current?.interval_days || 0} {text('天', 'days')}</span></div>
                <button type="button" className="primary-button" onClick={() => void handleStartQuiz(current.note_id)}>
                  {text('生成回顾题目', 'Generate question')}<ArrowRight size={16} />
                </button>
              </div>
            ) : questionLoading ? (
              <div className="review-question-skeleton"><div /><div /><span /><span /><span /><span /></div>
            ) : (
              <div className="review-question">
                <div className="review-question-kicker">{text('当前笔记', 'Current note')} · <span>{current?.title}</span></div>
                <h2>{currentQuestion?.question}</h2>
                <div className="review-choices">
                  {(currentQuestion?.choices ?? []).map((option, index) => {
                    const selected = selectedAnswer === option
                    const correctAnswer = option === currentQuestion?.answer
                    return (
                      <button
                        type="button"
                        key={`${option}-${index}`}
                        className={`${selected ? ' is-selected' : ''}${showResult && correctAnswer ? ' is-correct' : ''}${showResult && selected && !correctAnswer ? ' is-wrong' : ''}`}
                        onClick={() => !showResult && handleAnswer(option)}
                        disabled={showResult}
                      >
                        <span>{String.fromCharCode(65 + index)}</span><strong>{option}</strong>
                        {showResult && correctAnswer && <CheckCircle2 size={18} />}
                        {showResult && selected && !correctAnswer && <XCircle size={18} />}
                      </button>
                    )
                  })}
                </div>
                {showResult && (
                  <div className={`review-result${isCorrect ? ' is-correct' : ' is-wrong'}`}>
                    {isCorrect ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
                    <div><strong>{isCorrect ? t('review.correct') : t('review.wrong')}</strong><p>{isCorrect ? text('很好，你已经掌握了这个知识点。', 'Great — you have a solid grasp of this idea.') : text(`正确答案：${currentQuestion?.answer}`, `Correct answer: ${currentQuestion?.answer}`)}</p></div>
                  </div>
                )}
                {showResult && (
                  <div className="review-question-actions">
                    <button type="button" className="secondary-button" disabled={questionLoading} onClick={() => void handleRegenerate()}><RefreshCw size={14} />{t('review.regenerate')}</button>
                    <button type="button" className="primary-button" onClick={() => advance(true)}>{currentIndex < items.length - 1 ? text('完成并继续', 'Complete & continue') : t('review.done')}<ArrowRight size={15} /></button>
                  </div>
                )}
              </div>
            )}
          </main>

          <aside className="review-insights">
            <section className="learning-card review-progress-card">
              <div className="learning-card-heading"><div><span>{text('完成情况', 'Completion')}</span><h2>{text('今日进度', 'Today’s progress')}</h2></div><Sparkles size={17} /></div>
              <div className="review-progress-ring" style={{ '--progress': `${progress * 3.6}deg` } as React.CSSProperties}>
                <div><strong>{doneCount} / {items.length}</strong><small>{progress >= 50 ? text('已经过半啦', 'Halfway there') : text('慢慢来，不着急', 'Take it one step at a time')}</small></div>
              </div>
            </section>
            <section className="learning-card review-streak-card">
              <span>{text('连续回顾', 'Review streak')}</span><Flame size={28} /><strong>{activeStreak} <small>{text('天', 'days')}</small></strong><p>{text('最佳', 'Best')} {reviewStreak.best} {text('天', 'days')}</p>
            </section>
            <section className="learning-card review-companion-card">
              <div><span>{nickname}{text('陪你复习', ' is with you')}</span><Sparkles size={15} /></div>
              <div className="review-companion-content"><img src={cloudArt} alt="" /><p>{text('慢慢来，记住一点就是进步～', 'Take your time. Remembering one more thing is progress.')}</p></div>
            </section>
          </aside>
        </div>
      )}
    </LearningLayout>
  )
}
