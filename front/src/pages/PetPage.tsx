import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Cloud,
  Sparkles,
  Crown,
  Star,
  Heart,
  Pencil,
  Check,
  BookOpen,
  GraduationCap,
  Upload,
  MessageSquare,
  Rss,
  Timer,
  Hand,
  Trash2,
  Plus,
  Image as ImageIcon,
  X,
} from 'lucide-react'
import {
  usePetStore,
  getPetLevel,
  LEVEL_THRESHOLDS,
  PET_DAILY_TOUCH_LIMIT,
  type PetLevel,
} from '../stores/usePetStore'
import { PET_CHARACTERS, getCharacter } from '../components/pet/characters/registry'
import LevelDecor from '../components/pet/characters/LevelDecor'
import ConfirmDialog from '../components/common/ConfirmDialog'
import { FadeIn } from '../components/common/motion'

/** 可选的宠物主色（空字符串 = 主题默认） */
const PET_COLORS: { value: string; label: string; color: string }[] = [
  { value: '', label: 'default', color: '#1F6C9F' },
  { value: '#e08a9e', label: 'pink', color: '#e08a9e' },
  { value: '#7fb5a1', label: 'mint', color: '#7fb5a1' },
  { value: '#9b8fd4', label: 'purple', color: '#9b8fd4' },
  { value: '#e8a75d', label: 'orange', color: '#e8a75d' },
  { value: '#7fb2e0', label: 'sky', color: '#7fb2e0' },
]

/** 成长阶段图标（名称/描述按当前角色从注册表取，如云宝宝 vs 猫宝宝） */
const LEVEL_ICONS: Record<PetLevel, React.ReactNode> = {
  1: <Cloud size={28} />,
  2: <Star size={28} />,
  3: <Crown size={28} />,
}

/** 养成页大图的展示尺寸（px，随等级变大；右下角页宠仍用 LEVEL_SIZES） */
const DISPLAY_SIZES: Record<PetLevel, number> = { 1: 152, 2: 170, 3: 188 }

/** 自定义形象大小上限（KB）：localStorage 存储，避免撑爆 5MB 配额 */
const MAX_CUSTOM_IMAGE_SIZE = 500 * 1024

/** 成就定义（按统计解锁） */
const ACHIEVEMENTS = () => [
  { id: 'first_note', icon: <BookOpen size={16} />, label: 'achFirstNote', cond: (s: { notes: number }) => s.notes >= 1 },
  { id: 'note_master', icon: <BookOpen size={16} />, label: 'achNoteMaster', cond: (s: { notes: number }) => s.notes >= 10 },
  { id: 'reviewer', icon: <GraduationCap size={16} />, label: 'achReviewer', cond: (s: { reviews: number }) => s.reviews >= 10 },
  { id: 'uploader', icon: <Upload size={16} />, label: 'achUploader', cond: (s: { uploads: number }) => s.uploads >= 5 },
  { id: 'chatter', icon: <MessageSquare size={16} />, label: 'achChatter', cond: (s: { chats: number }) => s.chats >= 20 },
  { id: 'buddy', icon: <Hand size={16} />, label: 'achBuddy', cond: (s: { interactions: number }) => s.interactions >= 50 },
  { id: 'affection', icon: <Heart size={16} />, label: 'achAffection', cond: () => false, custom: (a: number) => a >= 100 },
]

