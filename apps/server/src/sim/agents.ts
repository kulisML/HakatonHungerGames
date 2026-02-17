import { nanoid } from 'nanoid'
import { z } from 'zod'
import type { AgentAction, AgentRole, AgentState, EventEnvelope, LocationNode, Relation, WorldGraph } from './types.js'
import { clamp, mulberry32, pick } from './rng.js'
import { neighbors } from './world.js'
import { getOpinion, getRelation } from './relations.js'
import type { MemorySearchHit } from './memory.js'
import type { OpenRouterClient } from './openrouter.js'

export function seedAgents(world: WorldGraph, seed = 2026): AgentState[] {
  const rnd = mulberry32(seed)
  const nodes = world.nodes
  const pickNode = () => pick(rnd, nodes).id

  return [
    mkAgent(
      'Артем',
      'Strategist',
      'Орден Пограничья',
      pickNode(),
      'Укрепить контроль над кристаллами.',
      { empathy: 0.35, aggression: 0.45, greed: 0.25, discipline: 0.9, curiosity: 0.55 },
      {
        personality: 'Холодный стратег. Говорит коротко, приоритизирует контроль и ресурсы.',
        constraints: ['Избегай бессмысленных дуэлей.', 'Не провоцируй войну без преимущества.'],
        priorities: ['Контроль шахт и перевалов', 'Стабилизация отношений внутри фракции', 'Информация о врагах'],
      },
    ),
    mkAgent(
      'Лина',
      'Diplomat',
      'Орден Пограничья',
      pickNode(),
      'Заключить выгодный союз и обезопасить снабжение.',
      { empathy: 0.85, aggression: 0.12, greed: 0.28, discipline: 0.72, curiosity: 0.62 },
      {
        personality: 'Дипломат и медиатор. Умеет успокаивать и склонять к компромиссу.',
        constraints: ['Не начинай драки первой.', 'Старайся разрядить конфликт словами.', 'Сохраняй лицо фракции.'],
        priorities: ['Сообщения и переговоры', 'Рост доверия союзников', 'Снижение напряжения'],
      },
    ),
    mkAgent(
      'Свет',
      'Quartermaster',
      'Орден Пограничья',
      pickNode(),
      'Наладить ресурсы: еда, дерево, торговля.',
      { empathy: 0.55, aggression: 0.18, greed: 0.6, discipline: 0.78, curiosity: 0.4 },
      {
        personality: 'Логист. Считает, что победа — это снабжение. Практичный тон.',
        constraints: ['Не рискуй без нужды.', 'В приоритете добыча и безопасные маршруты.'],
        priorities: ['Добыча и логистика', 'Контроль портов и городов', 'Поддержка союзников сообщениями'],
      },
    ),
    mkAgent(
      'Марек',
      'Spy',
      'Клан Тумана',
      pickNode(),
      'Найти слабое место Ордена и посеять разлад.',
      { empathy: 0.22, aggression: 0.35, greed: 0.5, discipline: 0.8, curiosity: 0.92 },
      {
        personality: 'Шпион и интриган. Любит двусмысленность и провокации, избегает прямой силы.',
        constraints: ['Не раскрывай мотивы.', 'Предпочитай влияние словам и слухам.', 'Не дерись без причины.'],
        priorities: ['Сообщения с манипуляцией', 'Разведка через перемещения', 'Подрыв доверия врагов'],
      },
    ),
    mkAgent(
      'Рагнар',
      'Warlord',
      'Клан Тумана',
      pickNode(),
      'Сломить сопротивление и захватить перевалы.',
      { empathy: 0.18, aggression: 0.92, greed: 0.35, discipline: 0.62, curiosity: 0.25 },
      {
        personality: 'Полководец. Прямой, резкий, уважает силу и инициативу.',
        constraints: ['Не отступай без причины.', 'Бей, если есть преимущество или цель.'],
        priorities: ['Контроль перевалов', 'Охота на одиночек', 'Запугивание врагов сообщениями'],
      },
    ),
  ]
}

