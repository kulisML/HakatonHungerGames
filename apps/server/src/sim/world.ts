import { nanoid } from 'nanoid'
import type { LocationId, LocationNode, WorldGraph } from './types.js'
import { mulberry32, pick } from './rng.js'

const kinds = ['town', 'ruins', 'pass', 'mine', 'port', 'forest'] as const

export function seedWorld(seed = 1337): WorldGraph {
  const rnd = mulberry32(seed)
  const nodes: LocationNode[] = []
  const edges: Array<{ a: LocationId; b: LocationId }> = []

  const width = 900
  const height = 520

  const count = 34
  for (let i = 0; i < count; i++) {
    const kind = pick(rnd, [...kinds])
    const id = nanoid(8)
    nodes.push({
      id,
      name: genName(rnd, kind),
      x: Math.floor(rnd() * width),
      y: Math.floor(rnd() * height),
      kind,
      resources: genResources(rnd, kind),
      ownerFaction: null,
    })
  }

  const byIndex = (i: number) => nodes[i]!.id

  for (let i = 0; i < count - 1; i++) edges.push({ a: byIndex(i), b: byIndex(i + 1) })
  for (let i = 0; i < count; i++) {
    const a = byIndex(i)
    const b = byIndex(Math.floor(rnd() * count))
    if (a !== b) edges.push({ a, b })
  }

  const dedup = new Set<string>()
  const finalEdges: typeof edges = []
  for (const e of edges) {
    const key = [e.a, e.b].sort().join(':')
    if (dedup.has(key)) continue
    dedup.add(key)
    finalEdges.push(e)
  }

  return { seed, width, height, nodes, edges: finalEdges }
}

export function neighbors(world: WorldGraph, id: LocationId) {
  const out: LocationId[] = []
  for (const e of world.edges) {
    if (e.a === id) out.push(e.b)
    else if (e.b === id) out.push(e.a)
  }
  return out
}

function genResources(rnd: () => number, kind: (typeof kinds)[number]) {
  const base: Record<string, number> = {}
  const add = (k: string, v: number) => (base[k] = (base[k] ?? 0) + v)
  if (kind === 'mine') add('crystal', 2 + Math.floor(rnd() * 4))
  if (kind === 'forest') add('wood', 2 + Math.floor(rnd() * 5))
  if (kind === 'port') add('trade', 1 + Math.floor(rnd() * 4))
  if (kind === 'town') add('food', 1 + Math.floor(rnd() * 3))
  if (kind === 'ruins') add('relic', Math.floor(rnd() * 2))
  if (Object.keys(base).length === 0) add('food', 1)
  return base
}

function genName(rnd: () => number, kind: (typeof kinds)[number]) {
  const a = pick(rnd, ['Серый', 'Старый', 'Восточный', 'Тихий', 'Кровавый', 'Золотой', 'Туманный', 'Северный'])
  const b = pick(rnd, ['перевал', 'берег', 'лес', 'порт', 'шахта', 'город', 'руины', 'холм'])
  const c = kind === 'mine' ? 'шахта' : kind === 'port' ? 'порт' : kind === 'ruins' ? 'руины' : b
  return `${a} ${c}`
}

