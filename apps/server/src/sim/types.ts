export type AgentId = string
export type LocationId = string

export type Mood = {
  valence: number
  arousal: number
}

export type AgentRole = 'Strategist' | 'Diplomat' | 'Spy' | 'Quartermaster' | 'Warlord'

export type AgentState = {
  id: AgentId
  name: string
  role: AgentRole
  avatarSeed: string
  faction: string
  traits: {
    empathy: number
    aggression: number
    greed: number
    discipline: number
    curiosity: number
  }
  profile: {
    personality: string
    constraints: string[]
    priorities: string[]
  }
  locationId: LocationId
  mood: Mood
  goal: string
  lastActionAt: number
}

export type LocationNode = {
  id: LocationId
  name: string
  x: number
  y: number
  kind: 'town' | 'ruins' | 'pass' | 'mine' | 'port' | 'forest'
  resources: Record<string, number>
  ownerFaction: string | null
}

export type WorldGraph = {
  seed: number
  width: number
  height: number
  nodes: LocationNode[]
  edges: Array<{ a: LocationId; b: LocationId }>
}

export type Relation = {
  a: AgentId
  b: AgentId
  affinity: number
  trust: number
}

export type WorldEventType =
  | 'world'
  | 'control'
  | 'move'
  | 'message'
  | 'attack'
  | 'gather'
  | 'rest'
  | 'goal'
  | 'summarize'

export type EventEnvelope = {
  id: string
  ts: number
  type: WorldEventType
  title: string
  text: string
  locationId?: LocationId
  participants?: AgentId[]
  importance: number
}

export type WorldState = {
  now: number
  speed: number
  world: WorldGraph
  agents: AgentState[]
  relations: Relation[]
  feed: EventEnvelope[]
}

export type AgentAction =
  | { type: 'rest' }
  | { type: 'move'; to: LocationId }
  | { type: 'message'; to: AgentId; text: string }
  | { type: 'attack'; target: AgentId }
  | { type: 'gather'; resource: string }
  | { type: 'set_goal'; goal: string }
  | { type: 'summarize' }