function mkAgent(
  name: string,
  role: AgentRole,
  faction: string,
  locationId: string,
  goal: string,
  traits: AgentState['traits'],
  profile: AgentState['profile'],
): AgentState {
  return {
    id: nanoid(10),
    name,
    role,
    avatarSeed: `${name}-${role}`,
    faction,
    traits,
    profile,
    locationId,
    mood: { valence: 0.05, arousal: 0.05 },
    goal,
    lastActionAt: 0,
  }
}

const actionSchema: z.ZodType<AgentAction> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('rest') }),
  z.object({ type: z.literal('move'), to: z.string().min(1) }),
  z.object({ type: z.literal('message'), to: z.string().min(1), text: z.string().min(1).max(500) }),
  z.object({ type: z.literal('attack'), target: z.string().min(1) }),
  z.object({ type: z.literal('gather'), resource: z.string().min(1).max(32) }),
  z.object({ type: z.literal('set_goal'), goal: z.string().min(1).max(180) }),
  z.object({ type: z.literal('summarize') }),
])

export type DecideActionInput = {
  agentIndex: number
  agent: AgentState
  world: WorldGraph
  nodesById: Map<string, LocationNode>
  agents: AgentState[]
  relations: Relation[]
  recentFeed: EventEnvelope[]
  memoryHits: MemorySearchHit[]
  memoryCount: number
  llm: OpenRouterClient | null
  defaultModel: string
  tick: number // Added tick to track time
}

export async function decideAction(input: DecideActionInput): Promise<AgentAction> {
  const sys = systemPrompt(input.agent)
  const user = userPrompt(input)
  const action =
    (await input.llm?.chatJson({
      agentIndex: input.agentIndex,
      model: input.defaultModel,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user },
      ],
      schema: actionSchema,
      maxTokens: 240,
    })) ?? null

  if (action) return sanitizeAction(action, input)
  return fallbackAction(input)
}

function sanitizeAction(action: AgentAction, input: DecideActionInput): AgentAction {
  if (action.type === 'move') {
    const nbs = neighbors(input.world, input.agent.locationId)
    if (!nbs.includes(action.to)) return { type: 'move', to: pick(mulberry32(Date.now()), nbs) ?? input.agent.locationId }
  }
  if (action.type === 'attack') {
    const tgt = input.agents.find((a) => a.id === action.target)
    if (!tgt || tgt.locationId !== input.agent.locationId) return { type: 'rest' }
    const rel = getRelation(input.relations, input.agent.id, tgt.id)
    if ((input.agent.role === 'Diplomat' || input.agent.role === 'Quartermaster') && rel.affinity > -0.85) {
      return { type: 'message', to: tgt.id, text: `Не сейчас. Я выбираю слова, а не кровь.` }
    }
    if (input.agent.role === 'Spy' && rel.affinity > -0.9) return { type: 'rest' }
  }
  if (action.type === 'message') {
    const tgt = input.agents.find((a) => a.id === action.to)
    if (!tgt) return { type: 'rest' }
  }
  if (action.type === 'gather') {
    const loc = input.nodesById.get(input.agent.locationId)
    if (!loc || !loc.resources[action.resource]) {
      const keys = loc ? Object.keys(loc.resources) : []
      if (keys.length === 0) return { type: 'rest' }
      return { type: 'gather', resource: keys[0]! }
    }
  }
  if (action.type === 'set_goal') {
    const g = action.goal.trim()
    return { type: 'set_goal', goal: g.slice(0, 180) }
  }
  if (action.type === 'message') {
    if (input.agent.lastActionAt > 0 && input.agent.lastActionAt > Date.now() - 3000) return { type: 'rest' } // Anti-spam
    const prev = input.recentFeed.find(e => e.participants?.includes(input.agent.id) && e.type === 'message' && e.ts > Date.now() - 20000)
    if (prev && prev.text === action.text.trim()) return { type: 'rest' } // Deduplicate exact messages
    return { type: 'message', to: action.to, text: action.text.trim().slice(0, 500) }
  }
  if (action.type === 'summarize') {
    if (input.memoryCount < 140) return { type: 'rest' }
  }
  return action
}

