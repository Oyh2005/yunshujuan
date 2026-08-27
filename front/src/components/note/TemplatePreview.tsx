import { useMemo } from 'react'
import { Marked } from 'marked'
import DOMPurify from 'dompurify'
import './TemplatePreview.css'

// Use a separate parser so card previews cannot change the editor/export renderer.
const previewMarkdown = new Marked({
  gfm: true,
  renderer: {
    html: () => '',
    image: () => '',
    link({ tokens }) { return this.parser.parseInline(tokens) },
    // Previews sit inside a button: show task state without nested inputs/links.
    checkbox({ checked }) { return `<span>${checked ? '☑' : '☐'}</span> ` },
  },
})

interface TemplatePreviewProps {
  content: string
  compact?: boolean
}

export default function TemplatePreview({ content, compact = false }: TemplatePreviewProps) {
  const html = useMemo(() => DOMPurify.sanitize(
    // Parse the complete source first; cutting Markdown can break emphasis/tables.
    previewMarkdown.parse(content, { async: false }),
    {
      ALLOWED_TAGS: [
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr',
        'strong', 'em', 'del', 'code', 'pre', 'blockquote',
        'ul', 'ol', 'li', 'span', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
      ],
      ALLOWED_ATTR: [],
      ALLOW_DATA_ATTR: false,
      ALLOW_ARIA_ATTR: false,
    },
  ), [content])

  if (!html.trim()) return null

  return (
    <div
      className={`template-preview${compact ? ' template-preview--compact' : ''}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
