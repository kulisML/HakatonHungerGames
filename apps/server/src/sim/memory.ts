import fs from 'node:fs'
import path from 'node:path'
import { nanoid } from 'nanoid'
import type { AgentId } from './types.js'

export type MemoryEntry = {
  id: string
  ts: number
  kind: 'episode' | 'summary'
  text: string
  importance: number
  vector: number[]
  participants?: AgentId[]
}

export type MemorySearchHit = {
  entry: MemoryEntry
  score: number
}

const DIM = 256

export class MemoryStore {
  private dir: string
  private byAgent: Map<AgentId, MemoryEntry[]> = new Map()

  constructor(dir: string) {
    this.dir = dir
    fs.mkdirSync(dir, { recursive: true })
  }

  loadAgent(agentId: AgentId) {
    if (this.byAgent.has(agentId)) return
    const file = this.fileFor(agentId)
    const entries: MemoryEntry[] = []
    if (fs.existsSync(file)) {
      const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)
      for (const line of lines) {
        try {
          entries.push(JSON.parse(line) as MemoryEntry)
        } catch {
          continue
        }
      }
    }
    this.byAgent.set(agentId, entries)
  }

  add(agentId: AgentId, kind: MemoryEntry['kind'], ts: number, text: string, importance: number, participants?: AgentId[]) {
    this.loadAgent(agentId)
    const entry: MemoryEntry = {
      id: nanoid(10),
      ts,
      kind,
      text,
      importance,
      vector: embed(text),
      participants,
    }
    const entries = this.byAgent.get(agentId)!
    entries.push(entry)
    fs.appendFileSync(this.fileFor(agentId), JSON.stringify(entry) + '\n', 'utf8')
    return entry
  }

  list(agentId: AgentId) {
    this.loadAgent(agentId)
    return this.byAgent.get(agentId)!.slice()
  }

  search(agentId: AgentId, query: string, topK = 6): MemorySearchHit[] {
    this.loadAgent(agentId)
    const entries = this.byAgent.get(agentId)!
    if (entries.length === 0) return []
    const q = embed(query)
    const scored: MemorySearchHit[] = []
    for (const e of entries) {
      const sim = cosine(q, e.vector)
      const score = sim * 0.85 + e.importance * 0.15
      scored.push({ entry: e, score })
    }
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, topK)
  }

  compact(agentId: AgentId, keepLast = 120) {
    this.loadAgent(agentId)
    const entries = this.byAgent.get(agentId)!
    if (entries.length <= keepLast) return { removed: 0 }
    const removed = entries.length - keepLast
    const kept = entries.slice(entries.length - keepLast)
    this.byAgent.set(agentId, kept)
    fs.writeFileSync(this.fileFor(agentId), kept.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8')
    return { removed }
  }

  takeOldest(agentId: AgentId, count: number) {
    this.loadAgent(agentId)
    const entries = this.byAgent.get(agentId)!
    if (entries.length <= count) return entries.slice()
    return entries.slice(0, count)
  }

  replaceWith(agentId: AgentId, kept: MemoryEntry[]) {
    this.byAgent.set(agentId, kept)
    fs.writeFileSync(this.fileFor(agentId), kept.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8')
  }

  private fileFor(agentId: AgentId) {
    return path.join(this.dir, `${agentId}.jsonl`)
  }
}

function embed(text: string) {
  const v = new Array<number>(DIM).fill(0)
  const toks = tokenize(text)
  for (const t of toks) {
    const idx = hash32(t) % DIM
    v[idx] += 1
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1
  for (let i = 0; i < v.length; i++) v[i] /= norm
  return v
}

function tokenize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .split(/\s+/g)
    .filter((t) => t.length >= 2)
    .slice(0, 180)
}

function hash32(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) as number
}

function cosine(a: number[], b: number[]) {
  let dot = 0
  for (let i = 0; i < a.length; i++) dot += a[i]! * b[i]!
  return dot
}