function fallbackAction(input: DecideActionInput): AgentAction {
  const rnd = mulberry32(Date.now() + input.agentIndex * 97)
  if (input.memoryCount >= 180 && rnd() < 0.25) return { type: 'summarize' }
  const here = input.agent.locationId
  const othersHere = input.agents.filter((a) => a.locationId === here && a.id !== input.agent.id)
  for (const other of othersHere) {
    const r = getRelation(input.relations, input.agent.id, other.id)
    if (r.affinity <= -0.55 && rnd() < 0.5) return { type: 'attack', target: other.id }
    if (r.affinity >= 0.4 && rnd() < 0.35) return { type: 'message', to: other.id, text: `Держимся вместе. Я на месте в ${locName(input, here)}.` }
  }

  if (rnd() < 0.22) {
    const candidates = input.agents.filter((a) => a.id !== input.agent.id)
    if (candidates.length) {
      const target = pick(rnd, candidates)
      const r = getRelation(input.relations, input.agent.id, target.id)
      const txt =
        r.affinity <= -0.4
          ? `Слышал, ты снова мутил дела. Не думай, что это останется без ответа.`
          : r.affinity >= 0.35
            ? `Как держишься? Если нужна помощь — дай знак.`
            : `Что нового по карте? Я сейчас в ${locName(input, here)}.`
      return { type: 'message', to: target.id, text: txt }
    }
  }

  const loc = input.nodesById.get(here)
  const res = loc ? Object.entries(loc.resources).filter(([, v]) => v > 0) : []
  if (res.length && rnd() < 0.5) return { type: 'gather', resource: res[0]![0] }
  if (rnd() < 0.15) return { type: 'rest' }

  const nbs = neighbors(input.world, here)
  if (nbs.length === 0) return { type: 'rest' }
  return { type: 'move', to: pick(rnd, nbs) }
}

function locName(input: DecideActionInput, id: string) {
  return input.nodesById.get(id)?.name ?? id
}

function systemPrompt(agent: AgentState) {
  const roleHint: Record<AgentRole, string> = {
    Strategist: 'Ты стратег: выбирай цели и приоритеты, думай о контроле территории и ресурсах.',
    Diplomat: 'Ты дипломат: договаривайся, предлагай союзы, снимай напряжение, манипулируй словами.',
    Spy: 'Ты шпион: собирай информацию, провоцируй расколы, действуй скрытно.',
    Quartermaster: 'Ты казначей и логист: думай о ресурсах, снабжении, устойчивости.',
    Warlord: 'Ты полководец: оценивай угрозы, выбирай выгодные столкновения и позиции.',
  }
  return [
    'Ты автономный агент в симуляции мира.',
    `Имя: ${agent.name}. Фракция: ${agent.faction}. Роль: ${agent.role}.`,
    `Черты (0..1): empathy=${agent.traits.empathy}, aggression=${agent.traits.aggression}, greed=${agent.traits.greed}, discipline=${agent.traits.discipline}, curiosity=${agent.traits.curiosity}.`,
    `Персонаж: ${agent.profile.personality}`,
    `Ограничения: ${agent.profile.constraints.join(' | ')}`,
    `Приоритеты: ${agent.profile.priorities.join(' | ')}`,
    roleHint[agent.role],
    'Отвечай только валидным JSON-объектом.',
    'Разрешённые действия: rest, move, message, attack, gather, set_goal, summarize.',
    'ВАЖНО: НЕ ПОВТОРЯЙ ОДНИ И ТЕ ЖЕ СООБЩЕНИЯ. Если ты уже сказал что-то, скажи новое или действуй.',
    'Отношения динамичны: если тебя оскорбили — ответь или затаи злобу. Если помогли — предложи союз.',
    'Меняй цель (set_goal), если старая неактуальна или достигнута. Не застревай в одной рутине.',
    'Каждое действие должно развивать историю. Избегай пассивности.',
  ].join('\n')
}

