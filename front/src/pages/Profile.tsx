import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Camera, Lock, Save, X, Eye, EyeOff, Loader2, Pencil } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { authApi } from '../api/auth'
import { useUserStore } from '../stores/useUserStore'
import type { UserInfo } from '../types/api'
import AccountLayout, { AccountHeader } from '../components/account/AccountLayout'

// 用户未填写个人简介时的默认简介
const DEFAULT_BIO = '短短的简介介绍不了我(=^▽^=)'

/** 把后端返回的 date_joined 格式化为 YYYY-MM-DD；非法值返回空串 */
function formatDate(value?: string): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export default function Profile() {
  const { t } = useTranslation()
  const { userInfo, setUserInfo, token } = useUserStore()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ username: '', email: '', phone: '', gender: '', bio: '' })
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  // 头像上传
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  const handleAvatarClick = () => {
    avatarInputRef.current?.click()
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // 重置 input 值，允许之后重新选择同一文件
    e.target.value = ''
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setMessage(t('profile.avatarTypeError'))
      setTimeout(() => setMessage(''), 3000)
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage(t('profile.avatarSizeError'))
      setTimeout(() => setMessage(''), 3000)
      return
    }

    setUploadingAvatar(true)
    try {
      const res = await authApi.uploadAvatar(file)
      const url = (res.data as { url?: string } | undefined)?.url
      if (url) {
        const info: UserInfo = { ...(userInfo as UserInfo), avatar: url }
        setUserInfo(info)
        setMessage(t('profile.avatarUpdated'))
      } else {
        setMessage(t('profile.avatarFailed'))
      }
    } catch {
      setMessage(t('profile.avatarFailed'))
    } finally {
      setUploadingAvatar(false)
      setTimeout(() => setMessage(''), 3000)
    }
  }

  const [pwdOpen, setPwdOpen] = useState(false)
  const [pwdForm, setPwdForm] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' })
  const [showPwd, setShowPwd] = useState({ old: false, new: false, confirm: false })
  const [pwdLoading, setPwdLoading] = useState(false)
  const [pwdError, setPwdError] = useState('')

  useEffect(() => {
    if (token) {
      authApi.getProfile().then((res) => {
        const data = (res.data as UserInfo | undefined)
        if (data) {
          const info: UserInfo = {
            username: data.username as string || '',
            email: data.email as string || '',
            phone: (data as unknown as { telephone?: string }).telephone || '',
            gender: data.gender as string || '',
            bio: data.bio as string || '',
            id: data.id as string,
            avatar: data.avatar as string,
            // 注册时间：后端 /user/detail/ 已返回 date_joined
            date_joined: data.date_joined || '',
          }
          setUserInfo(info)
        }
      }).catch(() => {})
    }
  }, [token, setUserInfo])

  useEffect(() => {
    if (userInfo) {
      // setTimeout 包裹：effect 体内不直接 setState
      const timer = window.setTimeout(() => {
        setForm({
          username: (userInfo.username as string) || '',
          email: (userInfo.email as string) || '',
          phone: (userInfo.phone as string) || '',
          gender: (userInfo.gender as string) || '',
          bio: (userInfo.bio as string) || '',
        })
      }, 0)
      return () => window.clearTimeout(timer)
    }
  }, [userInfo])

  const handleSave = async () => {
    setLoading(true)
    try {
      const payload = {
        username: form.username || undefined,
        telephone: form.phone || undefined,
        gender: form.gender ? Number(form.gender) : undefined,
        // 未填写简介时自动填入默认简介
        bio: form.bio?.trim() || DEFAULT_BIO,
      }
      const res = await authApi.updateProfile(payload)
      const newToken = (res as { token?: string }).token
      if (newToken) {
        useUserStore.getState().setToken(newToken)
      }
      const userField = (res as { user?: Record<string, unknown> }).user
      if (userField) {
        const info: UserInfo = {
          username: (userField.username as string) || form.username,
          email: (userField.email as string) || form.email,
          phone: (userField.telephone as string) || form.phone,
          gender: String(userField.gender ?? form.gender),
          bio: (userField.bio as string) || form.bio,
        }
        setUserInfo(info as UserInfo)
        setMessage(t('profile.save') + ' OK')
      }
      setEditing(false)
    } catch {
      setMessage('Error')
    } finally {
      setLoading(false)
      setTimeout(() => setMessage(''), 2000)
    }
  }

  const handlePasswordChange = async () => {
    const { oldPassword, newPassword, confirmPassword } = pwdForm
    if (!oldPassword || !newPassword || !confirmPassword) {
      setPwdError(t('common.fillAllFields'))
      return
    }
    if (newPassword.length < 6) {
      setPwdError(t('auth.passwordLength'))
      return
    }
    if (newPassword === oldPassword) {
      setPwdError(t('profile.samePassword'))
      return
    }
    if (newPassword !== confirmPassword) {
      setPwdError(t('profile.passwordMismatch'))
      return
    }
    setPwdLoading(true)
    setPwdError('')
    try {
      const res = await authApi.updatePassword(oldPassword, newPassword)
      if (res.token) {
        useUserStore.getState().setToken(res.token)
      }
      setPwdOpen(false)
      setPwdForm({ oldPassword: '', newPassword: '', confirmPassword: '' })
      setMessage(t('profile.passwordChanged'))
      setTimeout(() => setMessage(''), 2000)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setPwdError(detail || t('profile.passwordError'))
    } finally {
      setPwdLoading(false)
    }
  }

  const fields = [
    { key: 'username', label: t('profile.username') },
    { key: 'email', label: t('profile.email'), type: 'email' },
    { key: 'phone', label: t('profile.phone'), type: 'tel' },
  ]

  const genderText = form.gender
    ? t(`profile.${Number(form.gender) === 1 ? 'male' : 'female'}`)
    : t('account.notSet')
  const joinedText = formatDate(userInfo?.date_joined) || t('account.notSet')

  return (
    <AccountLayout>
      <AccountHeader
        breadcrumb={t('account.breadcrumb')}
        title={t('profile.title')}
        subtitle={t('account.profileSubtitle')}
        actions={
          editing ? (
            <>
              <button onClick={() => setEditing(false)} className="secondary-button">
                <X size={14} />{t('profile.cancel')}
              </button>
              <button onClick={handleSave} disabled={loading} className="primary-button">
                <Save size={14} />{t('profile.save')}
              </button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} className="secondary-button">
              <Pencil size={14} />{t('profile.edit')}
            </button>
          )
        }
      />

      {message && (
        <div className="account-message">{message}</div>
      )}

      <div className="account-body">
        <section className="account-panel">
          <div className={`account-identity${editing ? ' is-editing' : ''}`}>
            <div className="account-identity-avatar">
              {userInfo?.avatar
                ? <img src={userInfo.avatar} alt="" />
                : <span>{(userInfo?.username as string)?.slice(0, 1).toUpperCase() || '?'}</span>}
              <button
                className="account-identity-camera"
                onClick={handleAvatarClick}
                title={t('profile.changeAvatar')}
                aria-label={t('profile.changeAvatar')}
              >
                {uploadingAvatar ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
              </button>
            </div>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
            <div className="account-identity-copy">
              <div className="account-identity-name">{(userInfo?.username as string) || '-'}</div>
              <div className="account-identity-mail">{(userInfo?.email as string) || '-'}</div>
              {editing ? (
                <textarea
                  className="account-bio-input"
                  value={form.bio}
                  onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                  rows={2}
                  placeholder={t('profile.bio')}
                  aria-label={t('profile.bio')}
                />
              ) : (
                <div className="account-identity-bio">
                  <em>{t('profile.bio')}</em>
                  <span>{form.bio || DEFAULT_BIO}</span>
                </div>
              )}
            </div>
          </div>
          {editing && <p className="account-panel-hint">{t('account.identityHint')}</p>}
        </section>

        <section className="account-panel">
          <h2 className="account-panel-title">{t('account.basicInfo')}</h2>
          {fields.map(({ key, label, type = 'text' }) => (
            <div key={key} className="account-info-row">
              <span className="account-info-label">{label}</span>
              {editing ? (
                <input
                  className="account-info-input"
                  type={type}
                  value={form[key as keyof typeof form]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  aria-label={label}
                />
              ) : (
                <span className={`account-info-value${form[key as keyof typeof form] ? '' : ' is-muted'}`}>
                  {form[key as keyof typeof form] || t('account.notSet')}
                </span>
              )}
            </div>
          ))}

          <div className="account-info-row">
            <span className="account-info-label">{t('profile.gender')}</span>
            {editing ? (
              <div className="account-gender-group">
                {[1, 2].map((g) => (
                  <label key={g}>
                    <input
                      type="radio"
                      name="gender"
                      value={g}
                      checked={Number(form.gender) === g}
                      onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}
                    />
                    {t(`profile.${g === 1 ? 'male' : 'female'}`)}
                  </label>
                ))}
              </div>
            ) : (
              <span className={`account-info-value${form.gender ? '' : ' is-muted'}`}>{genderText}</span>
            )}
          </div>

          <div className="account-info-row">
            <span className="account-info-label">{t('profile.memberSince')}</span>
            <span className={`account-info-value${formatDate(userInfo?.date_joined) ? '' : ' is-muted'}`}>
              {joinedText}
            </span>
          </div>
        </section>

        <section className="account-panel">
          <h2 className="account-panel-title">{t('account.security')}</h2>
          <div className="account-info-row">
            <span className="account-info-label">{t('account.password')}</span>
            <button
              className="secondary-button is-compact"
              onClick={() => { setPwdOpen(true); setPwdError('') }}
            >
              <Lock size={14} />
              {t('profile.changePassword')}
            </button>
          </div>
        </section>
      </div>

      <Dialog.Root open={pwdOpen} onOpenChange={(open) => { setPwdOpen(open); if (!open) setPwdError('') }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[var(--color-card)] rounded-lg shadow-xl p-6 w-[420px] max-w-[90vw]">
            <div className="flex items-center justify-between mb-5">
              <Dialog.Title className="text-base font-medium text-[var(--color-text)]">
                {t('profile.changePassword')}
              </Dialog.Title>
              <Dialog.Close className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text)]">
                <X size={16} />
              </Dialog.Close>
            </div>

            {pwdError && (
              <div className="mb-4 px-4 py-2 rounded-md text-sm bg-[var(--color-danger-bg)] text-[var(--color-danger)]">
                {pwdError}
              </div>
            )}

            <div className="space-y-4">
              {(['oldPassword', 'newPassword', 'confirmPassword'] as const).map((field) => (
                <div key={field} className="space-y-1.5">
                  <label className="block text-sm text-[var(--color-text-secondary)]">
                    {field === 'oldPassword' ? t('profile.oldPassword') : field === 'newPassword' ? t('profile.newPassword') : t('profile.confirmPassword')}
                  </label>
                  <div className="relative">
                    <input
                      type={showPwd[field === 'oldPassword' ? 'old' : field === 'newPassword' ? 'new' : 'confirm'] ? 'text' : 'password'}
                      value={pwdForm[field]}
                      onChange={(e) => setPwdForm((f) => ({ ...f, [field]: e.target.value }))}
                      className="w-full px-4 py-2.5 pr-10 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-colors"
                      placeholder={field === 'oldPassword' ? t('profile.oldPassword') : field === 'newPassword' ? t('profile.newPassword') : t('profile.confirmPassword')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd((s) => ({ ...s, [field === 'oldPassword' ? 'old' : field === 'newPassword' ? 'new' : 'confirm']: !showPwd[field === 'oldPassword' ? 'old' : field === 'newPassword' ? 'new' : 'confirm'] }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
                    >
                      {showPwd[field === 'oldPassword' ? 'old' : field === 'newPassword' ? 'new' : 'confirm'] ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <Dialog.Close className="secondary-button">
                {t('profile.cancel')}
              </Dialog.Close>
              <button
                onClick={handlePasswordChange}
                disabled={pwdLoading}
                className="flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-[var(--color-accent)] text-[var(--color-accent-foreground)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
              >
                {pwdLoading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Lock size={14} />
                )}
                {t('profile.changePassword')}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </AccountLayout>
  )
}
