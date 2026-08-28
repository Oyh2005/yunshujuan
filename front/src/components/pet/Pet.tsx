import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  usePetStore,
  getPetLevel,
  LEVEL_SIZES,
  type PetEvent,
  type PetMood,
  type PetStats,
} from '../../stores/usePetStore'
import { useHabitStore, TASK_REWARD } from '../../stores/useHabitStore'
import { getCharacter } from './characters/registry'
import LevelDecor from './characters/LevelDecor'
import './pet.css'

/** 闲置多久入睡（ms） */
const SLEEP_TIMEOUT = 30_000
/** 临时情绪保持时长（ms） */
const MOOD_RESET_DELAY = 3200
/** 气泡显示时长（ms） */
const BUBBLE_DURATION = 3500

/** 事件 → 好感度/统计/日志 */
const EVENT_REWARDS: Record<string, { exp: number; stat: keyof PetStats; log: (nickname: string) => string }> = {
  note_saved: { exp: 3, stat: 'notes', log: () => '保存了一篇笔记，好感度 +3' },
  review_done: { exp: 5, stat: 'reviews', log: () => '完成一次回顾打卡，好感度 +5' },
  doc_uploaded: { exp: 4, stat: 'uploads', log: () => '上传了一个文档，好感度 +4' },
  ai_done: { exp: 2, stat: 'chats', log: () => '完成一次 AI 对话，好感度 +2' },
  post_created: { exp: 2, stat: 'posts', log: () => '发布了一条动态，好感度 +2' },
  pomodoro_done: { exp: 2, stat: 'pomodoros', log: () => '完成一个番茄钟，好感度 +2' },
}

/**
 * 页宠「小卷」主组件
 * 状态机：idle → talk / celebrate / sleep / think
 * - 点击互动（随机台词，好感度 +1）
 * - 拖拽移动（位置记忆 localStorage）
 * - 30s 无操作入睡，点击/事件唤醒
 * - 监听 usePetStore 的应用事件（保存笔记/AI 回答/回顾打卡/上传完成）
 * - 好感度成长决定等级与尺寸（Lv1 云宝宝 / Lv2 云精灵 / Lv3 云中仙）
 */
