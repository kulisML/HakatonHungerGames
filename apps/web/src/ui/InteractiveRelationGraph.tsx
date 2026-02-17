import { useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import type { AgentId, AgentState, Relation, WorldState } from './types'
import { useElementSize } from './useElementSize'

type GraphNode = {
  id: AgentId
  name: string
  role: string
  faction: string
  mood: { valence: number; arousal: number }
  x?: number
  y?: number
}

type GraphLink = {
  source: AgentId
  target: AgentId
  affinity: number
  trust: number
}

export function InteractiveRelationGraph(props: {
  state: WorldState
  selectedAgentId: AgentId | null
  onPickAgent: (id: AgentId | null) => void
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const size = useElementSize(wrapRef)
  const fgRef = useRef<any>(null)

  const [showPos, setShowPos] = useState(true)
  const [showNeg, setShowNeg] = useState(true)
  const [minAbsAffinity, setMinAbsAffinity] = useState(0)
  const [focusName, setFocusName] = useState('')

  const graph = useMemo(() => {
    const nodes: GraphNode[] = props.state.agents.map((a, i) => ({
      id: a.id,
      name: a.name,
      role: a.role,
      faction: a.faction,
      mood: a.mood,
      x: Math.cos((i / Math.max(1, props.state.agents.length)) * Math.PI * 2) * 160,
      y: Math.sin((i / Math.max(1, props.state.agents.length)) * Math.PI * 2) * 160,
    }))
    const linksAll: GraphLink[] = props.state.relations.map((r) => ({
      source: r.a,
      target: r.b,
      affinity: r.affinity,
      trust: r.trust,
    }))
    const links = linksAll.filter((l) => {
      const pos = l.affinity >= 0
      const neg = l.affinity < 0
      const passSign = (pos && showPos) || (neg && showNeg)
      const passAbs = Math.abs(l.affinity) >= minAbsAffinity
      return passSign && passAbs
    })
    return { nodes, links }
  }, [props.state.agents, props.state.relations, showPos, showNeg, minAbsAffinity])

  useEffect(() => {
    const fg = fgRef.current
    if (!fg) return
    if (size.w > 0 && size.h > 0) {
      const t = setTimeout(() => fg.zoomToFit?.(600, 60), 300)
      return () => clearTimeout(t)
    }
  }, [size.w, size.h, graph.nodes.length, graph.links.length])

  useEffect(() => {
    if (!focusName.trim()) return
    const node = graph.nodes.find((n) => n.name.toLowerCase().includes(focusName.trim().toLowerCase()))
    if (node && fgRef.current) {
      fgRef.current.centerAt(node.x ?? 0, node.y ?? 0, 600)
      fgRef.current.zoom(4, 600)
    }
  }, [focusName])

  return (
    <div className="w-full h-full bg-[#1a1510] relative" ref={wrapRef}>
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-parchment-100/95 px-3 py-2 rounded-lg shadow-lg border border-parchment-300 backdrop-blur">
        <label className="flex items-center gap-1 text-xs font-bold text-ink-700">
          <input type="checkbox" checked={showPos} onChange={(e) => setShowPos(e.target.checked)} />
          Позитивные
        </label>
        <label className="flex items-center gap-1 text-xs font-bold text-ink-700">
          <input type="checkbox" checked={showNeg} onChange={(e) => setShowNeg(e.target.checked)} />
          Негативные
        </label>
        <label className="flex items-center gap-2 text-xs font-bold text-ink-700">
          Мин. связь
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={minAbsAffinity}
            onChange={(e) => setMinAbsAffinity(Number(e.target.value))}
          />
        </label>
        <input
          type="text"
          placeholder="Поиск агента..."
          value={focusName}
          onChange={(e) => setFocusName(e.target.value)}
          className="bg-parchment-50 border border-parchment-300 rounded px-2 py-1 text-xs focus:outline-none focus:border-ink-600"
        />
      </div>

      <ForceGraph2D
        ref={fgRef}
        width={Math.max(1, size.w)}
        height={Math.max(1, size.h)}
        graphData={graph as any}
        cooldownTicks={90}
        linkWidth={(l: any) => 1 + Math.abs(l.affinity) * 3 + (props.selectedAgentId && (l.source === props.selectedAgentId || l.target === props.selectedAgentId) ? 1.5 : 0)}
        linkColor={(l: any) => affinityColor(l.affinity)}
        linkDirectionalParticles={(l: any) => (l.trust > 0.65 ? 2 : 0)}
        linkDirectionalParticleWidth={2}
        nodeRelSize={7}
        backgroundColor="#1a1510"
        onNodeClick={(n: any) => props.onPickAgent(n.id)}
        nodeCanvasObject={(node: any, ctx, globalScale) => {
          const r = 8 / globalScale
          const selected = node.id === props.selectedAgentId
          if (selected) {
            ctx.shadowBlur = 15
            ctx.shadowColor = '#ffffff'
          } else {
            ctx.shadowBlur = 0
          }

          ctx.beginPath()
          ctx.fillStyle = moodColor(node.mood?.valence ?? 0)
          ctx.arc(node.x, node.y, r, 0, 2 * Math.PI)
          ctx.fill()

          ctx.beginPath()
          ctx.strokeStyle = '#1a1510'
          ctx.lineWidth = 1.5 / globalScale
          ctx.arc(node.x, node.y, r, 0, 2 * Math.PI)
          ctx.stroke()

          ctx.shadowBlur = 0
          if (selected) {
            ctx.beginPath()
            ctx.strokeStyle = '#ffffff'
            ctx.lineWidth = 2 / globalScale
            ctx.arc(node.x, node.y, r + 4 / globalScale, 0, 2 * Math.PI)
            ctx.stroke()
          }

          const fontSize = 14 / globalScale
          ctx.font = `bold ${fontSize}px "Merriweather", serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'top'
          ctx.fillStyle = '#e6dec8'
          ctx.fillText(node.name, node.x, node.y + r + 4 / globalScale)
        }}
      />
    </div>
  )
}

function moodColor(valence: number) {
  if (valence >= 0.5) return '#10b981'
  if (valence >= 0.15) return '#34d399'
  if (valence > -0.15) return '#60a5fa'
  if (valence > -0.5) return '#f59e0b'
  return '#ef4444'
}

function affinityColor(a: number) {
  const t = Math.max(-1, Math.min(1, a))
  // Map -1..0..1 to red..blue..green with parchment-friendly tones
  if (t >= 0.55) return '#16a34a'
  if (t >= 0.2) return '#65a30d'
  if (t > -0.2) return '#2563eb'
  if (t > -0.55) return '#d97706'
  return '#dc2626'
}
