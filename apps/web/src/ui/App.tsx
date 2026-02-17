import { useEffect, useMemo, useRef, useState } from 'react'
import { useWorld } from './useWorld'
import type { AgentId, AgentState, EventEnvelope, Relation, WorldState } from './types'
import { useElementSize } from './useElementSize'
import { MapCanvas } from './MapCanvas'

import { ControlPanel } from './ControlPanel'
import { InteractiveRelationGraph } from './InteractiveRelationGraph'

export function App() {
  const [token, setToken] = useState(() => localStorage.getItem('app_token') ?? '')
  const { state, connected, setSpeed, injectEvent, sendMessage } = useWorld(undefined, token)
  const [selectedAgentId, setSelectedAgentId] = useState<AgentId | null>(null)
  const [mode, setMode] = useState<'map' | 'relations'>('map')

  const selectedAgent = useMemo(() => {
    if (!state || !selectedAgentId) return null
    return state.agents.find((a) => a.id === selectedAgentId) ?? null
  }, [state, selectedAgentId])

  if (!state) return (
    <div className="flex items-center justify-center h-screen bg-parchment-100 text-ink-800 font-serif">
      <div className="text-2xl animate-pulse">Загрузка хроник...</div>
    </div>
  )

  return (
    <div className="h-screen w-full grid grid-cols-1 lg:grid-cols-[360px_1fr_400px] grid-rows-[64px_1fr] lg:grid-rows-1 overflow-hidden bg-parchment-100">
      
      {/* Mobile Top Bar */}
      <div className="lg:hidden col-span-1 row-start-1 flex items-center justify-between px-4 bg-parchment-200 border-b border-parchment-400">
         <div className="font-bold text-lg text-ink-900 flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${connected ? 'bg-magic-green shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-magic-red'}`} />
            Agent World
         </div>
         <div className="flex gap-2">
            <button 
              onClick={() => setMode('map')}
              className={`px-3 py-1 rounded text-sm font-bold transition-colors ${mode === 'map' ? 'bg-ink-800 text-parchment-100' : 'bg-parchment-300 text-ink-800'}`}
            >Карта</button>
            <button 
              onClick={() => setMode('relations')}
              className={`px-3 py-1 rounded text-sm font-bold transition-colors ${mode === 'relations' ? 'bg-ink-800 text-parchment-100' : 'bg-parchment-300 text-ink-800'}`}
            >Связи</button>
         </div>
      </div>

      {/* Left Panel: Feed */}
      <div className="hidden lg:block lg:col-start-1 lg:row-start-1 h-full border-r border-parchment-400 bg-parchment-100/50 backdrop-blur-sm relative z-10 shadow-xl">
        <div className="h-16 flex items-center px-4 border-b border-parchment-400 bg-parchment-200">
           <div className="font-bold text-xl text-ink-900 flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${connected ? 'bg-magic-green shadow-[0_0_10px_rgba(16,185,129,0.6)]' : 'bg-magic-red'}`} />
              <span>Хроники Мира</span>
           </div>
        </div>
        <Feed feed={state.feed} agents={state.agents} onPickAgent={setSelectedAgentId} />
      </div>

      {/* Center Panel: Map/Graph */}
      <div className="col-start-1 lg:col-start-2 row-start-2 lg:row-start-1 h-full relative overflow-hidden bg-ink-900">
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex gap-2 bg-parchment-100/90 p-1 rounded-lg shadow-lg border border-parchment-300 backdrop-blur">
             <button 
                onClick={() => setMode('map')}
                className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${mode === 'map' ? 'bg-ink-800 text-parchment-50 shadow-md' : 'text-ink-700 hover:bg-parchment-300'}`}
              >Карта</button>
              <button 
                onClick={() => setMode('relations')}
                className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${mode === 'relations' ? 'bg-ink-800 text-parchment-50 shadow-md' : 'text-ink-700 hover:bg-parchment-300'}`}
              >Отношения</button>
        </div>

        {mode === 'map' ? (
          <MapCanvas state={state} selectedAgentId={selectedAgentId} onPickAgent={setSelectedAgentId} />
        ) : (
          <InteractiveRelationGraph state={state} selectedAgentId={selectedAgentId} onPickAgent={setSelectedAgentId} />
        )}

        {/* Speed Control Overlay */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 bg-parchment-100/90 px-6 py-3 rounded-full shadow-xl border border-parchment-300 backdrop-blur flex items-center gap-4">
           <span className="text-xs font-bold text-ink-600 uppercase tracking-wider">Скорость Времени</span>
           <input
              type="range"
              min={0.25}
              max={6}
              step={0.25}
              value={state.speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="w-32 accent-ink-800 cursor-pointer"
            />
            <span className="font-mono text-ink-900 font-bold w-12 text-right">{state.speed.toFixed(2)}x</span>
        </div>
      </div>

      {/* Right Panel: Inspector */}
      <div className="hidden lg:block lg:col-start-3 lg:row-start-1 h-full border-l border-parchment-400 bg-parchment-100/50 backdrop-blur-sm relative z-10 shadow-xl grid grid-rows-[auto_1fr]">
        <div className="h-16 flex items-center justify-between px-4 border-b border-parchment-400 bg-parchment-200">
            <span className="font-bold text-lg text-ink-900">Досье</span>
            <input
              type="password"
              value={token}
              onChange={(e) => {
                const v = e.target.value
                setToken(v)
                localStorage.setItem('app_token', v)
              }}
              placeholder="Ключ доступа..."
              className="bg-parchment-50 border border-parchment-300 rounded px-2 py-1 text-xs w-32 focus:outline-none focus:border-ink-600 transition-colors"
            />
        </div>
        <div className="overflow-hidden flex flex-col h-full">
            <Inspector state={state} selectedAgent={selectedAgent} onPickAgent={setSelectedAgentId} />
            <div className="border-t border-parchment-400 bg-parchment-200 p-4">
               <ControlPanel 
                  onInjectEvent={injectEvent} 
                  onSendMessage={sendMessage} 
                  selectedAgentId={selectedAgentId}
                  agents={state.agents}
               />
            </div>
        </div>
      </div>

    </div>
  )
}

// (старый RelationGraphView заменён на более функциональный InteractiveRelationGraph)

function Feed(props: { feed: EventEnvelope[]; agents: AgentState[]; onPickAgent: (id: AgentId | null) => void }) {
  const byId = useMemo(() => new Map(props.agents.map((a) => [a.id, a])), [props.agents])
  const items = props.feed.slice(-140).reverse()
  return (
    <div className="h-[calc(100vh-64px)] overflow-y-auto p-4 space-y-4">
      {items.map((e) => (
        <div key={e.id} className="relative pl-4 border-l-2 border-parchment-300 hover:border-ink-600 transition-colors group">
            {/* Event Type Indicator */}
            <div className={`absolute -left-[5px] top-1 w-2.5 h-2.5 rounded-full border border-parchment-100 ${eventTypeColorBg(e.type)}`} />
            
            <div className="flex items-baseline justify-between mb-1">
               <span className="font-serif font-bold text-ink-900 text-sm group-hover:text-magic-blue transition-colors">{e.title}</span>
               <span className="font-mono text-[10px] text-ink-600/70">{fmtTime(e.ts)}</span>
            </div>
            
            <div className="text-sm text-ink-800 leading-relaxed font-serif opacity-90">
               {e.text}
            </div>

            {e.participants?.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {e.participants.map((pid) => {
                  const a = byId.get(pid)
                  if (!a) return null
                  return (
                    <button 
                      key={pid} 
                      onClick={() => props.onPickAgent(pid)}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-parchment-200 border border-parchment-300 text-ink-700 hover:bg-ink-800 hover:text-parchment-50 transition-colors font-bold uppercase tracking-wide"
                    >
                      {a.name}
                    </button>
                  )
                })}
              </div>
            ) : null}
        </div>
      ))}
    </div>
  )
}

