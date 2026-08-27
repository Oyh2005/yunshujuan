import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Timer, Play, Pause, RotateCcw, Coffee, Brain } from 'lucide-react'
import { FadeIn } from '../components/common/motion'
import { usePetStore } from '../stores/usePetStore'

const WORK_SECONDS = 25 * 60
const REST_SECONDS = 5 * 60
const R = 90
const CIRCUMFERENCE = 2 * Math.PI * R

/** 简单提示音（Web Audio） */
function beep() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.12, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
    osc.start()
    osc.stop(ctx.currentTime + 0.5)
  } catch { /* ignore */ }
}

function formatTime(total: number): string {
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function PomodoroPage() {
  const { t } = useTranslation()
  const [mode, setMode] = useState<'work' | 'rest'>('work')
  const [remaining, setRemaining] = useState(WORK_SECONDS)
  const [running, setRunning] = useState(false)
  const [sessions, setSessions] = useState(0)

  const remainingRef = useRef(remaining)
  useEffect(() => {
    remainingRef.current = remaining
  }, [remaining])

  const handleComplete = useCallback(() => {
    setRunning(false)
    beep()
    if (mode === 'work') {
      setSessions((s) => s + 1)
      // 页宠联动：完成一个番茄
      usePetStore.getState().trigger('pomodoro_done')
      setMode('rest')
      setRemaining(REST_SECONDS)
    } else {
      setMode('work')
      setRemaining(WORK_SECONDS)
    }
  }, [mode])

  const completeRef = useRef(handleComplete)
  useEffect(() => {
    completeRef.current = handleComplete
  }, [handleComplete])

  // 计时器（interval 回调中读写 ref，setState 在异步回调中）
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => {
      const next = Math.max(0, remainingRef.current - 1)
      remainingRef.current = next
      setRemaining(next)
      if (next <= 0) {
        clearInterval(timer)
        completeRef.current()
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [running])

  // 标题栏显示剩余时间
  useEffect(() => {
    const previous = document.title
    document.title = `${formatTime(remaining)} · ${mode === 'work' ? t('pomodoro.work') : t('pomodoro.rest')} · 云舒卷`
    return () => {
      document.title = previous
    }
  }, [remaining, mode, t])

  const handleToggle = () => {
    if (!running && remaining <= 0) {
      setRemaining(mode === 'work' ? WORK_SECONDS : REST_SECONDS)
    }
    setRunning((v) => !v)
  }

  const handleReset = () => {
    setRunning(false)
    setRemaining(mode === 'work' ? WORK_SECONDS : REST_SECONDS)
  }

  const progress = mode === 'work'
    ? (WORK_SECONDS - remaining) / WORK_SECONDS
    : (REST_SECONDS - remaining) / REST_SECONDS

  return (
    <div className="max-w-xl mx-auto py-8 px-6">
      <FadeIn>
        <h1 className="font-heading text-xl font-semibold text-[var(--color-text)] flex items-center gap-2 mb-6">
          <Timer size={22} className="text-[var(--color-accent)]" />
          {t('pomodoro.title')}
        </h1>

        <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-8 flex flex-col items-center">
          {/* 模式切换标签 */}
          <div className="flex items-center gap-2 mb-6">
            <span className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full transition-colors ${
              mode === 'work'
                ? 'bg-[var(--color-accent)] text-[var(--color-accent-foreground)]'
                : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-tertiary)]'
            }`}>
              <Brain size={13} />
              {t('pomodoro.work')}
            </span>
            <span className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full transition-colors ${
              mode === 'rest'
                ? 'bg-[var(--color-success)] text-white'
                : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-tertiary)]'
            }`}>
              <Coffee size={13} />
              {t('pomodoro.rest')}
            </span>
          </div>

          {/* 环形进度 */}
          <div className="relative mb-6">
            <svg width={220} height={220} viewBox="0 0 220 220">
              <circle cx={110} cy={110} r={R} fill="none" stroke="var(--color-bg-tertiary)" strokeWidth={10} />
              <circle
                cx={110}
                cy={110}
                r={R}
                fill="none"
                stroke={mode === 'work' ? 'var(--color-accent)' : 'var(--color-success)'}
                strokeWidth={10}
                strokeLinecap="round"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
                transform="rotate(-90 110 110)"
                style={{ transition: 'stroke-dashoffset 1s linear' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-5xl font-bold tabular-nums ${mode === 'work' ? 'text-[var(--color-text)]' : 'text-[var(--color-success)]'}`}>
                {formatTime(remaining)}
              </span>
              <span className="text-xs text-[var(--color-text-tertiary)] mt-2">
                {running
                  ? (mode === 'work' ? t('pomodoro.focusing') : t('pomodoro.resting'))
                  : (mode === 'work' ? t('pomodoro.ready') : t('pomodoro.restReady'))}
              </span>
            </div>
          </div>

          {/* 操作 */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleToggle}
              className={`flex items-center gap-2 px-6 h-11 text-sm font-medium rounded-full transition-all ${
                running
                  ? 'border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]'
                  : 'bg-[var(--color-accent)] text-[var(--color-accent-foreground)] hover:opacity-90'
              }`}
            >
              {running ? <Pause size={15} /> : <Play size={15} />}
              {running ? t('pomodoro.pause') : t('pomodoro.start')}
            </button>
            <button
              onClick={handleReset}
              className="secondary-button"
            >
              <RotateCcw size={14} />
              {t('pomodoro.reset')}
            </button>
          </div>

          {/* 会话计数 */}
          <div className="mt-6 text-center">
            <p className="text-xs text-[var(--color-text-tertiary)] mb-1.5">{t('pomodoro.sessionsToday')}</p>
            <div className="text-xl tracking-wider">
              {Array.from({ length: Math.min(sessions, 8) }).map((_, i) => (
                <span key={i} className="mx-0.5">🍅</span>
              ))}
              {sessions === 0 && <span className="text-[var(--color-text-tertiary)] text-sm">{t('pomodoro.noSession')}</span>}
            </div>
            {sessions > 8 && <p className="text-xs text-[var(--color-accent)] mt-1">+{sessions - 8}</p>}
          </div>
        </div>

        <p className="text-center text-xs text-[var(--color-text-tertiary)] mt-4">
          {t('pomodoro.tip')}
        </p>
      </FadeIn>
    </div>
  )
}
