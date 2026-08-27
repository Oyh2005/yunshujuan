import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Network } from 'lucide-react'
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from 'd3-force'
import { notesApi } from '../api/notes'
import type { GraphData, GraphLink, GraphNode } from '../types/api'
import { FadeIn } from '../components/common/motion'
import LoadingSkeleton from '../components/common/LoadingSkeleton'

const W = 900
const H = 560

/** 分类 → 节点颜色（与统计页分类色板一致） */
const CATEGORY_COLORS: Record<string, string> = {
  work: '#1F6C9F',
  study: '#2E9E6B',
  life: '#E8833A',
  project: '#8B5CF6',
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
  const navigate = useNavigate()
  const [data, setData] = useState<GraphData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [hovered, setHovered] = useState<GraphNode | null>(null)

  useEffect(() => {
    let cancelled = false
    notesApi
      .graph()
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
    }
  }, [])

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
    const links = data.links.map((l) => ({ ...l }))

    const sim = forceSimulation(nodes)
      .force(
        'link',
        forceLink<SimNode, GraphLink>(links)
          .id((d) => d.id)
          .distance(110)
          .strength(0.35)
      )
      .force('charge', forceManyBody<SimNode>().strength(-280))
      .force('center', forceCenter(W / 2, H / 2))
      .force('collide', forceCollide<SimNode>(22))
      .stop()

    for (let i = 0; i < 300; i++) sim.tick()

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

  const hoveredNode = hovered
    ? layout?.nodes.find((n) => n.id === hovered.id)
    : null

  return (
    <div className="max-w-5xl mx-auto py-8 px-6">
      <FadeIn>
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-heading text-xl font-semibold text-[var(--color-text)] flex items-center gap-2">
            <Network size={22} className="text-[var(--color-accent)]" />
            {t('graph.title')}
          </h1>
          {data && data.nodes.length > 0 && (
            <div className="flex items-center gap-4 text-xs text-[var(--color-text-secondary)]">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-6 border-t-2 border-[var(--color-accent)]" />
                {t('graph.linkEdge')}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-6 border-t-2 border-dashed border-[var(--color-text-tertiary)]" />
                {t('graph.similarEdge')}
              </span>
              <span className="text-[var(--color-text-tertiary)]">
                {data.nodes.length} {t('graph.nodes')} · {data.links.length} {t('graph.edges')}
              </span>
            </div>
          )}
        </div>

        {loading && <LoadingSkeleton />}

        {error && !data && (
          <div className="py-16 text-center text-sm text-[var(--color-text-tertiary)]">
            <p className="mb-3">{t('common.error')}</p>
            <button
              onClick={() => window.location.reload()}
              className="primary-button"
            >
              {t('common.retry')}
            </button>
          </div>
        )}

        {data && !loading && (
          <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-4">
            {!layout || layout.nodes.length === 0 ? (
              <div className="py-20 text-center text-sm text-[var(--color-text-tertiary)]">
                {t('graph.empty')}
              </div>
            ) : (
              <div className="relative">
                <svg
                  viewBox={`0 0 ${W} ${H}`}
                  className="w-full h-auto select-none"
                  role="img"
                  aria-label={t('graph.title')}
                >
                  {/* 边：双链实线 / 语义相似虚线 */}
                  {layout.edges.map((e, i) => (
                    <line
                      key={`${e.type}-${i}`}
                      x1={e.sx}
                      y1={e.sy}
                      x2={e.tx}
                      y2={e.ty}
                      stroke={e.type === 'link' ? 'var(--color-accent)' : 'var(--color-text-tertiary)'}
                      strokeWidth={e.type === 'link' ? 1.8 : 1.2}
                      strokeDasharray={e.type === 'similar' ? '5 4' : undefined}
                      opacity={e.type === 'link' ? 0.75 : 0.5}
                    />
                  ))}
                  {/* 节点 */}
                  {layout.nodes.map((n) => {
                    const color = n.category ? CATEGORY_COLORS[n.category] ?? FALLBACK_COLOR : FALLBACK_COLOR
                    const isHovered = hovered?.id === n.id
                    return (
                      <g
                        key={n.id}
                        transform={`translate(${n.x},${n.y})`}
                        className="cursor-pointer"
                        onClick={() => navigate(`/notes/${n.id}`)}
                        onMouseEnter={() => setHovered(n)}
                        onMouseLeave={() => setHovered(null)}
                      >
                        <circle
                          r={isHovered ? 13 : 9}
                          fill={color}
                          fillOpacity={isHovered ? 1 : 0.85}
                          stroke="var(--color-card)"
                          strokeWidth={2}
                          style={{ transition: 'r 0.15s ease' }}
                        />
                      </g>
                    )
                  })}
                </svg>

                {/* 悬停提示 */}
                {hoveredNode && (
                  <div
                    className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md bg-[var(--color-text)] px-2.5 py-1.5 text-xs text-[var(--color-bg)] shadow-lg"
                    style={{
                      left: `${(hoveredNode.x / W) * 100}%`,
                      top: `${(hoveredNode.y / H) * 100}%`,
                    }}
                  >
                    <p className="font-medium max-w-[220px] truncate">{hoveredNode.title}</p>
                    <p className="opacity-70 text-[10px] mt-0.5">{hoveredNode.category || t('graph.uncategorized')}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </FadeIn>
    </div>
  )
}
