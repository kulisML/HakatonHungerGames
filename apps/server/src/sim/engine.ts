import { nanoid } from 'nanoid'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { z } from 'zod'
import type { AgentAction, AgentId, AgentState, EventEnvelope, Relation, WorldGraph, WorldState } from './types.js'
import { neighbors, seedWorld } from './world.js'
import { seedAgents, decideAction } from './agents.js'
import { MemoryStore } from './memory.js'
import { applyEventToMood, decayMood } from './mood.js'
import { bumpRelation, getRelation } from './relations.js'
import { OpenRouterClient } from './openrouter.js'
import { clamp, mulberry32, pick } from './rng.js'
import { createJsonlLogger } from './logger.js'

type EngineOpts = {
  tickMs: number
  onState: (s: WorldState) => void
  onEvent: (e: EventEnvelope) => void
}

export function createEngine(opts: EngineOpts) {
  const baseUrl = process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1'
  const keys = (process.env.OPENROUTER_KEYS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const defaultModel = process.env.OPENROUTER_DEFAULT_MODEL ?? 'deepseek/deepseek-r1:free'
  const reasoningEnabled = (process.env.OPENROUTER_REASONING ?? '').trim() === '1'
  const trace = createJsonlLogger(path.resolve(dataDir(), 'logs'))
  const llm = keys.length
    ? new OpenRouterClient({ baseUrl, keys, defaultModel, reasoningEnabled, onTrace: (rec) => trace.write(rec) })
    : null

  const world: WorldGraph = seedWorld(1337)
  const agents: AgentState[] = seedAgents(world, 2026)
  const relations: Relation[] = []
  const feed: EventEnvelope[] = []
  const nodesById = new Map(world.nodes.map((n) => [n.id, n]))

  for (let i = 0; i < agents.length; i++) {
    for (let j = i + 1; j < agents.length; j++) {
      getRelation(relations, agents[i]!.id, agents[j]!.id)
    }
  }

  const memory = new MemoryStore(dataDir())
  for (const a of agents) memory.loadAgent(a.id)

  let speed = 1
  let running = false
  let timer: NodeJS.Timeout | null = null

  function now() {
    return Date.now()
  }

  function getState(): WorldState {
    return {
      now: now(),
      speed,
      world,
      agents,
      relations,
      feed: feed.slice(-220),
    }
  }

  function pushEvent(ev: Omit<EventEnvelope, 'id' | 'ts'> & { ts?: number }) {
    const envelope: EventEnvelope = {
      id: nanoid(10),
      ts: ev.ts ?? now(),
      type: ev.type,
      title: ev.title,
      text: ev.text,
      locationId: ev.locationId,
      participants: ev.participants,
      importance: clamp(ev.importance, 0, 1),
    }
    feed.push(envelope)
    if (feed.length > 500) feed.splice(0, feed.length - 500)
    trace.write({ kind: 'event', event: envelope })
    opts.onEvent(envelope)
    opts.onState(getState())
    applyEventSideEffects(envelope)
    return envelope
  }

  function applyEventSideEffects(ev: EventEnvelope) {
    if (ev.participants?.length) {
      for (const pid of ev.participants) {
        const a = agents.find((x) => x.id === pid)
        if (!a) continue
        applyEventToMood(a.mood, ev.type, ev.importance)
        memory.add(
          a.id,
          ev.type === 'summarize' ? 'summary' : 'episode',
          ev.ts,
          `${ev.title}: ${ev.text}`,
          ev.importance,
          ev.participants,
        )
      }
    }

    if (ev.type === 'attack' && ev.participants && ev.participants.length >= 2) {
      const [att, def] = ev.participants
      bumpRelation(relations, att!, def!, -0.35 * ev.importance, -0.25 * ev.importance)
      
      // Witnesses react
      for (const other of agents) {
        if (other.id === att || other.id === def) continue
        const relDef = getRelation(relations, other.id, def!)
        
        // If I like the defender, I dislike the attacker
        if (relDef.affinity > 0.3) {
            bumpRelation(relations, other.id, att!, -0.15 * ev.importance, -0.1)
        }
        // If I hate the defender, I might like the attacker a bit
        if (relDef.affinity < -0.5) {
            bumpRelation(relations, other.id, att!, 0.1 * ev.importance, 0.05)
        }
      }
    }
    if (ev.type === 'message' && ev.participants && ev.participants.length >= 2) {
      const [from, to] = ev.participants
      bumpRelation(relations, from!, to!, 0.05 * ev.importance, 0.03 * ev.importance)
    }
    if (ev.type === 'gather' && ev.participants && ev.participants.length >= 1) {
      const [who] = ev.participants
      for (const other of agents) {
        if (other.id === who) continue
        const r = getRelation(relations, who!, other.id)
        if (r.affinity > 0.2) bumpRelation(relations, who!, other.id, 0.02 * ev.importance, 0.01 * ev.importance)
        
        // Gossip (knowledge exchange)
        if (ev.type === 'gather' || ev.type === 'rest') {
            const chance = 0.15 + r.affinity * 0.2
            if (Math.random() < chance) {
                const gossip = memory.search(other.id, 'interesting rumor', 1)[0]
                if (gossip) {
                    memory.add(who!, 'episode', now(), `Слухи от ${other.name}: ${gossip.entry.text}`, 0.3, [other.id])
                }
            }
        }
      }
    }
  }

  function injectWorldEvent(text: string) {
    pushEvent({
      type: 'world',
      title: 'Событие мира',
      text,
      importance: 0.75,
      participants: [],
    })
  }

  function injectUserMessage(toAgentId: AgentId, text: string) {
    pushEvent({
      type: 'message',
      title: 'Голос свыше',
      text,
      participants: [toAgentId],
      importance: 0.8,
    })
  }

  function setSpeed(next: number) {
    speed = clamp(next, 0.25, 6)
    if (running) reschedule()
  }

  function start() {
    if (running) return
    running = true
    reschedule()
  }

  function stop() {
    running = false
    if (timer) clearTimeout(timer)
    timer = null
    trace.close()
  }

  function reschedule() {
    if (!running) return
    if (timer) clearTimeout(timer)
    const delay = Math.max(120, Math.floor(opts.tickMs / speed))
    timer = setTimeout(async () => {
      await tick().catch(() => null)
      reschedule()
    }, delay)
  }

  async function tick() {
    for (const a of agents) decayMood(a.mood)
    const recent = feed.slice(-20)

    for (let idx = 0; idx < agents.length; idx++) {
      const agent = agents[idx]!
      const query = recent.length ? recent[recent.length - 1]!.text : agent.goal
      const memoryHits = memory.search(agent.id, query, 6)
      const memoryCount = memory.list(agent.id).length
      const actionId = nanoid(10)
      trace.write({
        kind: 'decide',
        actionId,
        agent: { id: agent.id, name: agent.name, role: agent.role, faction: agent.faction, locationId: agent.locationId },
        memoryCount,
        recentEvents: recent.map((e) => e.id),
      })
      const action = await decideAction({
        agentIndex: idx,
        agent,
        world,
        nodesById,
        agents,
        relations,
        recentFeed: feed.slice(-10), // Increased context
        memoryHits,
        memoryCount,
        llm,
        defaultModel,
      })
      trace.write({ kind: 'action', actionId, agentId: agent.id, action })
      applyAction(agent, action)
      agent.lastActionAt = now()
    }

    opts.onState(getState())
  }

  async function stepOnce() {
    await tick()
  }

  function applyAction(agent: AgentState, action: AgentAction) {
    if (action.type === 'summarize') {
      summarizeAgent(agent.id)
      pushEvent({
        type: 'summarize',
        title: 'Суммаризация памяти',
        text: `${agent.name} упорядочивает воспоминания и фиксирует выводы.`,
        participants: [agent.id],
        locationId: agent.locationId,
        importance: 0.25,
      })
      return
    }

    if (action.type === 'rest') {
      pushEvent({
        type: 'rest',
        title: `${agent.name} отдыхает`,
        text: `${agent.name} приводит мысли в порядок.`,
        participants: [agent.id],
        locationId: agent.locationId,
        importance: 0.25,
      })
      return
    }

    if (action.type === 'set_goal') {
      agent.goal = action.goal
      pushEvent({
        type: 'goal',
        title: `${agent.name} меняет цель`,
        text: action.goal,
        participants: [agent.id],
        importance: 0.35,
      })
      return
    }

    if (action.type === 'move') {
      const from = nodesById.get(agent.locationId)?.name ?? agent.locationId
      const toNode = nodesById.get(action.to)
      if (!toNode) return
      agent.locationId = toNode.id
      pushEvent({
        type: 'move',
        title: `${agent.name} перемещается`,
        text: `${from} → ${toNode.name}`,
        participants: [agent.id],
        locationId: toNode.id,
        importance: 0.18,
      })
      const rnd = mulberry32(Number.parseInt(agent.id.slice(0, 4), 36) + Date.now())
      if (toNode.ownerFaction !== agent.faction && rnd() < 0.28) {
        toNode.ownerFaction = agent.faction
        pushEvent({
          type: 'control',
          title: 'Контроль территории',
          text: `${agent.faction} укрепляется в ${toNode.name}.`,
          participants: [agent.id],
          locationId: toNode.id,
          importance: 0.5,
        })
      }
      return
    }

    if (action.type === 'gather') {
      const loc = nodesById.get(agent.locationId)
      if (!loc) return
      const cur = loc.resources[action.resource] ?? 0
      if (cur <= 0) return
      loc.resources[action.resource] = cur - 1
      pushEvent({
        type: 'gather',
        title: `${agent.name} добывает`,
        text: `${action.resource} в локации ${loc.name}.`,
        participants: [agent.id],
        locationId: loc.id,
        importance: 0.3,
      })
      const rnd = mulberry32(Number.parseInt(agent.id.slice(0, 4), 36) + Date.now())
      if (loc.ownerFaction !== agent.faction && rnd() < 0.18) {
        loc.ownerFaction = agent.faction
        pushEvent({
          type: 'control',
          title: 'Контроль территории',
          text: `${agent.faction} берёт под контроль ${loc.name} через снабжение.`,
          participants: [agent.id],
          locationId: loc.id,
          importance: 0.45,
        })
        // Others react to control change
        for (const other of agents) {
            if (other.faction === agent.faction) {
                bumpRelation(relations, other.id, agent.id, 0.1, 0.05)
            } else {
                bumpRelation(relations, other.id, agent.id, -0.15, -0.1)
            }
        }
      }
      return
    }

    if (action.type === 'message') {
      const to = agents.find((a) => a.id === action.to)
      if (!to) return
      pushEvent({
        type: 'message',
        title: `${agent.name} пишет ${to.name}`,
        text: action.text,
        participants: [agent.id, to.id],
        locationId: agent.locationId,
        importance: 0.28,
      })
      return
    }

    if (action.type === 'attack') {
      const target = agents.find((a) => a.id === action.target)
      if (!target) return
      if (target.locationId !== agent.locationId) return
      const rnd = mulberry32(Number.parseInt(agent.id.slice(0, 4), 36) + Date.now())
      const atk = clamp(0.55 + agent.mood.arousal * 0.15 + rnd() * 0.25, 0, 1)
      const def = clamp(0.45 - target.mood.valence * 0.1 + rnd() * 0.25, 0, 1)
      const win = atk >= def
      const loc = nodesById.get(agent.locationId)?.name ?? agent.locationId
      pushEvent({
        type: 'attack',
        title: `${agent.name} атакует ${target.name}`,
        text: win ? `Стычка в ${loc}: победа.` : `Стычка в ${loc}: отступление.`,
        participants: [agent.id, target.id],
        locationId: agent.locationId,
        importance: 0.85,
      })
      if (win) {
        bumpRelation(relations, agent.id, target.id, -0.25, -0.18)
        const place = nodesById.get(agent.locationId)
        if (place && rnd() < 0.22) {
          place.ownerFaction = agent.faction
          pushEvent({
            type: 'control',
            title: 'Смена контроля',
            text: `${agent.faction} продавливает контроль в ${place.name}.`,
            participants: [agent.id, target.id],
            locationId: place.id,
            importance: 0.65,
          })
        }
        const nbs = neighbors(world, target.locationId)
        if (nbs.length) target.locationId = pick(rnd, nbs)
      } else {
        bumpRelation(relations, agent.id, target.id, -0.18, -0.12)
        const nbs = neighbors(world, agent.locationId)
        if (nbs.length) agent.locationId = pick(rnd, nbs)
      }
      return
    }
  }

  function summarizeAgent(agentId: AgentId) {
    const entries = memory.list(agentId)
    if (entries.length < 170) return
    const chunk = memory.takeOldest(agentId, 45)
    const text = chunk.map((e) => e.text).join('\n')
    const summaryText = heuristicSummary(chunk, text)
    const kept = entries.slice(chunk.length)
    memory.replaceWith(agentId, kept)
    memory.add(agentId, 'summary', now(), summaryText, 0.55)
  }

  function heuristicSummary(chunk: { text: string }[], full: string) {
    const lines = chunk
      .slice(-16)
      .map((x) => x.text.replace(/\s+/g, ' ').slice(0, 140))
      .filter(Boolean)
    const tag = full.includes('атак') ? 'Конфликты' : full.includes('добы') ? 'Ресурсы' : 'Ход событий'
    return `${tag} (сводка):\n- ${lines.join('\n- ')}`
  }

  function dataDir() {
    const here = path.dirname(fileURLToPath(import.meta.url))
    return path.resolve(here, '../../../data')
  }

  return {
    start,
    stop,
    stepOnce,
    getState,
    setSpeed,
    injectWorldEvent,
    injectUserMessage,
  }
}

