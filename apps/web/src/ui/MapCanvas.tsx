import type { RefObject } from 'react'
import { useEffect, useMemo, useRef } from 'react'
import type { AgentId, AgentState, LocationNode, WorldState } from './types'
import { useElementSize } from './useElementSize'

type Marker = { id: AgentId; x: number; y: number; r: number }

export function MapCanvas(props: {
  state: WorldState
  selectedAgentId: AgentId | null
  onPickAgent: (id: AgentId | null) => void
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const size = useElementSize(wrapRef)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const markersRef = useRef<Marker[]>([])
  const bgRef = useRef<{ key: string; canvas: HTMLCanvasElement } | null>(null)

  const nodesById = useMemo(() => new Map(props.state.world.nodes.map((n) => [n.id, n])), [props.state.world.nodes])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const w = Math.max(1, size.w)
    const h = Math.max(1, size.h)
    canvas.width = Math.floor(w * devicePixelRatio)
    canvas.height = Math.floor(h * devicePixelRatio)
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
    draw(ctx, w, h, props.state, props.selectedAgentId, nodesById, bgRef, markersRef)
  }, [size.w, size.h, props.state, props.selectedAgentId, nodesById])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const markers = markersRef.current
      let best: Marker | null = null
      let bestD = Infinity
      for (const m of markers) {
        const dx = m.x - x
        const dy = m.y - y
        const d = dx * dx + dy * dy
        if (d <= (m.r + 6) * (m.r + 6) && d < bestD) {
          bestD = d
          best = m
        }
      }
      if (best) props.onPickAgent(best.id)
    }
    canvas.addEventListener('click', onClick)
    return () => canvas.removeEventListener('click', onClick)
  }, [props])

  return (
    <div className="w-full h-full relative" ref={wrapRef}>
      <canvas ref={canvasRef} />
    </div>
  )
}

