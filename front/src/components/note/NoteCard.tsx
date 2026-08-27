import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { CheckSquare, FileText, MoreHorizontal, Pencil, Pin, Square } from 'lucide-react'
import type { Note } from '../../types/api'
import { categoryTone, notePreview, predefinedCategories } from './notePresentation'

interface NoteCardProps {
  note: Note
  selected: boolean
  selectMode: boolean
  pinPending: boolean
  onOpen: () => void
  onSelect: () => void
  onPin: () => void
}

export default function NoteCard({ note, selected, selectMode, pinPending, onOpen, onSelect, onPin }: NoteCardProps) {
  const { t, i18n } = useTranslation()
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pointerStart = useRef({ x: 0, y: 0 })
  const suppressClick = useRef(false)
  const clearPress = () => { clearTimeout(timer.current); timer.current = undefined }
  useEffect(() => () => clearTimeout(timer.current), [])
  const title = note.title || t('note.ui.untitled')
  const category = predefinedCategories.some((value) => value === note.category)
    ? t(`note.ui.categories.${note.category}`) : (note.category || t('note.ui.uncategorized'))
  const date = new Date(note.updated_at || note.created_at)
  const validDate = !Number.isNaN(date.getTime())
  const locale = i18n.resolvedLanguage || 'zh-CN'

  return (
    <article className={`note-card note-tone-${categoryTone(note.category)}${note.is_pinned ? ' is-pinned' : ''}${selected ? ' is-selected' : ''}`}>
      <button
        type="button"
        className="note-card-hitarea"
        aria-label={t(selectMode ? 'note.ui.selectNote' : 'note.ui.openNote', { title })}
        aria-pressed={selectMode ? selected : undefined}
        onPointerDown={(event) => {
          if (event.button !== 0 || !event.isPrimary) return
          clearPress()
          suppressClick.current = false
          pointerStart.current = { x: event.clientX, y: event.clientY }
          if (!selectMode) timer.current = setTimeout(() => { suppressClick.current = true; onSelect() }, 500)
        }}
        onPointerMove={(event) => {
          if (Math.abs(event.clientX - pointerStart.current.x) > 10 || Math.abs(event.clientY - pointerStart.current.y) > 10) {
            clearPress()
            suppressClick.current = true
          }
        }}
        onPointerUp={clearPress}
        onPointerLeave={clearPress}
        onPointerCancel={() => { clearPress(); suppressClick.current = true }}
        onClick={(event) => {
          if (suppressClick.current && event.detail !== 0) { suppressClick.current = false; return }
          if (selectMode) onSelect()
          else onOpen()
        }}
      />
      <div className="note-card-header">
        <div className="note-card-icon" aria-hidden="true">
          {selectMode ? (selected ? <CheckSquare size={23} /> : <Square size={23} />) : <FileText size={23} strokeWidth={1.6} />}
        </div>
        <div className="note-card-actions">
          <button className="workspace-icon-button" onClick={onPin} disabled={pinPending} aria-label={t(note.is_pinned ? 'note.ui.unpin' : 'note.ui.pin')} aria-pressed={note.is_pinned} title={t(note.is_pinned ? 'note.ui.unpin' : 'note.ui.pin')}>
            <Pin size={16} className={note.is_pinned ? 'text-[var(--color-accent)] fill-[var(--color-accent)]' : ''} />
          </button>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild><button className="workspace-icon-button" aria-label={t('note.ui.moreActions', { title })}><MoreHorizontal size={19} /></button></DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content className="workspace-menu" sideOffset={6} align="end" collisionPadding={12}>
                <DropdownMenu.Item className="workspace-menu-item" onSelect={onOpen}><Pencil size={15} />{t('note.ui.edit')}</DropdownMenu.Item>
                <DropdownMenu.Item className="workspace-menu-item" onSelect={onPin} disabled={pinPending}><Pin size={15} />{t(note.is_pinned ? 'note.ui.unpin' : 'note.ui.pin')}</DropdownMenu.Item>
                <DropdownMenu.Separator className="workspace-menu-separator" />
                <DropdownMenu.Item className="workspace-menu-item" onSelect={onSelect}><CheckSquare size={15} />{t(selected ? 'note.ui.deselect' : 'note.ui.select')}</DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>
      <div className="note-card-body">
        <h2 className="note-card-title" title={title}>{title}</h2>
        <p className="note-card-preview">{notePreview(note.content || '') || t('note.ui.noPreview')}</p>
        <div className="note-card-tags">
          {note.tags?.slice(0, 3).map((tag, index) => <span key={`${tag}-${index}`} className="note-keyword">{tag}</span>)}
          {note.tags?.length > 3 && <span className="note-keyword">+{note.tags.length - 3}</span>}
        </div>
      </div>
      <div className="note-card-footer">
        <span className="note-category">{category}</span>
        <time dateTime={validDate ? date.toISOString() : undefined} title={validDate ? date.toLocaleString(locale) : undefined}>
          {validDate ? date.toLocaleDateString(locale, { month: 'short', day: 'numeric' }) : '—'}
        </time>
      </div>
    </article>
  )
}