function Inspector(props: { state: WorldState; selectedAgent: AgentState | null; onPickAgent: (id: AgentId | null) => void }) {
  const a = props.selectedAgent
  return (
    <div className="flex-1 min-h-0 grid grid-rows-[auto_1fr] overflow-hidden">
      {/* Agent Grid */}
      <div className="p-4 grid grid-cols-2 gap-2 max-h-[220px] overflow-y-auto border-b border-parchment-300 bg-parchment-50/50">
        {props.state.agents.map((x) => (
          <button
            key={x.id}
            onClick={() => props.onPickAgent(x.id)}
            className={`flex items-center gap-3 p-2 rounded-lg border transition-all ${a?.id === x.id ? 'bg-parchment-200 border-ink-400 shadow-sm' : 'bg-transparent border-transparent hover:bg-parchment-200/50'}`}
          >
            <div className="w-8 h-8 rounded-md shadow-inner border border-black/10 flex-shrink-0" style={{ background: moodColor(x.mood.valence) }} />
            <div className="text-left min-w-0">
               <div className="font-bold text-ink-900 text-sm truncate">{x.name}</div>
               <div className="text-[10px] text-ink-600 uppercase tracking-wide truncate">{roleRu(x.role)}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Detail Card */}
      <div className="overflow-y-auto p-4 bg-paper-texture">
        {a ? (
          <div className="space-y-6">
             <div>
                <div className="text-xs font-bold text-ink-500 uppercase tracking-widest mb-2 border-b border-parchment-300 pb-1">Профиль</div>
                <div className="space-y-3">
                    <div className="grid grid-cols-[80px_1fr] items-baseline">
                       <span className="text-xs text-ink-600">Роль</span>
                       <span className="font-bold text-ink-900">{roleRu(a.role)}</span>
                    </div>
                    <div className="grid grid-cols-[80px_1fr] items-center">
                       <span className="text-xs text-ink-600">Настрой</span>
                       <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-ink-900 text-parchment-100 shadow-sm">
                          {moodLabel(a.mood)}
                       </span>
                    </div>
                    <div className="grid grid-cols-[80px_1fr] items-baseline">
                       <span className="text-xs text-ink-600">Цель</span>
                       <span className="text-sm text-ink-800 italic leading-snug">"{a.goal}"</span>
                    </div>
                </div>
             </div>

             <div>
                <div className="text-xs font-bold text-ink-500 uppercase tracking-widest mb-3 border-b border-parchment-300 pb-1">Связи и Влияние</div>
                <RelationList selfId={a.id} relations={props.state.relations} agents={props.state.agents} />
             </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-ink-400 opacity-60">
             <div className="text-4xl mb-2">📜</div>
             <div className="text-sm font-serif italic">Выберите персонажа для просмотра досье</div>
          </div>
        )}
      </div>
    </div>
  )
}

function RelationList(props: { selfId: AgentId; relations: Relation[]; agents: AgentState[] }) {
  const byId = useMemo(() => new Map(props.agents.map((a) => [a.id, a])), [props.agents])
  const rows = useMemo(() => {
    const out: Array<{ other: AgentState; affinity: number; trust: number }> = []
    for (const r of props.relations) {
      if (r.a === props.selfId) {
        const other = byId.get(r.b)
        if (other) out.push({ other, affinity: r.affinity, trust: r.trust })
      } else if (r.b === props.selfId) {
        const other = byId.get(r.a)
        if (other) out.push({ other, affinity: r.affinity, trust: r.trust })
      }
    }
    out.sort((x, y) => y.affinity - x.affinity)
    return out
  }, [props.relations, props.selfId, byId])

  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.other.id} className="bg-parchment-50 border border-parchment-200 rounded p-2 shadow-sm">
          <div className="flex justify-between items-center mb-1.5">
             <span className="font-bold text-sm text-ink-900">{r.other.name}</span>
             <div className="flex gap-3 text-[10px] font-mono font-bold text-ink-600">
                <span className={r.affinity > 0 ? 'text-magic-green' : 'text-magic-red'}>
                   {r.affinity > 0 ? '+' : ''}{r.affinity.toFixed(2)} ❤
                </span>
                <span className="text-magic-blue">
                   {r.trust.toFixed(2)} 🤝
                </span>
             </div>
          </div>
          <div className="h-1.5 w-full bg-parchment-200 rounded-full overflow-hidden border border-parchment-300">
             <div 
                className="h-full transition-all duration-500" 
                style={{ 
                    width: `${((r.affinity + 1) / 2) * 100}%`, 
                    background: affinityColor(r.affinity) 
                }} 
             />
          </div>
        </div>
      ))}
    </div>
  )
}

