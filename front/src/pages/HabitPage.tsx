import { useTranslation } from 'react-i18next'
import { Flame, BookOpen, GraduationCap, MessageSquare, CheckCircle2, Circle, Sparkles, Heart } from 'lucide-react'
import { useHabitStore, DAILY_TASKS } from '../stores/useHabitStore'
import { usePetStore } from '../stores/usePetStore'
import { FadeIn } from '../components/common/motion'

const TASK_META: Record<string, { icon: React.ReactNode; labelKey: string; descKey: string }> = {
  note: { icon: <BookOpen size={16} />, labelKey: 'habit.taskNote', descKey: 'habit.taskNoteDesc' },
  review: { icon: <GraduationCap size={16} />, labelKey: 'habit.taskReview', descKey: 'habit.taskReviewDesc' },
  chat: { icon: <MessageSquare size={16} />, labelKey: 'habit.taskChat', descKey: 'habit.taskChatDesc' },
}

/** Streak 展示组件 */
function StreakCard({ label, streak, icon }: {
  label: string
  streak: { count: number; best: number }
  icon: React.ReactNode
}) {
  const { t } = useTranslation()
  return (
    <div className="bg-[var(--color-card)] rounded-lg border border-[var(--color-border)] p-5 text-center">
      <div className="flex items-center justify-center gap-1.5 text-3xl font-bold text-[var(--color-text)] mb-1">
        <Flame size={22} className="text-[var(--color-warning)]" />
        {streak.count}
        <span className="text-sm font-normal text-[var(--color-text-secondary)]">{t('habit.days')}</span>
      </div>
      <div className="flex items-center justify-center gap-1.5 text-sm text-[var(--color-text-secondary)]">
        {icon}
        {label}
      </div>
      <p className="text-xs text-[var(--color-text-tertiary)] mt-2">
        🏆 {t('habit.bestDays', { count: streak.best })}
      </p>
    </div>
  )
}

export default function HabitPage() {
  const { t } = useTranslation()
  const noteStreak = useHabitStore((s) => s.noteStreak)
  const reviewStreak = useHabitStore((s) => s.reviewStreak)
  const taskDate = useHabitStore((s) => s.taskDate)
  const tasksDone = useHabitStore((s) => s.tasksDone)
  const affection = usePetStore((s) => s.affection)

  const today = new Date().toDateString()
  const doneToday = taskDate === today ? tasksDone : []
  const doneCount = doneToday.length
  const allDone = doneCount >= DAILY_TASKS.length

  return (
    <div className="max-w-3xl mx-auto py-8 px-6">
      <FadeIn>
        <h1 className="font-heading text-xl font-semibold text-[var(--color-text)] mb-6">
          {t('habit.title')}
        </h1>

        {/* 全勤庆祝 */}
        {allDone && (
          <div className="mb-6 px-5 py-4 rounded-lg border border-[var(--color-accent)] bg-[var(--color-accent-bg)] flex items-center gap-3 msg-pop-in">
            <Sparkles size={20} className="text-[var(--color-accent)] shrink-0" />
            <p className="text-sm text-[var(--color-accent)]">
              {t('habit.allDone')}（{t('habit.rewardTip')}）
            </p>
          </div>
        )}

        {/* Streak 卡片 */}
        <div className="grid gap-4 sm:grid-cols-2 mb-6">
          <StreakCard label={t('habit.noteStreak')} streak={noteStreak} icon={<BookOpen size={14} />} />
          <StreakCard label={t('habit.reviewStreak')} streak={reviewStreak} icon={<GraduationCap size={14} />} />
        </div>

        {/* 今日任务 */}
        <div className="bg-[var(--color-card)] rounded-lg border border-[var(--color-border)] p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-[var(--color-text)]">{t('habit.todayTasks')}</h3>
            <span className="text-xs text-[var(--color-text-secondary)]">
              {doneCount} / {DAILY_TASKS.length}
            </span>
          </div>
          <div className="space-y-2">
            {DAILY_TASKS.map((task) => {
              const meta = TASK_META[task.id]
              const done = doneToday.includes(task.id)
              return (
                <div
                  key={task.id}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors ${
                    done
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent-bg)]'
                      : 'border-[var(--color-border)]'
                  }`}
                >
                  {done ? (
                    <CheckCircle2 size={18} className="text-[var(--color-accent)] shrink-0" />
                  ) : (
                    <Circle size={18} className="text-[var(--color-text-tertiary)] shrink-0" />
                  )}
                  <span className={`text-sm ${done ? 'text-[var(--color-accent)]' : 'text-[var(--color-text)]'}`}>
                    {meta.icon}
                    <span className="ml-2">{t(meta.labelKey)}</span>
                  </span>
                  <span className="ml-auto text-xs text-[var(--color-text-tertiary)]">{t(meta.descKey)}</span>
                </div>
              )
            })}
          </div>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-4 flex items-center gap-1.5">
            <Heart size={12} className="text-[var(--color-danger)]" />
            {t('habit.rewardTip')} · {t('habit.taskReset')}
          </p>
        </div>

        {/* 页宠联动 */}
        <div className="bg-[var(--color-card)] rounded-lg border border-[var(--color-border)] p-5">
          <h3 className="text-sm font-medium text-[var(--color-text)] mb-3 flex items-center gap-2">
            <Sparkles size={14} className="text-[var(--color-text-secondary)]" /> {t('habit.petLink')}
          </h3>
          <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
            {t('habit.petLinkDesc')}
            <span className="text-[var(--color-accent)] font-medium ml-1">{t('habit.affectionNow', { value: affection })}</span>
          </p>
        </div>
      </FadeIn>
    </div>
  )
}