export default function PetPage() {
  const { t } = useTranslation()
  const nickname = usePetStore((s) => s.nickname)
  const affection = usePetStore((s) => s.affection)
  const stats = usePetStore((s) => s.stats)
  const log = usePetStore((s) => s.log)
  const rename = usePetStore((s) => s.rename)
  const clearLog = usePetStore((s) => s.clearLog)
  const addAffection = usePetStore((s) => s.addAffection)
  const setMood = usePetStore((s) => s.setMood)
  const characterId = usePetStore((s) => s.characterId)
  const setCharacter = usePetStore((s) => s.setCharacter)
  const petColor = usePetStore((s) => s.petColor)
  const setPetColor = usePetStore((s) => s.setPetColor)
  const tryPet = usePetStore((s) => s.tryPet)
  const petTodayCount = usePetStore((s) => s.petTodayCount)
  const petTodayDate = usePetStore((s) => s.petTodayDate)
  const customImage = usePetStore((s) => s.customImage)
  const setCustomImage = usePetStore((s) => s.setCustomImage)

  const [nameInput, setNameInput] = useState(nickname)
  const [editingName, setEditingName] = useState(false)
  const [petTip, setPetTip] = useState('')
  const [customTip, setCustomTip] = useState('')
  const [confirmClearLog, setConfirmClearLog] = useState(false)
  const [confirmRemoveCustom, setConfirmRemoveCustom] = useState(false)
  const customFileRef = useRef<HTMLInputElement>(null)

  const level = getPetLevel(affection)
  // 自定义形象未上传时回退默认云朵，避免宠物消失
  const character = getCharacter(characterId)
  const activeCharacter = character.id === 'custom' && !customImage ? getCharacter('cloud') : character
  const levelName = t(activeCharacter.levelNameKeys[level - 1])
  const levelDesc = t(activeCharacter.levelDescKeys[level - 1])
  const levelIcon = LEVEL_ICONS[level]
  const nextThreshold = LEVEL_THRESHOLDS[level]
  const prevThreshold = level === 1 ? 0 : level === 2 ? LEVEL_THRESHOLDS[1] : LEVEL_THRESHOLDS[2]
  const progress = Math.min(100, Math.round(((affection - prevThreshold) / (nextThreshold - prevThreshold)) * 100))
  const displaySize = DISPLAY_SIZES[level]
  const CharacterRenderer = activeCharacter.Renderer
  // 今日剩余可加好感的触摸次数（跨天自动重置）
  const today = new Date().toDateString()
  const todayTouchCount = petTodayDate === today ? petTodayCount : 0
  const remainingTouch = Math.max(0, PET_DAILY_TOUCH_LIMIT - todayTouchCount)

  const achievements = ACHIEVEMENTS()
  const unlockedCount = achievements.filter((a) =>
    a.custom ? a.custom(affection) : a.cond(stats)
  ).length

  const handleRename = () => {
    rename(nameInput)
    setEditingName(false)
  }

  const handlePet = () => {
    // 摸摸互动：受冷却（10 分钟）与每日上限（10 次）约束；
    // 无论是否有效都触发庆祝动画，但只有通过校验才增加好感度。
    setMood('celebrate')
    const result = tryPet()
    if (result.success) {
      addAffection(1, 'interactions', `${t('pet.logInteract')}，好感度 +1`)
      setPetTip(t('pet.touchSuccess'))
    } else if (result.reason === 'cooldown') {
      setPetTip(t('pet.touchCooldown'))
    } else {
      setPetTip(t('pet.touchLimit'))
    }
    setTimeout(() => {
      setMood('idle')
      setPetTip('')
    }, 3000)
  }

  const handleCustomImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!/^image\/(png|gif|webp)/.test(file.type)) {
      setCustomTip(t('pet.customTypeError'))
      setTimeout(() => setCustomTip(''), 3000)
      return
    }
    if (file.size > MAX_CUSTOM_IMAGE_SIZE) {
      setCustomTip(t('pet.customTooLarge'))
      setTimeout(() => setCustomTip(''), 3000)
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setCustomImage(reader.result as string)
      setCharacter('custom')
      setCustomTip(t('pet.customSuccess'))
      setTimeout(() => setCustomTip(''), 3000)
    }
    reader.onerror = () => {
      setCustomTip(t('pet.customFailed'))
      setTimeout(() => setCustomTip(''), 3000)
    }
    reader.readAsDataURL(file)
  }

  const handleRemoveCustom = () => {
    setCustomImage(null)
    setCharacter('cloud')
  }

  const handleClearLog = () => {
    clearLog()
    setConfirmClearLog(false)
  }

  const statItems = [
    { icon: <BookOpen size={16} />, label: t('pet.statNotes'), value: stats.notes },
    { icon: <GraduationCap size={16} />, label: t('pet.statReviews'), value: stats.reviews },
    { icon: <Upload size={16} />, label: t('pet.statUploads'), value: stats.uploads },
    { icon: <MessageSquare size={16} />, label: t('pet.statChats'), value: stats.chats },
    { icon: <Rss size={16} />, label: t('pet.statPosts'), value: stats.posts },
    { icon: <Timer size={16} />, label: t('pet.statPomodoros'), value: stats.pomodoros },
    { icon: <Hand size={16} />, label: t('pet.statInteractions'), value: stats.interactions },
  ]

  return (
    <div className="max-w-3xl mx-auto py-8 px-6">
      <FadeIn>
        <h1 className="font-heading text-xl font-semibold text-[var(--color-text)] mb-6">
          {t('pet.raiseTitle')}
        </h1>

        {/* 主卡：形象展示 + 好感度 */}
        <div className="bg-[var(--color-card)] rounded-lg border border-[var(--color-border)] p-6 mb-6 relative overflow-hidden">
          <div className="aurora-blob aurora-blob-2" style={{ width: 300, height: 300, opacity: 0.15 }} />
          <div className="flex flex-col items-center gap-4 relative">
            {/* 大图展示：干净容器（relative 定位 + 展示尺寸），pet-visual 正确参照 */}
            <div
              className="relative"
              style={{ width: displaySize, height: displaySize, ...(petColor ? { '--pet-body': petColor } : {}) } as React.CSSProperties}
            >
              <div className="pet-visual">
                <CharacterRenderer mood="idle" level={level} />
                <LevelDecor mood="idle" level={level} />
              </div>
            </div>
            <div className="text-center">
              <h2 className="text-lg font-semibold text-[var(--color-text)] flex items-center justify-center gap-2">
                {nickname}
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--color-accent-bg)] text-[var(--color-accent)] text-xs font-medium">
                  {levelIcon}
                  {levelName}
                </span>
              </h2>
              <p className="text-xs text-[var(--color-text-tertiary)] mt-1 max-w-md">
                {levelDesc}
              </p>
            </div>

            {/* 好感度进度条 */}
            <div className="w-full max-w-sm">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-[var(--color-text-secondary)] flex items-center gap-1">
                  <Heart size={12} className="text-[var(--color-danger)]" /> {t('pet.affection')}
                </span>
                <span className="text-[var(--color-text-secondary)]">
                  {affection} / {nextThreshold >= 9999 ? 'MAX' : nextThreshold}
                  {level < 3 && `（${t('pet.toNextLevel')} ${nextThreshold - affection}）`}
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-[var(--color-bg-tertiary)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[var(--color-accent)] to-[#d0579b] transition-all duration-700"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-[var(--color-text-tertiary)] mt-2 text-center">
                {t('pet.affectionHint')}
              </p>
            </div>

            {/* 互动按钮 */}
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={handlePet}
                className="primary-button"
              >
                <Hand size={16} /> {t('pet.petButton')}（+1）
              </button>
              <p className="text-xs text-[var(--color-text-tertiary)]">
                {t('pet.touchRemaining', { count: remainingTouch })}
              </p>
              {petTip && (
                <p className="text-xs text-[var(--color-warning)]">{petTip}</p>
              )}
            </div>
          </div>
        </div>

        {/* 形象 + 颜色 */}
        <div className="bg-[var(--color-card)] rounded-lg border border-[var(--color-border)] p-5 mb-6">
          <h3 className="text-sm font-medium text-[var(--color-text)] mb-3 flex items-center gap-2">
            <Sparkles size={14} className="text-[var(--color-text-secondary)]" /> {t('pet.characterTitle')}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 mb-2">
            {PET_CHARACTERS.map((char) => {
              const Preview = char.Renderer
              const active = characterId === char.id
              const isCustom = char.id === 'custom'
              return (
                <div
                  key={char.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    // 自定义形象未上传时点击 = 打开文件选择器
                    if (isCustom && !customImage) {
                      customFileRef.current?.click()
                      return
                    }
                    setCharacter(char.id)
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCharacter(char.id) } }}
                  className={`relative flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors cursor-pointer ${
                    active
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent-bg)]'
                      : 'border-[var(--color-border)] hover:border-[var(--color-accent)] hover:bg-[var(--color-bg-secondary)]'
                  }`}
                >
                  {isCustom ? (
                    customImage ? (
                      <img
                        src={customImage}
                        alt="custom pet"
                        className="w-14 h-14 object-contain shrink-0 rounded-md"
                        draggable={false}
                      />
                    ) : (
                      <div className="w-14 h-14 shrink-0 rounded-md border-2 border-dashed border-[var(--color-border)] flex items-center justify-center bg-[var(--color-bg-secondary)]">
                        <ImageIcon size={20} className="text-[var(--color-text-tertiary)]" />
                      </div>
                    )
                  ) : (
                    <div className="w-14 h-14 shrink-0" style={petColor ? { '--pet-body': petColor } as React.CSSProperties : undefined}>
                      <Preview mood="idle" level={level} />
                    </div>
                  )}
                  <div className="text-left flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${active ? 'text-[var(--color-accent)]' : 'text-[var(--color-text)]'}`}>
                      {t(char.nameKey)}
                    </p>
                    <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5 truncate">
                      {isCustom ? (customImage ? t('pet.customUploaded') : t('pet.customEmpty')) : t('pet.characterTip')}
                    </p>
                  </div>
                  {active && <Check size={16} className="ml-auto shrink-0 text-[var(--color-accent)]" />}
                  {isCustom && customImage && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmRemoveCustom(true) }}
                      className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-[var(--color-danger)] text-white flex items-center justify-center hover:opacity-80 transition-opacity shadow-sm"
                      title={t('pet.customRemove')}
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          <input
            ref={customFileRef}
            type="file"
            accept="image/png,image/gif,image/webp"
            className="hidden"
            onChange={handleCustomImageChange}
          />
          {customTip ? (
            <p className="text-xs text-[var(--color-warning)] mb-1">{customTip}</p>
          ) : (
            <p className="text-xs text-[var(--color-text-tertiary)] mb-1">{t('pet.customHint')}</p>
          )}

          <h3 className="text-sm font-medium text-[var(--color-text)] mb-3 flex items-center gap-2">
            <Heart size={14} className="text-[var(--color-danger)]" /> {t('pet.colorTitle')}
          </h3>
          <div className="flex items-center gap-3 flex-wrap">
            {PET_COLORS.map((c) => (
              <button
                key={c.label}
                onClick={() => setPetColor(c.value)}
                title={t(`pet.color${c.label === 'default' ? 'Default' : c.label.charAt(0).toUpperCase() + c.label.slice(1)}`)}
                className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${
                  petColor === c.value ? 'border-[var(--color-accent)] scale-110' : 'border-transparent'
                }`}
                style={{ background: c.color }}
                aria-label={c.label}
              />
            ))}
            <label
              className="w-8 h-8 rounded-full border-2 border-dashed border-[var(--color-border)] flex items-center justify-center cursor-pointer hover:border-[var(--color-accent)] transition-colors"
              title={t('pet.colorCustom')}
              style={{ background: petColor && !PET_COLORS.some((c) => c.value === petColor) ? petColor : 'transparent' }}
            >
              <input
                type="color"
                value={petColor || '#1F6C9F'}
                onChange={(e) => setPetColor(e.target.value)}
                className="w-0 h-0 opacity-0"
              />
              <Plus size={14} className="text-[var(--color-text-tertiary)]" />
            </label>
          </div>
        </div>

        {/* 昵称 + 统计 */}
        <div className="grid gap-6 md:grid-cols-2 mb-6">
          <div className="bg-[var(--color-card)] rounded-lg border border-[var(--color-border)] p-5">
            <h3 className="text-sm font-medium text-[var(--color-text)] mb-3 flex items-center gap-2">
              <Pencil size={14} className="text-[var(--color-text-secondary)]" /> {t('pet.customName')}
            </h3>
            {editingName ? (
              <div className="flex gap-2">
                <input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  maxLength={12}
                  placeholder={t('pet.namePlaceholder')}
                  className="flex-1 px-3 py-2 text-sm rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                />
                <button
                  onClick={handleRename}
                  className="btn-press px-3 py-2 text-sm rounded-md bg-[var(--color-accent)] text-[var(--color-accent-foreground)] hover:bg-[var(--color-accent-hover)] transition-colors"
                >
                  <Check size={16} />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--color-text)]">{nickname}</span>
                <button
                  onClick={() => { setNameInput(nickname); setEditingName(true) }}
                  className="secondary-button"
                >
                  {t('pet.editName')}
                </button>
              </div>
            )}
            <p className="text-xs text-[var(--color-text-tertiary)] mt-2">{t('pet.nameHint')}</p>
          </div>

          <div className="bg-[var(--color-card)] rounded-lg border border-[var(--color-border)] p-5">
            <h3 className="text-sm font-medium text-[var(--color-text)] mb-3 flex items-center gap-2">
              <Sparkles size={14} className="text-[var(--color-text-secondary)]" /> {t('pet.platformStats')}
            </h3>
            <div className="space-y-2">
              {statItems.map(({ icon, label, value }) => (
                <div key={label} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-[var(--color-text-secondary)]">
                    {icon} {label}
                  </span>
                  <span className="font-medium text-[var(--color-text)]">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 成就 + 记录 */}
        <div className="grid gap-6 md:grid-cols-2 mb-6">
          <div className="bg-[var(--color-card)] rounded-lg border border-[var(--color-border)] p-5">
            <h3 className="text-sm font-medium text-[var(--color-text)] mb-3 flex items-center gap-2">
              <Crown size={14} className="text-[var(--color-text-secondary)]" />
              {t('pet.achievements')}
              <span className="text-xs text-[var(--color-text-tertiary)]">（{unlockedCount}/{achievements.length}）</span>
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {achievements.map((a) => {
                const unlocked = a.custom ? a.custom(affection) : a.cond(stats)
                return (
                  <div
                    key={a.id}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md text-xs border transition-colors ${
                      unlocked
                        ? 'bg-[var(--color-accent-bg)] border-[var(--color-accent)] text-[var(--color-accent)]'
                        : 'bg-[var(--color-bg-secondary)] border-transparent text-[var(--color-text-tertiary)] opacity-60'
                    }`}
                    title={t(`pet.${a.label}`)}
                  >
                    {a.icon}
                    <span className="truncate">{t(`pet.${a.label}`)}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="bg-[var(--color-card)] rounded-lg border border-[var(--color-border)] p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-[var(--color-text)] flex items-center gap-2">
                <Star size={14} className="text-[var(--color-text-secondary)]" /> {t('pet.logTitle')}
              </h3>
              {log.length > 0 && (
                <button
                  onClick={() => setConfirmClearLog(true)}
                  className="flex items-center gap-1 text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] transition-colors"
                >
                  <Trash2 size={12} /> {t('pet.clearLog')}
                </button>
              )}
            </div>
            {log.length === 0 ? (
              <p className="text-xs text-[var(--color-text-tertiary)] py-6 text-center">{t('pet.logEmpty')}</p>
            ) : (
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {log.map((entry, i) => (
                  <div key={entry.time + '-' + i} className="flex items-start gap-2 text-xs">
                    <span className="text-[var(--color-text-tertiary)] shrink-0">
                      {new Date(entry.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="text-[var(--color-text-secondary)]">{entry.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 好感度获取指南 */}
        <div className="bg-[var(--color-card)] rounded-lg border border-[var(--color-border)] p-5">
          <h3 className="text-sm font-medium text-[var(--color-text)] mb-3 flex items-center gap-2">
            <Heart size={14} className="text-[var(--color-danger)]" /> {t('pet.growGuide')}
          </h3>
          <div className="grid gap-2 text-xs text-[var(--color-text-secondary)] md:grid-cols-2">
            <p className="flex items-center gap-2"><BookOpen size={13} /> {t('pet.guideNote')}</p>
            <p className="flex items-center gap-2"><GraduationCap size={13} /> {t('pet.guideReview')}</p>
            <p className="flex items-center gap-2"><Upload size={13} /> {t('pet.guideUpload')}</p>
            <p className="flex items-center gap-2"><MessageSquare size={13} /> {t('pet.guideChat')}</p>
            <p className="flex items-center gap-2"><Hand size={13} /> {t('pet.guidePet')}</p>
            <p className="flex items-center gap-2"><Sparkles size={13} /> {t('pet.guideLevel')}</p>
          </div>
        </div>
      </FadeIn>

      <ConfirmDialog
        open={confirmClearLog}
        onOpenChange={setConfirmClearLog}
        title={t('pet.clearLogTitle')}
        message={t('pet.clearLogConfirm')}
        variant="danger"
        confirmText={t('pet.clearLog')}
        onConfirm={handleClearLog}
      />

      <ConfirmDialog
        open={confirmRemoveCustom}
        onOpenChange={setConfirmRemoveCustom}
        title={t('pet.removeCustomTitle')}
        message={t('pet.removeCustomConfirm')}
        variant="danger"
        confirmText={t('pet.customRemove')}
        onConfirm={handleRemoveCustom}
      />
    </div>
  )
}
