import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
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
  Cloud,
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
import AccountLayout, { AccountHeader } from '../components/account/AccountLayout'

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
  1: <Cloud size={14} />,
  2: <Star size={14} />,
  3: <Crown size={14} />,
}

/** 养成页主视觉的展示尺寸（px，随等级变大；右下角页宠仍用 LEVEL_SIZES） */
const DISPLAY_SIZES: Record<PetLevel, number> = { 1: 152, 2: 170, 3: 188 }

/** 自定义形象大小上限（KB）：localStorage 存储，避免撑爆 5MB 配额 */
const MAX_CUSTOM_IMAGE_SIZE = 500 * 1024

/** 成就定义（按统计解锁） */
const ACHIEVEMENTS = () => [
  { id: 'first_note', icon: <BookOpen size={14} />, label: 'achFirstNote', cond: (s: { notes: number }) => s.notes >= 1 },
  { id: 'note_master', icon: <BookOpen size={14} />, label: 'achNoteMaster', cond: (s: { notes: number }) => s.notes >= 10 },
  { id: 'reviewer', icon: <GraduationCap size={14} />, label: 'achReviewer', cond: (s: { reviews: number }) => s.reviews >= 10 },
  { id: 'uploader', icon: <Upload size={14} />, label: 'achUploader', cond: (s: { uploads: number }) => s.uploads >= 5 },
  { id: 'chatter', icon: <MessageSquare size={14} />, label: 'achChatter', cond: (s: { chats: number }) => s.chats >= 20 },
  { id: 'buddy', icon: <Hand size={14} />, label: 'achBuddy', cond: (s: { interactions: number }) => s.interactions >= 50 },
  { id: 'affection', icon: <Heart size={14} />, label: 'achAffection', cond: () => false, custom: (a: number) => a >= 100 },
]

