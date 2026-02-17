import type { AgentId, Relation } from './types.js'
import { clamp } from './rng.js'

export function getRelation(relations: Relation[], a: AgentId, b: AgentId) {
  const [x, y] = a < b ? [a, b] : [b, a]
  let r = relations.find((t) => t.a === x && t.b === y)
  if (!r) {
    r = { a: x, b: y, affinity: 0, trust: 0.5 }
    relations.push(r)
  }
  return r
}

export function bumpRelation(relations: Relation[], a: AgentId, b: AgentId, dAffinity: number, dTrust: number) {
  const r = getRelation(relations, a, b)
  r.affinity = clamp(r.affinity + dAffinity, -1, 1)
  r.trust = clamp(r.trust + dTrust, 0, 1)
  return r
}

export function getOpinion(relations: Relation[], selfId: AgentId, targetId: AgentId): string {
    const r = getRelation(relations, selfId, targetId)
    const aff = r.affinity
    const tr = r.trust
    
    if (aff > 0.6 && tr > 0.6) return 'надежный союзник'
    if (aff > 0.3 && tr > 0.4) return 'друг'
    if (aff > 0.1) return 'знакомый'
    if (aff < -0.6) return 'заклятый враг'
    if (aff < -0.3) return 'недоброжелатель'
    if (tr < 0.2) return 'подозрительный тип'
    return 'нейтрально'
}