export default function Pet() {
  const { t } = useTranslation()
  const visible = usePetStore((s) => s.visible)
  const offsetX = usePetStore((s) => s.offsetX)
  const offsetY = usePetStore((s) => s.offsetY)
  const mood = usePetStore((s) => s.mood)
  const bubble = usePetStore((s) => s.bubble)
  const lastEvent = usePetStore((s) => s.lastEvent)
  const affection = usePetStore((s) => s.affection)
  const nickname = usePetStore((s) => s.nickname)
  const characterId = usePetStore((s) => s.characterId)
  const petColor = usePetStore((s) => s.petColor)
  const setOffset = usePetStore((s) => s.setOffset)
  const setMood = usePetStore((s) => s.setMood)
  const showBubble = usePetStore((s) => s.showBubble)
  const addAffection = usePetStore((s) => s.addAffection)
  const tryPet = usePetStore((s) => s.tryPet)
  const tryEvent = usePetStore((s) => s.tryEvent)

  const level = getPetLevel(affection)
  const size = LEVEL_SIZES[level]
  // 若用户选了自定义形象但尚未上传图片，回退到默认云朵，避免宠物消失
  const character = getCharacter(characterId)
  const customImage = usePetStore((s) => s.customImage)
  const activeCharacter = character.id === 'custom' && !customImage ? getCharacter('cloud') : character
  const CharacterRenderer = activeCharacter.Renderer

  // 拖拽状态（dragging 参与渲染，用 state；起点坐标用 ref）
  const [dragging, setDragging] = useState(false)
  const dragStartRef = useRef({ px: 0, py: 0, ox: 0, oy: 0 })
  const didDragRef = useRef(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // 旧的大屏位置在手机或窗口缩小时仍须可达；不覆盖用户的显示开关。
  useEffect(() => {
    const clampPosition = () => {
      const { offsetX: x, offsetY: y } = usePetStore.getState()
      const actualSize = Math.min(size, window.innerWidth < 768 ? 88 : size)
      const nextX = Math.min(Math.max(8, Number.isFinite(x) ? x : 24), Math.max(8, window.innerWidth - actualSize - 8))
      const nextY = Math.min(Math.max(8, Number.isFinite(y) ? y : 24), Math.max(8, window.innerHeight - actualSize - 8))
      if (nextX !== x || nextY !== y) setOffset(nextX, nextY)
    }
    clampPosition()
    window.addEventListener('resize', clampPosition)
    return () => window.removeEventListener('resize', clampPosition)
  }, [size, offsetX, offsetY, setOffset])

  // 定时器
  const moodTimerRef = useRef<number | null>(null)
  const bubbleTimerRef = useRef<number | null>(null)
  const sleepTimerRef = useRef<number | null>(null)

  const clearTimer = (ref: { current: number | null }) => {
    if (ref.current !== null) {
      window.clearTimeout(ref.current)
      ref.current = null
    }
  }

  /** 临时情绪（非 think）在 MOOD_RESET_DELAY 后回到 idle */
  const scheduleMoodReset = () => {
    clearTimer(moodTimerRef)
    moodTimerRef.current = window.setTimeout(() => {
      setMood('idle')
      moodTimerRef.current = null
    }, MOOD_RESET_DELAY)
  }

  /** 气泡自动消失 */
  const scheduleBubbleClear = (delay = BUBBLE_DURATION) => {
    clearTimer(bubbleTimerRef)
    bubbleTimerRef.current = window.setTimeout(() => {
      showBubble(null)
      bubbleTimerRef.current = null
    }, delay)
  }

  /** 重置入睡计时 */
  const resetSleepTimer = () => {
    clearTimer(sleepTimerRef)
    sleepTimerRef.current = window.setTimeout(() => {
      setMood('sleep')
      sleepTimerRef.current = null
    }, SLEEP_TIMEOUT)
  }

  /** 唤醒（点击/事件） */
  const wake = () => {
    if (mood === 'sleep') setMood('idle')
    resetSleepTimer()
  }

  /** 随机台词 */
  const randomLine = (): string => {
    const lines = t('pet.lines', { returnObjects: true }) as string[]
    return lines[Math.floor(Math.random() * lines.length)] ?? ''
  }

  /** 应用事件 → 宠物反应 + 好感度成长（受事件冷却限制）+ 打卡/任务联动 */
  const handleEvent = (event: PetEvent) => {
    wake()
    const reward = EVENT_REWARDS[event]
    if (reward) {
      // 事件冷却中：动画/气泡照常，但不重复增加好感度
      const result = tryEvent(event)
      if (result.success) {
        addAffection(reward.exp, reward.stat, reward.log(nickname))
      }
    }

    // 打卡/每日任务联动：记录 streak + 标记任务；任务首次完成发放好感奖励
    //（任务本身每日重置，天然防刷，不受事件冷却影响）
    const { newlyDone } = useHabitStore.getState().markEvent(event)
    if (newlyDone) {
      addAffection(TASK_REWARD, null, `${t('pet.logTaskDone')}，好感度 +${TASK_REWARD}`)
    }

    switch (event) {
      case 'note_saved':
        setMood('celebrate')
        showBubble(t('pet.lineNoteSaved'))
        scheduleBubbleClear()
        scheduleMoodReset()
        break
      case 'ai_thinking':
        // 保持思考状态直到回答完成
        setMood('think')
        clearTimer(moodTimerRef)
        break
      case 'ai_done':
        setMood('celebrate')
        showBubble(t('pet.lineAiDone'))
        scheduleBubbleClear()
        scheduleMoodReset()
        break
      case 'review_done':
        setMood('celebrate')
        showBubble(t('pet.lineReviewDone'))
        scheduleBubbleClear()
        scheduleMoodReset()
        break
      case 'doc_uploaded':
        setMood('celebrate')
        showBubble(t('pet.lineDocUploaded'))
        scheduleBubbleClear()
        scheduleMoodReset()
        break
      case 'wake':
        break
    }
  }

  // 监听应用事件
  useEffect(() => {
    if (lastEvent) handleEvent(lastEvent.event)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEvent?.ts])

  // 首次欢迎 + 启动入睡计时 + 随机表演
  useEffect(() => {
    const greeted = localStorage.getItem('pet.greeted')
    if (!greeted) {
      showBubble(t('pet.greet', { nickname }))
      scheduleBubbleClear(5000)
      localStorage.setItem('pet.greeted', '1')
    }
    resetSleepTimer()

    // 随机表演：每 15~25s 在 idle 状态下随机播放一个动作（玩耍/开心/惊讶/爱心/说话）
    let performTimer: number | null = null
    const schedulePerform = () => {
      const delay = 15000 + Math.random() * 10000
      performTimer = window.setTimeout(() => {
        const currentMood = usePetStore.getState().mood
        if (currentMood === 'idle') {
          const actions: PetMood[] = ['play', 'happy', 'surprised', 'love', 'talk']
          const pick = actions[Math.floor(Math.random() * actions.length)]
          setMood(pick)
          scheduleMoodReset()
          if (pick === 'talk') {
            showBubble(randomLine())
            scheduleBubbleClear()
          }
        }
        schedulePerform()
      }, delay)
    }
    schedulePerform()

    return () => {
      clearTimer(moodTimerRef)
      clearTimer(bubbleTimerRef)
      clearTimer(sleepTimerRef)
      if (performTimer !== null) window.clearTimeout(performTimer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── 交互 ──

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    didDragRef.current = false
    setDragging(true)
    dragStartRef.current = { px: e.clientX, py: e.clientY, ox: offsetX, oy: offsetY }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging) return
    const { px, py, ox, oy } = dragStartRef.current
    // 位置 = 起点偏移 + 鼠标位移（负方向）
    if (Math.hypot(e.clientX - px, e.clientY - py) > 5) didDragRef.current = true
    const rect = rootRef.current?.getBoundingClientRect()
    setOffset(
      Math.min(Math.max(8, ox - (e.clientX - px)), Math.max(8, window.innerWidth - (rect?.width ?? size) - 8)),
      Math.min(Math.max(8, oy - (e.clientY - py)), Math.max(8, window.innerHeight - (rect?.height ?? size) - 8)),
    )
  }

  const handlePointerUp = () => {
    setDragging(false)
    resetSleepTimer()
  }

  const handleClick = () => {
    if (didDragRef.current) { didDragRef.current = false; return }
    wake()
    setMood('talk')
    // 触摸限制：冷却 10 分钟 + 每日 10 次。无论是否有效都播放特效和气泡，
    // 但只有通过校验时才增加好感度。
    const result = tryPet()
    if (result.success) {
      showBubble(randomLine())
      addAffection(1, 'interactions', `${t('pet.logInteract')}，好感度 +1`)
    } else if (result.reason === 'cooldown') {
      showBubble(t('pet.touchCooldown'))
    } else {
      showBubble(t('pet.touchLimit'))
    }
    scheduleBubbleClear()
    scheduleMoodReset()
  }

  if (!visible) return null

  return (
    <div
      ref={rootRef}
      className={`pet-root${dragging ? ' dragging' : ''}`}
      style={{
        right: offsetX,
        bottom: offsetY,
        width: size,
        height: size,
        '--pet-size': `${size}px`,
        '--pet-x': `${offsetX}px`,
        '--pet-y': `${offsetY}px`,
        // 自定义主色：注入 CSS 变量，所有角色 SVG 自动生效（空值回退主题默认）
        ...(petColor ? { '--pet-body': petColor } : {}),
      } as React.CSSProperties}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClick={handleClick}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          didDragRef.current = false
          handleClick()
        }
      }}
      role="button"
      aria-label={nickname}
      title={nickname}
    >
      {bubble && (
        <div className="pet-bubble">
          <span className="pet-bubble-name">{nickname}</span>
          {bubble}
        </div>
      )}
      <div className="pet-visual" data-pet-svg>
        <CharacterRenderer mood={mood as PetMood} level={level} />
        <LevelDecor mood={mood as PetMood} level={level} />
      </div>
    </div>
  )
}