function userPrompt(input: DecideActionInput) {
  const agent = input.agent
  const here = input.nodesById.get(agent.locationId)
  
  // Recent self history to prevent loops
  const myRecentMessages = input.recentFeed
    .filter(e => e.participants?.includes(agent.id) && e.type === 'message')
    .map(e => e.text)
    .slice(-3)

  const nbs = neighbors(input.world, agent.locationId).map((id) => {
    const node = input.nodesById.get(id)
    const name = node?.name ?? id
    const there = input.agents.filter((a) => a.locationId === id).map((a) => ({ id: a.id, name: a.name, faction: a.faction, role: a.role }))
    const topRes = node
      ? Object.entries(node.resources)
          .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
          .slice(0, 3)
          .map(([k, v]) => ({ k, v }))
      : []
    return { id, name, kind: node?.kind, ownerFaction: node?.ownerFaction, topRes, agentsThere: there }
  })
  const othersHere = input.agents
    .filter((a) => a.locationId === agent.locationId && a.id !== agent.id)
    .map((a) => ({
      id: a.id,
      name: a.name,
      role: a.role,
      faction: a.faction,
      mood: a.mood,
      relation: getRelation(input.relations, agent.id, a.id),
      opinion: getOpinion(input.relations, agent.id, a.id),
    }))

  const feed = input.recentFeed.slice(-8).map((e) => ({
    ts: e.ts,
    type: e.type,
    title: e.title,
    text: e.text,
    participants: e.participants ?? [],
    locationId: e.locationId ?? null,
  }))

  const memories = input.memoryHits.map((h) => ({
    kind: h.entry.kind,
    score: Number(h.score.toFixed(3)),
    text: h.entry.text,
  }))

  const moodLabel =
    agent.mood.valence >= 0.35 ? 'позитивное' : agent.mood.valence <= -0.35 ? 'негативное' : 'нейтральное'

  const candidates = buildCandidates(input)

  return JSON.stringify(
    {
      you: {
        id: agent.id,
        name: agent.name,
        role: agent.role,
        faction: agent.faction,
        mood: agent.mood,
        moodLabel,
        goal: agent.goal,
        memoryCount: input.memoryCount,
        lastSentMessages: myRecentMessages,
        location: here
          ? { id: here.id, name: here.name, kind: here.kind, resources: here.resources, ownerFaction: here.ownerFaction }
          : { id: agent.locationId },
      },
      neighbors: nbs,
      othersHere,
      recentEvents: feed,
      recalledMemories: memories,
      candidates,
      output: {
        examples: [
          { type: 'move', to: nbs[0]?.id ?? agent.locationId },
          { type: 'message', to: othersHere[0]?.id ?? agent.id, text: 'Совершенно новая информация.' },
          { type: 'rest' },
          { type: 'gather', resource: Object.keys(here?.resources ?? {})[0] ?? 'food' },
          { type: 'set_goal', goal: 'Новая актуальная цель, учитывающая изменения.' },
          { type: 'summarize' },
        ],
      },
    },
    null,
    2,
  )
}

function buildCandidates(input: DecideActionInput) {
  const out: AgentAction[] = []
  const here = input.agent.locationId
  const loc = input.nodesById.get(here)

  if (input.memoryCount >= 180) out.push({ type: 'summarize' })

  const res = loc ? Object.entries(loc.resources).filter(([, v]) => v > 0) : []
  if (res.length) out.push({ type: 'gather', resource: res.sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]![0] })

  const othersHere = input.agents.filter((a) => a.locationId === here && a.id !== input.agent.id)
  for (const other of othersHere) {
    const r = getRelation(input.relations, input.agent.id, other.id)
    if (r.affinity <= -0.55) out.push({ type: 'attack', target: other.id })
    out.push({ type: 'message', to: other.id, text: `Коротко: что у тебя по ситуации?` })
  }

  const nbs = neighbors(input.world, here)
  if (nbs.length) out.push({ type: 'move', to: pick(mulberry32(Date.now() + 13), nbs) })
  out.push({ type: 'rest' })
  return out.slice(0, 10)
}