function roleRu(r: string) {
  const map: Record<string, string> = {
    Strategist: 'Стратег',
    Diplomat: 'Дипломат',
    Spy: 'Шпион',
    Quartermaster: 'Казначей',
    Warlord: 'Полководец'
  }
  return map[r] ?? r
}

function fmtTime(ts: number) {
  const d = new Date(ts)
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function moodLabel(m: { valence: number; arousal: number }) {
  if (m.valence > 0.35 && m.arousal > 0.2) return 'Вдохновение'
  if (m.valence > 0.35) return 'Спокойствие'
  if (m.valence < -0.35 && m.arousal > 0.2) return 'Ярость'
  if (m.valence < -0.35) return 'Угрюмость'
  if (m.arousal > 0.35) return 'Напряжение'
  return 'Равновесие'
}

function moodColor(valence: number) {
  if (valence >= 0.5) return '#10b981' // emerald-500
  if (valence >= 0.15) return '#34d399' // emerald-400
  if (valence > -0.15) return '#60a5fa' // blue-400
  if (valence > -0.5) return '#f59e0b' // amber-500
  return '#ef4444' // red-500
}

function affinityColor(a: number) {
  if (a >= 0.55) return '#16a34a' // green-600
  if (a >= 0.2) return '#65a30d' // lime-600
  if (a > -0.2) return '#2563eb' // blue-600
  if (a > -0.55) return '#d97706' // amber-600
  return '#dc2626' // red-600
}

function eventTypeColorBg(type: string) {
    switch(type) {
        case 'attack': return 'bg-magic-red'
        case 'message': return 'bg-magic-blue'
        case 'gather': return 'bg-magic-green'
        case 'control': return 'bg-magic-gold'
        case 'summarize': return 'bg-magic-purple'
        default: return 'bg-ink-600'
    }
}

