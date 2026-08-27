import type { Note } from '../../types/api'

export const predefinedCategories = ['work', 'study', 'life', 'project', 'other'] as const
export type NoteSort = 'updated_at' | 'created_at' | 'title'
export type NoteView = 'grid' | 'list'

export function categoryTone(category: string): string {
  const tones: Record<string, string> = { work: 'amber', study: 'mint', life: 'rose', project: 'violet' }
  return tones[category] || 'neutral'
}

export function notePreview(content: string): string {
  return content.slice(0, 4000)
    .replace(/```[^\n]*\n?/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s*|[-*+]\s+(?:\[[ xX]\]\s*)?|\d+\.\s+)/gm, '')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ').trim().slice(0, 220)
}

export function sortNotes(notes: Note[], sort: NoteSort): Note[] {
  return [...notes].sort((a, b) => {
    const pinned = Number(Boolean(b.is_pinned)) - Number(Boolean(a.is_pinned))
    if (pinned) return pinned
    if (sort === 'title') return a.title.localeCompare(b.title)
    return (Date.parse(b[sort]) || 0) - (Date.parse(a[sort]) || 0)
  })
}
