import { create } from 'zustand'

/** 页宠情绪状态 */
export type PetMood = 'idle' | 'talk' | 'celebrate' | 'sleep' | 'think' | 'play' | 'happy' | 'surprised' | 'love'

/** 应用事件（各页面在成功回调里触发） */
export type PetEvent =
  | 'note_saved'      // 笔记保存成功
  | 'ai_thinking'     // AI 正在思考/流式输出
  | 'ai_done'         // AI 回答完成
  | 'review_done'     // 每日回顾完成
  | 'doc_uploaded'    // 知识库文档上传完成
  | 'post_created'    // 发布动态成功
  | 'pomodoro_done'   // 完成一个番茄钟
  | 'wake'            // 唤醒

/** 成长阶段 */
export type PetLevel = 1 | 2 | 3

/** 平台互动统计 */
export interface PetStats {
  notes: number      // 保存笔记次数
  reviews: number    // 回顾打卡次数
  uploads: number    // 上传文档次数
  chats: number      // AI 对话完成次数
  posts: number      // 发布动态次数
  pomodoros: number  // 完成番茄钟次数
  interactions: number // 点击互动次数
}

/** 互动记录（时间线） */
export interface PetLogEntry {
  time: number
  text: string
}

/* ═══════════════════════════════════════════════════════════
 * 好感度获取限制配置（如需微调，改这里即可）
 * ───────────────────────────────────────────────────────────
 * PET_TOUCH_COOLDOWN      触摸冷却：两次有效触摸最小间隔（ms）
 * PET_DAILY_TOUCH_LIMIT   每日通过触摸可获好感次数上限
 * PET_EVENT_COOLDOWNS     各平台事件的好感获取冷却（ms）：
 *   保存笔记 30 分钟 / 回顾打卡 5 分钟 / 上传文档 30 分钟 / AI 对话 10 分钟
 * ═══════════════════════════════════════════════════════════ */
export const PET_TOUCH_COOLDOWN = 10 * 60 * 1000
export const PET_DAILY_TOUCH_LIMIT = 10

export const PET_EVENT_COOLDOWNS: Record<string, number> = {
  note_saved: 30 * 60 * 1000,
  review_done: 5 * 60 * 1000,
  doc_uploaded: 30 * 60 * 1000,
  ai_done: 10 * 60 * 1000,
  post_created: 10 * 60 * 1000,
  pomodoro_done: 60 * 60 * 1000,
}

export interface TouchResult {
  success: boolean
  reason?: 'cooldown' | 'daily_limit'
}

interface PetConfig {
  visible: boolean
  /** 距视口右下角的偏移（px） */
  offsetX: number
  offsetY: number
  /** 自定义昵称（默认"小卷"） */
  nickname: string
  /** 累计好感度（决定成长阶段） */
  affection: number
  /** 平台互动统计 */
  stats: PetStats
  /** 最近互动记录（最多 20 条） */
  log: PetLogEntry[]
  /** 当前形象 id（内置角色注册表） */
  characterId: string
  /** 自定义主色（十六进制，如 #1F6C9F） */
  petColor: string
  /** 用户上传的自定义形象（base64 data URL，PNG/GIF/WebP） */
  customImage: string | null
  /** 上次有效触摸时间戳（冷却判断） */
  lastPetTime: number
  /** 今日有效触摸次数（每日上限判断） */
  petTodayCount: number
  /** 触摸计数的日期（跨天自动重置） */
  petTodayDate: string
  /** 各事件上次成功获得好感的时间戳（事件冷却判断） */
  lastEventTimes: Record<string, number>
}

const STORAGE_KEY = 'pet.config'

/** 好感度 → 等级（累计值） */
export function getPetLevel(affection: number): PetLevel {
  if (affection >= 150) return 3
  if (affection >= 50) return 2
  return 1
}

/** 各等级的门槛值（用于进度条展示） */
export const LEVEL_THRESHOLDS: Record<PetLevel, number> = { 1: 50, 2: 150, 3: 9999 }

/** 各等级对应的宠物尺寸（px） */
export const LEVEL_SIZES: Record<PetLevel, number> = { 1: 112, 2: 130, 3: 148 }

function defaultStats(): PetStats {
  return { notes: 0, reviews: 0, uploads: 0, chats: 0, posts: 0, pomodoros: 0, interactions: 0 }
}

function loadConfig(): PetConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PetConfig>
      return {
        visible: parsed.visible ?? true,
        offsetX: parsed.offsetX ?? 24,
        offsetY: parsed.offsetY ?? 24,
        nickname: parsed.nickname || '小卷',
        affection: parsed.affection ?? 0,
        stats: { ...defaultStats(), ...(parsed.stats || {}) },
        log: parsed.log || [],
        characterId: parsed.characterId || 'cloud',
        petColor: parsed.petColor || '',
        customImage: parsed.customImage ?? null,
        lastPetTime: parsed.lastPetTime ?? 0,
        petTodayCount: parsed.petTodayCount ?? 0,
        petTodayDate: parsed.petTodayDate || '',
        lastEventTimes: parsed.lastEventTimes || {},
      }
    }
  } catch { /* ignore */ }
  return {
    visible: true, offsetX: 24, offsetY: 24, nickname: '小卷',
    affection: 0, stats: defaultStats(), log: [],
    characterId: 'cloud', petColor: '', customImage: null,
    lastPetTime: 0, petTodayCount: 0, petTodayDate: '', lastEventTimes: {},
  }
}

