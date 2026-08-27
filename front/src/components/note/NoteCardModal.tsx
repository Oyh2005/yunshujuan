import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Download, Share2, Sparkles } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

/** 卡片模板 */
type CardTemplate = 'white' | 'gradient' | 'dark'

const CARD_W = 1200
const CARD_H = 630

interface NoteCardModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  content: string
  tags: string[]
}

/** 去除 Markdown 符号，得到纯文本摘要 */
function plainSummary(content: string, maxLen = 160): string {
  const cleaned = content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~|]/g, ' ')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned.length > maxLen ? `${cleaned.slice(0, maxLen)}…` : cleaned
}

/** 克隆页宠 SVG → 内联计算样式（CSS 变量在独立图片中失效）→ data URL */
async function loadPetImage(): Promise<HTMLImageElement | null> {
  try {
    const container = document.querySelector('[data-pet-svg]')
    const svg = container?.querySelector('svg')
    if (!svg) return null
    const clone = svg.cloneNode(true) as SVGSVGElement
    const originals = svg.querySelectorAll('*')
    const clones = clone.querySelectorAll('*')
    originals.forEach((el, i) => {
      const c = clones[i]
      if (!(el instanceof SVGElement) || !(c instanceof SVGElement)) return
      const cs = getComputedStyle(el)
      for (const prop of ['fill', 'stroke', 'color', 'opacity'] as const) {
        const val = cs.getPropertyValue(prop)
        if (val && val !== 'none' && val !== 'auto' && !val.startsWith('var(')) {
          c.style.setProperty(prop, val)
        }
      }
    })
    const rootCs = getComputedStyle(svg)
    for (const prop of ['fill', 'stroke'] as const) {
      const val = rootCs.getPropertyValue(prop)
      if (val && val !== 'none' && val !== 'auto' && !val.startsWith('var(')) {
        clone.style.setProperty(prop, val)
      }
    }
    const xml = new XMLSerializer().serializeToString(clone)
    const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('svg load failed'))
      img.src = dataUrl
    })
    return img
  } catch {
    return null
  }
}