function draw(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  state: WorldState,
  selectedAgentId: AgentId | null,
  nodesById: Map<string, LocationNode>,
  bgRef: RefObject<{ key: string; canvas: HTMLCanvasElement } | null>,
  markersRef: RefObject<Marker[]>,
) {
  ctx.clearRect(0, 0, w, h)
  const worldW = state.world.width
  const worldH = state.world.height
  const scale = Math.max(0.01, Math.min(w / worldW, h / worldH))
  const offX = (w - worldW * scale) / 2
  const offY = (h - worldH * scale) / 2

  const bgKey = `${state.world.seed}:${worldW}:${worldH}:parchment`
  const cached = bgRef.current
  let bg = cached?.key === bgKey ? cached.canvas : null
  if (!bg) {
    bg = buildTerrain(state.world.seed, 360, 220)
    bgRef.current = { key: bgKey, canvas: bg }
  }
  ctx.save()
  ctx.globalAlpha = 1
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(bg, offX, offY, worldW * scale, worldH * scale)
  ctx.restore()

  ctx.save()
  ctx.strokeStyle = '#876342'
  ctx.lineWidth = 2
  ctx.strokeRect(offX, offY, worldW * scale, worldH * scale)
  ctx.restore()

  // Decor
  const scaleRef = worldW / 10
  ctx.save()
  ctx.strokeStyle = 'rgba(92, 69, 51, 0.15)'
  ctx.lineWidth = 1
  for (let gx = 0; gx <= worldW; gx += scaleRef) {
    ctx.beginPath()
    ctx.moveTo(offX + gx * scale, offY)
    ctx.lineTo(offX + gx * scale, offY + worldH * scale)
    ctx.stroke()
  }
  for (let gy = 0; gy <= worldH; gy += scaleRef) {
    ctx.beginPath()
    ctx.moveTo(offX, offY + gy * scale)
    ctx.lineTo(offX + worldW * scale, offY + gy * scale)
    ctx.stroke()
  }
  ctx.restore()

  markersRef.current = []
  const grouped = new Map<string, AgentState[]>()
  for (const a of state.agents) {
    const arr = grouped.get(a.locationId) ?? []
    arr.push(a)
    grouped.set(a.locationId, arr)
  }

  for (const n of state.world.nodes) {
    const x = offX + n.x * scale
    const y = offY + n.y * scale
    const r = 5
    
    // Zone control
    if (n.ownerFaction) {
      ctx.beginPath()
      ctx.fillStyle = withAlpha(factionColor(n.ownerFaction), 0.15)
      ctx.arc(x, y, r + 14, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.setLineDash([4, 4])
      ctx.strokeStyle = withAlpha(factionColor(n.ownerFaction), 0.6)
      ctx.lineWidth = 1.5
      ctx.arc(x, y, r + 14, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Node icon
    ctx.beginPath()
    ctx.fillStyle = '#f2eee3'
    ctx.arc(x, y, r + 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.strokeStyle = '#5c4533'
    ctx.lineWidth = 1.5
    ctx.arc(x, y, r + 2, 0, Math.PI * 2)
    ctx.stroke()

    ctx.beginPath()
    ctx.fillStyle = kindColor(n.kind)
    ctx.arc(x, y, r - 1, 0, Math.PI * 2)
    ctx.fill()

    const agentsHere = grouped.get(n.id) ?? []
    if (agentsHere.length) {
      const ring = 16
      for (let i = 0; i < agentsHere.length; i++) {
        const a = agentsHere[i]!
        const ang = (i / agentsHere.length) * Math.PI * 2
        const ax = x + Math.cos(ang) * ring
        const ay = y + Math.sin(ang) * ring
        const ar = 5
        
        ctx.beginPath()
        ctx.shadowColor = 'rgba(0,0,0,0.3)'
        ctx.shadowBlur = 4
        ctx.fillStyle = moodColor(a.mood.valence)
        ctx.arc(ax, ay, ar, 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0
        
        ctx.beginPath()
        ctx.strokeStyle = '#2c241b'
        ctx.lineWidth = 1.5
        ctx.arc(ax, ay, ar, 0, Math.PI * 2)
        ctx.stroke()

        if (a.id === selectedAgentId) {
          ctx.beginPath()
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 2.5
          ctx.arc(ax, ay, ar + 3, 0, Math.PI * 2)
          ctx.stroke()
        }
        markersRef.current.push({ id: a.id, x: ax, y: ay, r: ar + 3 })
      }
    }

    ctx.font = 'bold 11px "Merriweather", serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillStyle = '#4a3f33'
    ctx.shadowColor = '#f2eee3'
    ctx.shadowBlur = 3
    ctx.fillText(n.name, x, y + 8)
    ctx.shadowBlur = 0
  }
}

function buildTerrain(seed: number, w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(w, h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = x / w
      const ny = y / h
      // Improved FBM with island mask
      const d = Math.hypot(nx - 0.5, ny - 0.5) * 2 // 0 at center, 1 at edge
      const mask = clamp01(1.0 - Math.pow(d, 2.5))
      
      const e = fbm(seed, nx * 4.5, ny * 4.5)
      const m = fbm(seed + 77, nx * 9 + 2.1, ny * 9 - 0.4)
      const v = clamp01((e * 0.65 + m * 0.35) * mask)
      
      const [r, g, b] = terrainColor(v)
      const i = (y * w + x) * 4
      img.data[i] = r
      img.data[i + 1] = g
      img.data[i + 2] = b
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  
  // Vignette & Texture
  const grd = ctx.createRadialGradient(w/2, h/2, w/3, w/2, h/2, w/1.1)
  grd.addColorStop(0, 'rgba(230, 222, 200, 0)')
  grd.addColorStop(1, 'rgba(92, 69, 51, 0.5)')
  ctx.fillStyle = grd
  ctx.fillRect(0,0,w,h)

  return c
}

function terrainColor(v: number): [number, number, number] {
  // Parchment map colors
  if (v < 0.38) return [194, 218, 230] // Water (faded blue)
  if (v < 0.43) return [210, 225, 200] // Sand/Shore
  if (v < 0.62) return [230, 222, 200] // Plains (parchment)
  if (v < 0.78) return [210, 200, 180] // Hills
  if (v < 0.9) return [180, 170, 150] // Mountains
  return [240, 240, 235] // Snow
}

function fbm(seed: number, x: number, y: number) {
  let v = 0
  let amp = 0.6
  let freq = 1
  for (let i = 0; i < 5; i++) {
    v += amp * valueNoise(seed + i * 101, x * freq, y * freq)
    freq *= 2
    amp *= 0.5
  }
  return v
}

function valueNoise(seed: number, x: number, y: number) {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = x0 + 1
  const y1 = y0 + 1
  const sx = smoothstep(x - x0)
  const sy = smoothstep(y - y0)
  const n00 = hash2(seed, x0, y0)
  const n10 = hash2(seed, x1, y0)
  const n01 = hash2(seed, x0, y1)
  const n11 = hash2(seed, x1, y1)
  const ix0 = lerp(n00, n10, sx)
  const ix1 = lerp(n01, n11, sx)
  return lerp(ix0, ix1, sy)
}

function hash2(seed: number, x: number, y: number) {
  let h = seed ^ (x * 374761393) ^ (y * 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h = (h ^ (h >>> 16)) >>> 0
  return h / 4294967296
}

function smoothstep(t: number) {
  return t * t * (3 - 2 * t)
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n))
}

function withAlpha(hex: string, a: number) {
  const c = hex.replace('#', '')
  const r = Number.parseInt(c.slice(0, 2), 16)
  const g = Number.parseInt(c.slice(2, 4), 16)
  const b = Number.parseInt(c.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${a})`
}

function factionColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = Math.imul(31, h) + name.charCodeAt(i)
  const x = ((h >>> 0) % 360) | 0
  const [r, g, b] = hslToRgb(x / 360, 0.6, 0.55)
  return rgbToHex(r, g, b)
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  let r: number
  let g: number
  let b: number
  if (s === 0) {
    r = g = b = l
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1 / 3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1 / 3)
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)]
}

function rgbToHex(r: number, g: number, b: number) {
  const to = (n: number) => n.toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

function moodColor(valence: number) {
  if (valence >= 0.5) return '#3ddc84'
  if (valence >= 0.15) return '#7be495'
  if (valence > -0.15) return '#7aa2f7'
  if (valence > -0.5) return '#f59e0b'
  return '#ef4444'
}

function kindColor(kind: string) {
  if (kind === 'mine') return '#a78bfa'
  if (kind === 'port') return '#38bdf8'
  if (kind === 'town') return '#fbbf24'
  if (kind === 'ruins') return '#94a3b8'
  if (kind === 'pass') return '#f97316'
  return '#34d399'
}