function saveConfig(config: PetConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch { /* ignore */ }
}

export interface PetStore extends PetConfig {
  /** 当前情绪（由 Pet 组件管理） */
  mood: PetMood
  /** 当前气泡文本（null 表示无气泡） */
  bubble: string | null
  /** 最近一次事件 + 时间戳（Pet 组件监听变化） */
  lastEvent: { event: PetEvent; ts: number } | null

  setVisible: (v: boolean) => void
  setOffset: (x: number, y: number) => void
  setMood: (m: PetMood) => void
  showBubble: (text: string | null) => void
  trigger: (event: PetEvent) => void
  /** 好感度 + 统计 + 记录（由 Pet 组件在事件/互动时调用） */
  addAffection: (amount: number, statKey: keyof PetStats | null, logText?: string) => void
  /** 自定义昵称 */
  rename: (nickname: string) => void
  /** 切换形象 */
  setCharacter: (id: string) => void
  /** 设置自定义形象（base64 data URL；null = 移除） */
  setCustomImage: (dataUrl: string | null) => void
  /** 设置自定义主色（空字符串 = 使用主题默认色） */
  setPetColor: (color: string) => void
  /**
   * 尝试触摸互动：通过冷却（10 分钟）与每日上限（10 次）校验。
   * 成功则记录时间/次数并返回 success；失败返回原因（不增加好感度，
   * 但调用方仍可播放特效与提示气泡）。
   */
  tryPet: () => TouchResult
  /**
   * 尝试平台事件获得好感：按 PET_EVENT_COOLDOWNS 冷却校验。
   * 成功则记录时间并返回 success；冷却中返回失败（动画照常，但不加好感）。
   */
  tryEvent: (event: PetEvent) => { success: boolean }
  /** 清空互动记录 */
  clearLog: () => void
}

export const usePetStore = create<PetStore>((set) => ({
  ...loadConfig(),
  mood: 'idle',
  bubble: null,
  lastEvent: null,

  setVisible: (v) => {
    set((s) => {
      const next = { ...s, visible: v }
      saveConfig(next)
      return next
    })
  },

  setOffset: (x, y) => {
    set((s) => {
      const next = { ...s, offsetX: x, offsetY: y }
      saveConfig(next)
      return next
    })
  },

  setMood: (m) => set({ mood: m }),

  showBubble: (text) => set({ bubble: text }),

  trigger: (event) => set({ lastEvent: { event, ts: Date.now() } }),

  addAffection: (amount, statKey, logText) => {
    set((s) => {
      const stats = statKey ? { ...s.stats, [statKey]: s.stats[statKey] + 1 } : s.stats
      const log = logText
        ? [{ time: Date.now(), text: logText }, ...s.log].slice(0, 20)
        : s.log
      const next = { ...s, affection: Math.max(0, s.affection + amount), stats, log }
      saveConfig(next)
      return next
    })
  },

  rename: (nickname) => {
    const name = nickname.trim().slice(0, 12) || '小卷'
    set((s) => {
      const next = { ...s, nickname: name }
      saveConfig(next)
      return next
    })
  },

  setCharacter: (id) => {
    set((s) => {
      const next = { ...s, characterId: id }
      saveConfig(next)
      return next
    })
  },

  setCustomImage: (dataUrl) => {
    set((s) => {
      const next = { ...s, customImage: dataUrl }
      saveConfig(next)
      return next
    })
  },

  setPetColor: (color) => {
    set((s) => {
      const next = { ...s, petColor: color }
      saveConfig(next)
      return next
    })
  },

  tryPet: () => {
    let result: TouchResult = { success: true }
    set((s) => {
      const now = Date.now()
      const today = new Date().toDateString()
      // 跨天重置计数
      const dayCount = s.petTodayDate === today ? s.petTodayCount : 0
      const lastTime = s.petTodayDate === today ? s.lastPetTime : 0

      if (now - lastTime < PET_TOUCH_COOLDOWN) {
        result = { success: false, reason: 'cooldown' }
        return s
      }
      if (dayCount >= PET_DAILY_TOUCH_LIMIT) {
        result = { success: false, reason: 'daily_limit' }
        return s
      }

      const next = { ...s, lastPetTime: now, petTodayDate: today, petTodayCount: dayCount + 1 }
      saveConfig(next)
      return next
    })
    return result
  },

  tryEvent: (event) => {
    const cooldown = PET_EVENT_COOLDOWNS[event]
    // 未配置冷却的事件（如 ai_thinking）不限制
    if (!cooldown) return { success: true }

    let result = { success: true }
    set((s) => {
      const now = Date.now()
      const lastTime = s.lastEventTimes[event] ?? 0
      if (now - lastTime < cooldown) {
        result = { success: false }
        return s
      }
      const next = { ...s, lastEventTimes: { ...s.lastEventTimes, [event]: now } }
      saveConfig(next)
      return next
    })
    return result
  },

  clearLog: () => {
    set((s) => {
      const next = { ...s, log: [] }
      saveConfig(next)
      return next
    })
  },
}))
