import { useState } from 'react'
import type { AgentState } from './types'

export function ControlPanel(props: {
  onInjectEvent: (text: string) => Promise<any>
  onSendMessage: (agentId: string, text: string) => Promise<any>
  selectedAgentId: string | null
  agents: AgentState[]
}) {
  const [eventText, setEventText] = useState('')
  const [msgText, setMsgText] = useState('')
  const [isSending, setIsSending] = useState(false)

  const handleInject = async () => {
    if (!eventText.trim()) return
    setIsSending(true)
    try {
      await props.onInjectEvent(eventText)
      setEventText('')
    } finally {
      setIsSending(false)
    }
  }

  const handleMessage = async () => {
    if (!msgText.trim() || !props.selectedAgentId) return
    setIsSending(true)
    try {
      await props.onSendMessage(props.selectedAgentId, msgText)
      setMsgText('')
    } finally {
      setIsSending(false)
    }
  }

  const selectedAgent = props.agents.find(a => a.id === props.selectedAgentId)

  return (
    <div className="space-y-4">
      <div className="text-xs font-bold text-ink-500 uppercase tracking-widest mb-2">Управление Миром</div>
      
      {/* World Event Injection */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-ink-700">Событие Мира</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={eventText}
            onChange={(e) => setEventText(e.target.value)}
            placeholder="Например: Найден древний клад!"
            className="flex-1 bg-parchment-50 border border-parchment-300 rounded px-2 py-1 text-sm focus:outline-none focus:border-ink-600 placeholder:text-ink-400/50"
            onKeyDown={(e) => e.key === 'Enter' && handleInject()}
          />
          <button
            onClick={handleInject}
            disabled={isSending || !eventText.trim()}
            className="px-3 py-1 bg-ink-800 text-parchment-100 rounded text-xs font-bold uppercase tracking-wide hover:bg-ink-700 disabled:opacity-50 transition-colors"
          >
            ⚡
          </button>
        </div>
      </div>

      {/* Direct Message to Agent */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-ink-700">
            Сообщение {selectedAgent ? `для ${selectedAgent.name}` : '(выберите агента)'}
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={msgText}
            onChange={(e) => setMsgText(e.target.value)}
            placeholder={selectedAgent ? "Голос свыше..." : "Сначала выберите агента"}
            disabled={!selectedAgent}
            className="flex-1 bg-parchment-50 border border-parchment-300 rounded px-2 py-1 text-sm focus:outline-none focus:border-ink-600 placeholder:text-ink-400/50 disabled:bg-parchment-200/50"
            onKeyDown={(e) => e.key === 'Enter' && handleMessage()}
          />
          <button
            onClick={handleMessage}
            disabled={isSending || !msgText.trim() || !selectedAgent}
            className="px-3 py-1 bg-magic-blue text-white rounded text-xs font-bold uppercase tracking-wide hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >
            ✉
          </button>
        </div>
      </div>
    </div>
  )
}