/** 成长指南条目（与 store 的好感度规则保持一致） */
const GROW_GUIDE = [
  { icon: <BookOpen size={13} />, key: 'guideNote' },
  { icon: <GraduationCap size={13} />, key: 'guideReview' },
  { icon: <Upload size={13} />, key: 'guideUpload' },
  { icon: <MessageSquare size={13} />, key: 'guideChat' },
  { icon: <Hand size={13} />, key: 'guidePet' },
  { icon: <Sparkles size={13} />, key: 'guideLevel' },
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
    { icon: <BookOpen size={15} />, label: t('pet.statNotes'), value: stats.notes },
    { icon: <GraduationCap size={15} />, label: t('pet.statReviews'), value: stats.reviews },
    { icon: <Upload size={15} />, label: t('pet.statUploads'), value: stats.uploads },
    { icon: <MessageSquare size={15} />, label: t('pet.statChats'), value: stats.chats },
    { icon: <Rss size={15} />, label: t('pet.statPosts'), value: stats.posts },
    { icon: <Timer size={15} />, label: t('pet.statPomodoros'), value: stats.pomodoros },
    { icon: <Hand size={15} />, label: t('pet.statInteractions'), value: stats.interactions },
  ]

  const petStyle = { width: displaySize, height: displaySize, ...(petColor ? { '--pet-body': petColor } : {}) } as React.CSSProperties

  return (
    <AccountLayout className="is-wide">
      <AccountHeader
        breadcrumb={t('account.breadcrumbPet')}
        title={t('pet.raiseTitle')}
        subtitle={t('account.petSubtitle')}
      />

      <div className="account-body">
        {/* 主视觉：形象展示 + 好感度 + 互动 */}
        <section className="account-pet-hero">
          <div className="account-pet-hero-art" style={petStyle}>
            <div className="pet-visual">
              <CharacterRenderer mood="idle" level={level} />
              <LevelDecor mood="idle" level={level} />
            </div>
          </div>

          <div className="account-pet-hero-copy">
            <div className="account-pet-hero-name">
              <h2>{nickname}</h2>
              <span className="account-pet-level-badge">
                {levelIcon}
                Lv.{level} {levelName}
              </span>
            </div>
            <p className="account-pet-hero-desc">{levelDesc}</p>

            <div className="account-pet-affection">
              <div className="account-pet-affection-head">
                <span>
                  <Heart size={13} className="text-[var(--color-danger)]" />
                  {t('pet.affection')}
                </span>
                <span>
                  {affection} / {nextThreshold >= 9999 ? 'MAX' : nextThreshold}
                  {level < 3 && `（${t('pet.toNextLevel')} ${nextThreshold - affection}）`}
                </span>
              </div>
              <div
                className="account-pet-affection-track"
                role="progressbar"
                aria-label={t('pet.affection')}
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <i style={{ width: `${progress}%` }} />
              </div>
            </div>

            <div className="account-pet-hero-actions">
              <button onClick={handlePet} className="primary-button">
                <Hand size={16} /> {t('pet.petButton')}（+1）
              </button>
              <span className="account-pet-touch-hint">{t('pet.touchRemaining', { count: remainingTouch })}</span>
              {petTip && <span className="account-pet-touch-hint">{petTip}</span>}
            </div>
          </div>
        </section>

        <div className="account-split">
          <div>
            {/* 形象与颜色 */}
            <section className="account-panel">
              <div className="account-panel-head">
                <h2 className="account-panel-title">{t('pet.characterTitle')}</h2>
                <span className="account-panel-note">{t('pet.characterTip')}</span>
              </div>

              <div className="account-char-grid">
                {PET_CHARACTERS.map((char) => {
                  const Preview = char.Renderer
                  const active = characterId === char.id
                  const isCustom = char.id === 'custom'
                  return (
                    <div
                      key={char.id}
                      className={`account-char-card${active ? ' is-active' : ''}`}
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
                    >
                      <span className="account-char-thumb" style={petColor ? { '--pet-body': petColor } as React.CSSProperties : undefined}>
                        {isCustom ? (
                          customImage
                            ? <img src={customImage} alt="" draggable={false} />
                            : <ImageIcon size={20} className="text-[var(--color-text-tertiary)]" />
                        ) : (
                          <Preview mood="idle" level={level} />
                        )}
                      </span>
                      <span className="account-char-copy">
                        <strong>{t(char.nameKey)}</strong>
                        <small>{isCustom ? (customImage ? t('pet.customUploaded') : t('pet.customEmpty')) : t('pet.characterTip')}</small>
                      </span>
                      {active && <Check size={16} className="text-[var(--color-accent)]" />}
                      {isCustom && customImage && (
                        <button
                          className="account-char-remove"
                          onClick={(e) => { e.stopPropagation(); setConfirmRemoveCustom(true) }}
                          title={t('pet.customRemove')}
                          aria-label={t('pet.customRemove')}
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
              <p className="account-panel-hint">{customTip || t('pet.customHint')}</p>

              <div className="account-panel-head" style={{ marginTop: 22 }}>
                <h2 className="account-panel-title">{t('pet.colorTitle')}</h2>
              </div>
              <div className="account-color-dots">
                {PET_COLORS.map((c) => (
                  <button
                    key={c.label}
                    onClick={() => setPetColor(c.value)}
                    title={t(`pet.color${c.label === 'default' ? 'Default' : c.label.charAt(0).toUpperCase() + c.label.slice(1)}`)}
                    className={`account-color-dot${petColor === c.value ? ' is-active' : ''}`}
                    style={{ background: c.color }}
                    aria-label={c.label}
                  />
                ))}
                <label
                  className="account-color-dot is-custom"
                  title={t('pet.colorCustom')}
                  style={{ background: petColor && !PET_COLORS.some((c) => c.value === petColor) ? petColor : undefined }}
                >
                  <input
                    type="color"
                    value={petColor || '#1F6C9F'}
                    onChange={(e) => setPetColor(e.target.value)}
                    aria-label={t('pet.colorCustom')}
                  />
                  <Plus size={13} />
                </label>
              </div>
            </section>

            {/* 自定义昵称 */}
            <section className="account-panel">
              <div className="account-panel-head">
                <h2 className="account-panel-title">{t('pet.customName')}</h2>
              </div>
              {editingName ? (
                <div style={{ display: 'flex', gap: 10 }}>
                  <input
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    maxLength={12}
                    placeholder={t('pet.namePlaceholder')}
                    className="account-info-input"
                    style={{ width: '100%', maxWidth: '100%', textAlign: 'left' }}
                    aria-label={t('pet.customName')}
                  />
                  <button onClick={handleRename} className="secondary-button is-compact" aria-label={t('profile.save')}>
                    <Check size={15} />
                  </button>
                </div>
              ) : (
                <div className="account-setting-row" style={{ padding: 0 }}>
                  <div className="account-setting-copy">
                    <span className="account-setting-icon"><Pencil size={18} /></span>
                    <span className="account-setting-text"><strong>{nickname}</strong></span>
                  </div>
                  <button
                    className="secondary-button is-compact"
                    onClick={() => { setNameInput(nickname); setEditingName(true) }}
                  >
                    {t('pet.editName')}
                  </button>
                </div>
              )}
              <p className="account-panel-hint">{t('pet.nameHint')}</p>
            </section>

            {/* 互动记录 */}
            <section className="account-panel">
              <div className="account-panel-head">
                <h2 className="account-panel-title">{t('pet.logTitle')}</h2>
                {log.length > 0 && (
                  <button className="account-ghost-button" onClick={() => setConfirmClearLog(true)}>
                    <Trash2 size={12} /> {t('pet.clearLog')}
                  </button>
                )}
              </div>
              {log.length === 0 ? (
                <p className="account-empty-hint">{t('pet.logEmpty')}</p>
              ) : (
                <div>
                  {log.map((entry, i) => (
                    <div key={`${entry.time}-${i}`} className="account-log-row">
                      <time>
                        {new Date(entry.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                      </time>
                      <p>{entry.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div>
            {/* 平台互动统计 */}
            <section className="account-panel">
              <h2 className="account-panel-title">{t('pet.platformStats')}</h2>
              {statItems.map(({ icon, label, value }) => (
                <div key={label} className="account-stat-row">
                  <span>{icon}{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </section>

            {/* 成就 */}
            <section className="account-panel">
              <div className="account-panel-head">
                <h2 className="account-panel-title">{t('pet.achievements')}</h2>
                <span className="account-panel-note">（{unlockedCount}/{achievements.length}）</span>
              </div>
              <div className="account-ach-grid">
                {achievements.map((a) => {
                  const unlocked = a.custom ? a.custom(affection) : a.cond(stats)
                  return (
                    <div
                      key={a.id}
                      className={`account-ach ${unlocked ? 'is-on' : 'is-off'}`}
                      title={t(`pet.${a.label}`)}
                    >
                      {a.icon}
                      <span>{t(`pet.${a.label}`)}</span>
                    </div>
                  )
                })}
              </div>
            </section>

            {/* 好感度获取指南 */}
            <section className="account-panel">
              <h2 className="account-panel-title">{t('pet.growGuide')}</h2>
              <div className="account-guide-grid is-single">
                {GROW_GUIDE.map(({ icon, key }) => (
                  <div key={key} className="account-guide-item">
                    {icon}
                    <span>{t(`pet.${key}`)}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>

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
    </AccountLayout>
  )
}
