import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Network, Sparkles, ZoomIn, ZoomOut, Maximize2, ArrowUpRight } from 'lucide-react'
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force'
import { notesApi } from '../api/notes'
import type { GraphData, GraphLink, GraphNode } from '../types/api'
import KnowledgeLayout, { KnowledgeHeader } from '../components/knowledge/KnowledgeLayout'
import LoadingSkeleton from '../components/common/LoadingSkeleton'

const W = 900
const H = 560

/** 分类 → 节点颜色（与统计页分类色板一致） */
const CATEGORY_COLORS: Record<string, string> = {
  work: '#7C53E8',
  study: '#47A88D',
  life: '#DB87A7',
  project: '#6F95D9',
  other: '#9CA3AF',
}
const FALLBACK_COLOR = '#C0C4CC'

interface SimNode extends GraphNode {
  x: number
  y: number
}

interface EdgeLine extends GraphLink {
  sx: number
  sy: number
  tx: number
  ty: number
}

/**
 * 知识图谱页：节点 = 笔记，边 = 双链（实线）+ 语义相似（虚线）。
 * d3-force 同步模拟（无动画帧）后一次性渲染，Top 50 节点限制由后端保证。
 */
export default function GraphPage() {
  const { t } = useTranslation()
  const [data, setData] = useState<GraphData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [semanticLoading, setSemanticLoading] = useState(false)
  const [semanticError, setSemanticError] = useState(false)
  const semanticController = useRef<AbortController | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number; px: number; py: number; scale: number } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [canvasWidth, setCanvasWidth] = useState(W)
  const labelWidth = (data?.nodes.length ?? 0) > 30 ? 128 : 164

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const observer = new ResizeObserver(([entry]) => setCanvasWidth(entry.contentRect.width))
    observer.observe(svg)
    return () => observer.disconnect()
  }, [loading, data])

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    notesApi
      .graph({ include_semantic: false }, controller.signal)
      .then((res) => {
        if (cancelled) return
        setData(res.data ?? null)
        setError(false)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
      controller.abort()
      semanticController.current?.abort()
    }
  }, [])

  const loadSemantic = async () => {
    semanticController.current?.abort()
    const controller = new AbortController()
    semanticController.current = controller
    setSemanticLoading(true)
    setSemanticError(false)
    try {
      const res = await notesApi.graph({ include_semantic: true }, controller.signal)
      if (!controller.signal.aborted) {
        setData(res.data)
        setSemanticError(res.data.semantic_status === 'unavailable' || res.data.semantic_status === 'partial')
      }
    } catch {
      if (!controller.signal.aborted) setSemanticError(true)
    } finally {
      if (!controller.signal.aborted) setSemanticLoading(false)
    }
  }

  // 力导向布局：同步 tick 300 次收敛，一次性输出坐标（无动画帧性能问题）
  const layout = useMemo<{ nodes: SimNode[]; edges: EdgeLine[] } | null>(() => {
    if (!data || data.nodes.length === 0) return null

    const nodes: SimNode[] = data.nodes.map((n, i) => {
      // 确定性环形初始分布（渲染期禁止不纯函数，如 Math.random）
      const angle = (i / Math.max(data.nodes.length, 1)) * Math.PI * 2
      return {
        ...n,
        x: W / 2 + Math.cos(angle) * 130,
        y: H / 2 + Math.sin(angle) * 100,
      }
    })
    const ids = new Set(nodes.map((node) => node.id))
    const links = data.links.filter((link) => ids.has(link.source) && ids.has(link.target)).map((l) => ({ ...l }))

    const sim = forceSimulation(nodes)
      .force(
        'link',
        forceLink<SimNode, GraphLink>(links)
          .id((d) => d.id)
          .distance(185)
          .strength(0.35)
      )
      .force('charge', forceManyBody<SimNode>().strength(-550))
      .force('center', forceCenter(W / 2, H / 2))
      .force('x', forceX<SimNode>(W / 2).strength(.06))
      .force('y', forceY<SimNode>(H / 2).strength(.12))
      .force('collide', forceCollide<SimNode>(82))
      .stop()

    for (let i = 0; i < 300; i++) sim.tick()

    // Fit every real node, including disconnected notes, into the initial viewport.
    const minX = Math.min(...nodes.map((n) => n.x)), maxX = Math.max(...nodes.map((n) => n.x))
    const minY = Math.min(...nodes.map((n) => n.y)), maxY = Math.max(...nodes.map((n) => n.y))
    const fit = Math.min(1, (W - 200) / Math.max(1, maxX - minX), (H - 130) / Math.max(1, maxY - minY))
    nodes.forEach((n) => { n.x = W / 2 + (n.x - (minX + maxX) / 2) * fit; n.y = H / 2 + (n.y - (minY + maxY) / 2) * fit })

    // Pill labels are rectangles, not circles. Separate them again after fitting.
    for (let pass = 0; pass < 80; pass++) {
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j], dx = b.x - a.x, dy = b.y - a.y
        const overlapX = (data.nodes.length > 30 ? 140 : 176) - Math.abs(dx), overlapY = 58 - Math.abs(dy)
        if (overlapX > 0 && overlapY > 0) {
          if (overlapX < overlapY) { const push = (overlapX / 2 + .2) * (dx >= 0 ? 1 : -1); a.x -= push; b.x += push }
          else { const push = (overlapY / 2 + .2) * (dy >= 0 ? 1 : -1); a.y -= push; b.y += push }
        }
      }
      nodes.forEach((n) => { n.x = Math.max(94, Math.min(W - 94, n.x)); n.y = Math.max(36, Math.min(H - 60, n.y)) })
    }

    const nodeById = new Map(nodes.map((n) => [n.id, n]))
    const edges: EdgeLine[] = links.map((l) => {
      const s = typeof l.source === 'object' ? (l.source as SimNode) : nodeById.get(l.source as string)
      const tt = typeof l.target === 'object' ? (l.target as SimNode) : nodeById.get(l.target as string)
      return {
        ...l,
        source: s?.id ?? (l.source as string),
        target: tt?.id ?? (l.target as string),
        sx: s?.x ?? 0,
        sy: s?.y ?? 0,
        tx: tt?.x ?? 0,
        ty: tt?.y ?? 0,
      }
    })
    return { nodes, edges }
  }, [data])

  const selected = layout?.nodes.find((node) => node.id === selectedId) ?? layout?.nodes[0]
  // Keep labels readable on narrow screens; pan or use the picker to reach other notes.
  const compact = canvasWidth < 600
  const displayZoom = zoom * (compact ? W / Math.max(240, canvasWidth) : 1)
  const centerX = compact && selected ? selected.x : W / 2
  const centerY = compact && selected ? selected.y : H / 2
  const relatedIds = new Set(layout?.edges.flatMap((edge) => edge.source === selected?.id ? [edge.target] : edge.target === selected?.id ? [edge.source] : []) ?? [])
  const related = layout?.nodes.filter((node) => relatedIds.has(node.id)) ?? []
  const categoryLabel = (value?: string | null) => value ? t('note.ui.categories.' + value, { defaultValue: value }) : t('graph.uncategorized')
  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }) }

  return <KnowledgeLayout>
    <KnowledgeHeader title={t('graph.title')} subtitle={t('knowledgeUI.graphSubtitle')} actions={<>
      <button onClick={loadSemantic} disabled={semanticLoading || !data || data.nodes.length < 2} className="primary-button"><Sparkles size={16} />{t(semanticLoading ? 'graph.semanticLoading' : 'graph.loadSemantic')}</button>
      <button className="secondary-button" onClick={resetView}><Maximize2 size={16} />{t('knowledgeUI.resetView')}</button>
    </>} />
    <div className="knowledge-helper !mt-0 !mb-5"><Network size={23} className="text-[var(--color-accent)] shrink-0" /><div><strong>{t('knowledgeUI.graphHint')}</strong><p>{t('graph.semanticHint')}</p></div></div>
    {semanticError && <p role="alert" className="knowledge-alert">{t('graph.semanticUnavailable')}</p>}
    {!semanticError && data?.semantic_status === 'complete' && <p role="status" className="knowledge-footnote !pb-4">{t('graph.semanticComplete')}</p>}
    {data && <div className="knowledge-legend"><span><i />{t('graph.linkEdge')}</span><span><i className="dashed" />{t('graph.similarEdge')}</span><span>{data.nodes.length} {t('graph.nodes')} · {layout?.edges.length ?? 0} {t('graph.edges')}</span></div>}
    {loading && <LoadingSkeleton />}
    {error && !data && <div className="knowledge-alert" role="alert"><p>{t('common.error')}</p><button className="secondary-button" onClick={() => window.location.reload()}>{t('common.retry')}</button></div>}
    {data && !loading && (!layout ? <div className="knowledge-panel knowledge-empty"><img src="/illustrations/study-cloud.png" alt="" /><p>{t('graph.empty')}</p><Link to="/notes/new" className="primary-button">{t('note.newNote')}</Link></div> : <div className="knowledge-graph-layout">
      <div className="knowledge-graph-canvas">
        <label className="knowledge-graph-picker"><span>{t('knowledgeUI.chooseNote')}</span><select value={selected?.id ?? ''} onChange={(event) => { setSelectedId(event.target.value); setPan({ x: 0, y: 0 }) }}>{layout.nodes.map((node) => <option key={node.id} value={node.id}>{node.title}</option>)}</select></label>
        <svg ref={svgRef} viewBox={'0 0 ' + W + ' ' + H} role="group" aria-label={t('graph.title')} onPointerDown={(event) => {
          if (event.button !== 0 || (event.target as Element).closest('.knowledge-graph-node')) return
          const rect = event.currentTarget.getBoundingClientRect()
          drag.current = { x: event.clientX, y: event.clientY, px: pan.x, py: pan.y, scale: Math.min(rect.width / W, rect.height / H) }
          event.currentTarget.setPointerCapture(event.pointerId)
        }} onPointerMove={(event) => {
          if (!drag.current) return
          const start = drag.current
          setPan({ x: start.px + (event.clientX - start.x) / start.scale, y: start.py + (event.clientY - start.y) / start.scale })
        }} onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}>
          <g transform={'translate(' + (W / 2 + pan.x) + ',' + (H / 2 + pan.y) + ') scale(' + displayZoom + ') translate(' + -centerX + ',' + -centerY + ')'}>
            {layout.edges.map((edge, i) => <line key={i} x1={edge.sx} y1={edge.sy} x2={edge.tx} y2={edge.ty} stroke="var(--color-accent)" strokeWidth={edge.type === 'link' ? 1.8 : 1.2} strokeDasharray={edge.type === 'similar' ? '6 5' : undefined} opacity={selected && edge.source !== selected.id && edge.target !== selected.id ? .2 : .6} />)}
            {layout.nodes.map((node) => <g key={node.id} transform={'translate(' + node.x + ',' + node.y + ')'} className={'knowledge-graph-node' + (selected?.id === node.id ? ' is-selected' : '')} tabIndex={0} role="button" aria-label={node.title} aria-pressed={selected?.id === node.id} onClick={() => setSelectedId(node.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(node.id) } }}>
              <title>{node.title + ' · ' + categoryLabel(node.category)}</title>
              <rect className="graph-node-halo" x={-labelWidth / 2} y={-23} width={labelWidth} height={46} rx={23} />
              <circle cx={-labelWidth / 2 + 22} cy={0} r={8} fill={node.category ? CATEGORY_COLORS[node.category] ?? FALLBACK_COLOR : FALLBACK_COLOR} />
              <text x={-labelWidth / 2 + 39} y={5}>{node.title.length > (labelWidth === 128 ? 5 : 8) ? node.title.slice(0, labelWidth === 128 ? 5 : 8) + '…' : node.title}</text>
            </g>)}
          </g>
        </svg>
        <div className="knowledge-graph-tools">
          <button className="workspace-icon-button" aria-label={t('knowledgeUI.zoomOut')} disabled={zoom <= .6} onClick={() => setZoom((value) => Math.max(.6, value - .2))}><ZoomOut size={17} /></button>
          <output aria-live="polite">{Math.round(zoom * 100)}%</output>
          <button className="workspace-icon-button" aria-label={t('knowledgeUI.zoomIn')} disabled={zoom >= 2.4} onClick={() => setZoom((value) => Math.min(2.4, value + .2))}><ZoomIn size={17} /></button>
          <button className="workspace-icon-button" aria-label={t('knowledgeUI.resetView')} onClick={resetView}><Maximize2 size={17} /></button>
        </div>
      </div>
      <aside className="knowledge-graph-aside">
        <section className="knowledge-panel knowledge-graph-detail" aria-live="polite"><h2>{t('knowledgeUI.selectedNote')}</h2>{selected && <>
          <span className="knowledge-badge">{categoryLabel(selected.category)}</span><h3>{selected.title}</h3>
          <p>{t('knowledgeUI.relatedCount', { count: related.length })}</p>
          <ul>{related.map((node) => <li key={node.id}><button onClick={() => setSelectedId(node.id)}>{node.title}</button></li>)}</ul>
          {!related.length && <p>{t('knowledgeUI.noConnections')}</p>}
          <Link className="primary-button" to={'/notes/' + selected.id}>{t('knowledgeUI.openNote')}<ArrowUpRight size={16} /></Link>
        </>}</section>
        <div className="knowledge-helper"><img src="/illustrations/study-cloud.png" alt="" /><div><strong>{t('knowledgeUI.graphCompanion')}</strong><p>{t('knowledgeUI.graphCompanionHint')}</p></div></div>
      </aside>
    </div>)}
  </KnowledgeLayout>
}
