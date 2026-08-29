import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BellOff,
  Brain,
  Check,
  Coffee,
  Eye,
  Focus,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Star,
  Target,
  Timer,
} from 'lucide-react'
import LearningLayout, { LearningHeader } from '../components/learning/LearningLayout'
import { usePetStore } from '../stores/usePetStore'

const WORK_SECONDS = 25 * 60
const REST_SECONDS = 5 * 60
const R = 118
const CIRCUMFERENCE = 2 * Math.PI * R
const cloudArt = '/illustrations/study-cloud.png'

function beep() {
  try {
    const context = new AudioContext()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.frequency.value = 880
    gain.gain.setValueAtTime(0.12, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.5)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.5)
  } catch { /* browsers may block audio until interaction */ }
}

function formatTime(total: number): string {
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export default function PomodoroPage() {
  const { i18n, t } = useTranslation()
  const english = i18n.resolvedLanguage?.startsWith('en')
  const text = (zh: string, en: string) => english ? en : zh
  const nickname = usePetStore((state) => state.nickname)
  const [mode, setMode] = useState<'work' | 'rest'>('work')
  const [remaining, setRemaining] = useState(WORK_SECONDS)
  const [running, setRunning] = useState(false)
  const [sessions, setSessions] = useState(0)
  const [sessionTimes, setSessionTimes] = useState<string[]>([])

  const remainingRef = useRef(remaining)
  useEffect(() => {
    remainingRef.current = remaining
  }, [remaining])

  const handleComplete = useCallback(() => {
    setRunning(false)
    beep()
    if (mode === 'work') {
      setSessions((count) => count + 1)
      setSessionTimes((times) => [...times, new Date().toLocaleTimeString(english ? 'en-US' : 'zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })])
      usePetStore.getState().trigger('pomodoro_done')
      setMode('rest')
      setRemaining(REST_SECONDS)
    } else {
      setMode('work')
      setRemaining(WORK_SECONDS)
    }
  }, [english, mode])

  const completeRef = useRef(handleComplete)
  useEffect(() => {
    completeRef.current = handleComplete
  }, [handleComplete])

  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => {
      const next = Math.max(0, remainingRef.current - 1)
      remainingRef.current = next
      setRemaining(next)
      if (next <= 0) {
        window.clearInterval(timer)
        completeRef.current()
      }
    }, 1000)
    return () => window.clearInterval(timer)
  }, [running])

  useEffect(() => {
    const previous = document.title
    document.title = `${formatTime(remaining)} · ${mode === 'work' ? t('pomodoro.work') : t('pomodoro.rest')} · 云舒卷`
    return () => { document.title = previous }
  }, [remaining, mode, t])

  const switchMode = (nextMode: 'work' | 'rest') => {
    setRunning(false)
    setMode(nextMode)
    setRemaining(nextMode === 'work' ? WORK_SECONDS : REST_SECONDS)
  }

  const handleToggle = () => {
    if (!running && remaining <= 0) setRemaining(mode === 'work' ? WORK_SECONDS : REST_SECONDS)
    setRunning((value) => !value)
  }

  const handleReset = () => {
    setRunning(false)
    setRemaining(mode === 'work' ? WORK_SECONDS : REST_SECONDS)
  }

  const totalSeconds = mode === 'work' ? WORK_SECONDS : REST_SECONDS
  const progress = (totalSeconds - remaining) / totalSeconds
  const circumferenceOffset = CIRCUMFERENCE * (1 - progress)

  return (
    <LearningLayout className="pomodoro-page">
      <LearningHeader
        title={text('番茄专注', 'Focus timer')}
        subtitle={text('把注意力留给当下，把成长交给时间', 'Give your attention to the present and let time grow the rest')}
        actions={running ? <span className="focus-status"><i />{text('专注中 · 请勿打扰', 'Focusing · Do not disturb')}</span> : undefined}
      />

      <div className="pomodoro-layout">
        <main className="pomodoro-main-column">
          <section className={`learning-card focus-card${running ? ' is-running' : ''}`}>
            <div className="focus-mode-tabs" role="tablist" aria-label={text('计时模式', 'Timer mode')}>
              <button type="button" role="tab" aria-selected={mode === 'work'} className={mode === 'work' ? 'is-active' : ''} onClick={() => switchMode('work')}><Brain size={17} />{text('专注 25 分钟', 'Focus · 25 min')}</button>
              <button type="button" role="tab" aria-selected={mode === 'rest'} className={mode === 'rest' ? 'is-active' : ''} onClick={() => switchMode('rest')}><Coffee size={17} />{text('休息 5 分钟', 'Break · 5 min')}</button>
            </div>

            <div className="focus-card-body">
              <div className="focus-timer-column">
                <div className="focus-ring">
                  <svg viewBox="0 0 270 270" role="img" aria-label={`${formatTime(remaining)} ${mode === 'work' ? t('pomodoro.work') : t('pomodoro.rest')}`}>
                    <defs>
                      <linearGradient id="focusRingGradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8253FF" /><stop offset="1" stopColor="#6235ED" /></linearGradient>
                      <linearGradient id="restRingGradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#64CFAE" /><stop offset="1" stopColor="#279A77" /></linearGradient>
                    </defs>
                    <circle cx="135" cy="135" r={R} fill="none" className="focus-ring-track" strokeWidth="11" />
                    <circle cx="135" cy="135" r={R} fill="none" stroke={mode === 'work' ? 'url(#focusRingGradient)' : 'url(#restRingGradient)'} strokeWidth="11" strokeLinecap="round" strokeDasharray={CIRCUMFERENCE} strokeDashoffset={circumferenceOffset} transform="rotate(-90 135 135)" />
                  </svg>
                  <div className="focus-ring-copy"><span>{mode === 'work' ? text('专注时间', 'Focus time') : text('休息时间', 'Break time')}</span><strong>{formatTime(remaining)}</strong><small>{running ? (mode === 'work' ? text('保持专注，你做得很好', 'Stay focused — you are doing great') : text('放松一下，给大脑充充电', 'Relax and let your mind recharge')) : (mode === 'work' ? t('pomodoro.ready') : t('pomodoro.restReady'))}</small></div>
                </div>
                <div className="focus-actions">
                  <button type="button" className="primary-button focus-toggle" onClick={handleToggle}>{running ? <Pause size={18} /> : <Play size={18} />}{running ? t('pomodoro.pause') : t('pomodoro.start')}</button>
                  <button type="button" className="secondary-button" onClick={handleReset}><RotateCcw size={16} />{t('pomodoro.reset')}</button>
                </div>
                <p className="focus-reward"><Star size={14} />{t('pomodoro.tip')}</p>
              </div>
              <div className="focus-companion-scene" aria-hidden="true"><span className="focus-spark one">✦</span><span className="focus-spark two">✧</span><img src={cloudArt} alt="" /></div>
            </div>
          </section>

          <section className="learning-card focus-timeline-card">
            <div className="learning-card-heading"><div><span>{text('专注记录', 'Focus record')}</span><h2>{text('今日节奏', 'Today’s rhythm')}</h2></div><Timer size={18} /></div>
            <div className="focus-timeline">
              {sessionTimes.slice(-4).map((time, index) => <div key={`${time}-${index}`} className="is-complete"><span>{time}</span><i><Check size={13} /></i><small>{text('专注 25m', 'Focus 25m')}</small></div>)}
              <div className={running ? 'is-current' : ''}><span>{running ? text('当前', 'Now') : text('下一次', 'Next')}</span><i>{running ? <Focus size={13} /> : <Play size={12} />}</i><small>{running ? formatTime(remaining) : text('准备开始', 'Ready')}</small></div>
            </div>
          </section>
        </main>

        <aside className="pomodoro-side-column">
          <section className="learning-card focus-today-card">
            <div className="learning-card-heading"><div><span>{text('完成情况', 'Completed')}</span><h2>{text('今日专注', 'Focus today')}</h2></div><span className="learning-icon tone-rose">🍅</span></div>
            <strong>{sessions} <small>{text('个番茄', 'pomodoros')}</small></strong>
            <p>{text('累计', 'Total')} {sessions * 25} {text('分钟', 'minutes')}</p>
            <div className="tomato-markers">{Array.from({ length: 5 }).map((_, index) => <span key={index} className={index < sessions ? 'is-filled' : ''}>🍅</span>)}</div>
          </section>

          <section className="learning-card focus-pet-card">
            <div className="learning-card-heading"><div><span>{text('安静陪伴', 'Quiet company')}</span><h2>{nickname}{text('陪你', ' is with you')}</h2></div><Sparkles size={16} /></div>
            <div><p>{text('我会安静陪你，专注结束再一起庆祝～', 'I’ll stay quiet. We can celebrate when focus time ends!')}</p><img src={cloudArt} alt="" /></div>
          </section>

          <section className="learning-card focus-tips-card">
            <div className="learning-card-heading"><div><span>{text('保持沉浸', 'Stay immersed')}</span><h2>{text('专注小贴士', 'Focus tips')}</h2></div><Target size={17} /></div>
            <ul>
              <li><span className="learning-icon tone-mint"><BellOff size={17} /></span>{text('关闭无关通知', 'Mute unrelated notifications')}</li>
              <li><span className="learning-icon tone-amber"><Target size={17} /></span>{text('只做当前这一件事', 'Do only the task in front of you')}</li>
              <li><span className="learning-icon tone-blue"><Eye size={17} /></span>{text('休息时记得看看远处', 'Look into the distance during breaks')}</li>
            </ul>
          </section>
        </aside>
      </div>
    </LearningLayout>
  )
}