/** 逐字换行（中文友好），超出 maxLines 加省略号 */
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxWidth && line) {
      lines.push(line)
      line = ch
      if (lines.length === maxLines) break
    } else {
      line += ch
    }
  }
  if (lines.length < maxLines) {
    if (line) lines.push(line)
  } else if (lines.length === maxLines) {
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/…$/, '').slice(0, -1)}…`
  }
  return lines
}

/** 在 canvas 上绘制卡片 */
function drawCard(
  canvas: HTMLCanvasElement,
  opts: {
    title: string
    summary: string
    tags: string[]
    date: string
    template: CardTemplate
    petImage: HTMLImageElement | null
  }
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const { title, summary, tags, date, template, petImage } = opts

  // ── 背景 ──
  const isDark = template !== 'white'
  if (template === 'gradient') {
    const grad = ctx.createLinearGradient(0, 0, CARD_W, CARD_H)
    grad.addColorStop(0, '#1f6c9f')
    grad.addColorStop(0.55, '#7c6cf0')
    grad.addColorStop(1, '#d0579b')
    ctx.fillStyle = grad
  } else {
    ctx.fillStyle = template === 'white' ? '#ffffff' : '#16161d'
  }
  ctx.fillRect(0, 0, CARD_W, CARD_H)

  // 品牌装饰：左上小圆点
  ctx.fillStyle = isDark ? 'rgba(255,255,255,0.25)' : 'rgba(31,108,159,0.25)'
  ctx.beginPath()
  ctx.arc(64, 64, 6, 0, Math.PI * 2)
  ctx.fill()

  const textColor = isDark ? '#f2f2f2' : '#1a1a1a'
  const subColor = isDark ? 'rgba(255,255,255,0.65)' : 'rgba(26,26,26,0.6)'
  const tagBg = isDark ? 'rgba(255,255,255,0.16)' : 'rgba(31,108,159,0.1)'
  const tagText = isDark ? '#ffffff' : '#1f6c9f'

  // ── 标题（最多 2 行）──
  ctx.font = 'bold 52px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.fillStyle = textColor
  ctx.textBaseline = 'top'
  const titleLines = wrapLines(ctx, title || '无标题', CARD_W - 128, 2)
  titleLines.forEach((line, i) => {
    ctx.fillText(line, 64, 96 + i * 68, CARD_W - 128)
  })

  // ── 摘要（最多 6 行）──
  ctx.font = '24px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.fillStyle = subColor
  const summaryLines = wrapLines(ctx, summary, CARD_W - 128, 6)
  summaryLines.forEach((line, i) => {
    ctx.fillText(line, 64, 300 + i * 38, CARD_W - 128)
  })

  // ── 标签胶囊（最多 6 个）──
  ctx.font = '18px "PingFang SC", "Microsoft YaHei", sans-serif'
  let tagX = 64
  const tagY = 540
  const tagsToDraw = tags.slice(0, 6)
  for (const tag of tagsToDraw) {
    const w = ctx.measureText(tag).width + 36
    if (tagX + w > CARD_W - 64) break
    ctx.fillStyle = tagBg
    roundRect(ctx, tagX, tagY, w, 34, 17)
    ctx.fill()
    ctx.fillStyle = tagText
    ctx.fillText(tag, tagX + 18, tagY + 9)
    tagX += w + 12
  }

  // ── 日期 ──
  ctx.font = '18px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.fillStyle = subColor
  ctx.fillText(date, 64, 592)

  // ── 页宠小图 + 品牌水印（右下角）──
  if (petImage) {
    const pw = 110
    const ph = (110 * 90) / 120
    ctx.save()
    ctx.globalAlpha = 0.92
    ctx.drawImage(petImage, CARD_W - 64 - pw, CARD_H - 52 - ph, pw, ph)
    ctx.restore()
  }
  ctx.font = '15px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.fillStyle = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(26,26,26,0.35)'
  ctx.textAlign = 'right'
  ctx.fillText('云舒卷 · RAG Notebook', CARD_W - 64, CARD_H - 44)
  ctx.textAlign = 'left'
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

const TEMPLATES: { id: CardTemplate; labelKey: string; swatch: string }[] = [
  { id: 'white', labelKey: 'card.tplWhite', swatch: 'linear-gradient(135deg,#ffffff,#eef2f7)' },
  { id: 'gradient', labelKey: 'card.tplGradient', swatch: 'linear-gradient(135deg,#1f6c9f,#7c6cf0,#d0579b)' },
  { id: 'dark', labelKey: 'card.tplDark', swatch: 'linear-gradient(135deg,#16161d,#23232e)' },
]

export default function NoteCardModal({ open, onOpenChange, title, content, tags }: NoteCardModalProps) {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [template, setTemplate] = useState<CardTemplate>('white')
  const [petImage, setPetImage] = useState<HTMLImageElement | null>(null)
  const [downloading, setDownloading] = useState(false)

  // 打开时加载页宠 SVG（异步回调中 setState）
  useEffect(() => {
    if (!open) return
    let cancelled = false
    loadPetImage().then((img) => {
      if (!cancelled) setPetImage(img)
    })
    return () => {
      cancelled = true
    }
  }, [open])

  // 绘制卡片
  useEffect(() => {
    if (!open || !canvasRef.current) return
    drawCard(canvasRef.current, {
      title,
      summary: plainSummary(content),
      tags,
      date: new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }),
      template,
      petImage,
    })
  }, [open, template, petImage, title, content, tags])

  const handleDownload = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    setDownloading(true)
    canvas.toBlob((blob) => {
      setDownloading(false)
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${(title || 'note').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60)}.png`
      a.click()
      URL.revokeObjectURL(url)
    }, 'image/png')
  }, [title])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={() => onOpenChange(false)}
        >
          <motion.div
            className="w-[720px] max-w-full rounded-xl bg-[var(--color-card)] border border-[var(--color-border)] shadow-2xl overflow-hidden"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 头部 */}
            <div className="flex items-center gap-3 px-5 h-13 py-3.5 border-b border-[var(--color-border)]">
              <Share2 size={16} className="text-[var(--color-accent)]" />
              <h2 className="text-sm font-medium text-[var(--color-text)] flex-1">{t('card.title')}</h2>
              <button
                onClick={() => onOpenChange(false)}
                className="workspace-icon-button"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* 模板选择 */}
              <div className="flex items-center gap-3">
                <span className="text-xs text-[var(--color-text-secondary)] shrink-0">{t('card.template')}</span>
                <div className="flex gap-2">
                  {TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.id}
                      onClick={() => setTemplate(tpl.id)}
                      title={t(tpl.labelKey)}
                      className={`h-9 w-14 rounded-lg border-2 transition-all ${
                        template === tpl.id
                          ? 'border-[var(--color-accent)] scale-105 shadow-sm'
                          : 'border-[var(--color-border)] hover:border-[var(--color-text-tertiary)]'
                      }`}
                      style={{ background: tpl.swatch }}
                    />
                  ))}
                </div>
                <span className="text-xs text-[var(--color-text-tertiary)]">{t(template === 'white' ? 'card.tplWhite' : template === 'gradient' ? 'card.tplGradient' : 'card.tplDark')}</span>
              </div>

              {/* 预览 */}
              <div className="rounded-lg border border-[var(--color-border)] overflow-hidden bg-[var(--color-bg-secondary)]">
                <canvas ref={canvasRef} width={CARD_W} height={CARD_H} className="w-full h-auto block" />
              </div>

              {/* 操作 */}
              <div className="flex items-center justify-between">
                <p className="text-xs text-[var(--color-text-tertiary)] flex items-center gap-1.5">
                  <Sparkles size={12} />
                  {t('card.hint')}
                </p>
                <button
                  onClick={handleDownload}
                  disabled={downloading}
                  className="flex items-center gap-2 px-4 h-9 text-sm font-medium rounded-lg bg-[var(--color-accent)] text-[var(--color-accent-foreground)] hover:opacity-90 disabled:opacity-50 transition-all"
                >
                  <Download size={15} />
                  {t('card.download')}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
