import { create } from 'zustand'

/** 连续打卡 + 每日任务状态（localStorage 持久化） */

export type TaskId = 'note' | 'review' | 'chat'

/** 每日任务定义（id 与页宠事件对应） */
export const DAILY_TASKS: { id: TaskId; event: string }[] = [
  { id: 'note', event: 'note_saved' },
  { id: 'review', event: 'review_done' },
  { id: 'chat', event: 'ai_done' },
]

/** 任务完成奖励好感度 */
export const TASK_REWARD = 2

interface StreakState {
  lastDate: string
  count: number
  best: number
}

interface HabitConfig {
  noteStreak: StreakState
  reviewStreak: StreakState
  /** 今日任务日期（跨天重置） */
  taskDate: string
  /** 今日已完成任务 */
  tasksDone: TaskId[]
}

const STORAGE_KEY = 'habit.config'

function emptyStreak(): StreakState {
  return { lastDate: '', count: 0, best: 0 }
}

function loadConfig(): HabitConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<HabitConfig>
      return {
        noteStreak: { ...emptyStreak(), ...(parsed.noteStreak || {}) },
        reviewStreak: { ...emptyStreak(), ...(parsed.reviewStreak || {}) },
        taskDate: parsed.taskDate || '',
        tasksDone: parsed.tasksDone || [],
      }
    }
  } catch { /* ignore */ }
  return { noteStreak: emptyStreak(), reviewStreak: emptyStreak(), taskDate: '', tasksDone: [] }
}

function saveConfig(config: HabitConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch { /* ignore */ }
}

/** 计算 streak：上次日期 → 今日/昨日/更早 */
function updateStreak(prev: StreakState, today: string, yesterday: string): StreakState {
  if (prev.lastDate === today) {
    // 今天已记录过，不重复累加
    return prev
  }
  const count = prev.lastDate === yesterday ? prev.count + 1 : 1
  return { lastDate: today, count, best: Math.max(prev.best, count) }
}

function todayStr(): string {
  return new Date().toDateString()
}

function yesterdayStr(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toDateString()
}

export interface HabitStore extends HabitConfig {
  /** 标记某类事件完成（页宠事件联动调用）；返回该任务是否"刚完成"（用于发放奖励） */
  markEvent: (event: string) => { newlyDone: boolean }
  /** 今日已完成任务列表 */
  doneTasks: () => TaskId[]
  /** 全部任务是否完成 */
  allDone: () => boolean
}

export const useHabitStore = create<HabitStore>((set, get) => ({
  ...loadConfig(),

  markEvent: (event) => {
    const today = todayStr()
    const yesterday = yesterdayStr()
    const s = get()

    // 1. Streak 更新
    const noteStreak = event === 'note_saved'
      ? updateStreak(s.noteStreak, today, yesterday)
      : s.noteStreak
    const reviewStreak = event === 'review_done'
      ? updateStreak(s.reviewStreak, today, yesterday)
      : s.reviewStreak

    // 2. 任务标记（跨天重置）
    const taskDate = s.taskDate === today ? s.taskDate : today
    const tasksDone = s.taskDate === today ? [...s.tasksDone] : []
    let newlyDone = false
    const task = DAILY_TASKS.find((t) => t.event === event)
    if (task && !tasksDone.includes(task.id)) {
      tasksDone.push(task.id)
      newlyDone = true
    }

    const next = { noteStreak, reviewStreak, taskDate, tasksDone }
    saveConfig(next)
    set(next)
    return { newlyDone }
  },

  doneTasks: () => {
    const s = get()
    return s.taskDate === todayStr() ? s.tasksDone : []
  },

  allDone: () => {
    return get().doneTasks().length >= DAILY_TASKS.length
  },
}))
