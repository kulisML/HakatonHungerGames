import { useEffect, useMemo, useRef, useState } from 'react'
import type { EventEnvelope, WorldState } from './types'

type Msg =
  | { type: 'state'; data: WorldState }
  | { type: 'event'; data: EventEnvelope }

const defaultApiBase = (import.meta as any).env?.VITE_API_BASE ?? 'http://localhost:8787'

export function useWorld(apiBase?: string, token?: string) {
  const base = apiBase ?? defaultApiBase
  const [state, setState] = useState<WorldState | null>(null)
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const retryRef = useRef(0)

  const wsUrl = useMemo(() => base.replace(/^http/, 'ws'), [base])
  const authToken = token ?? localStorage.getItem('app_token') ?? ''
  const wsUrlWithToken = useMemo(() => (authToken ? `${wsUrl}?token=${encodeURIComponent(authToken)}` : wsUrl), [wsUrl, authToken])

  useEffect(() => {
    let alive = true
    fetch(`${base}/api/state`, {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
    })
      .then((r) => r.json())
      .then((s) => {
        if (alive) setState(s)
      })
      .catch(() => null)
    return () => {
      alive = false
    }
  }, [base, authToken])

  useEffect(() => {
    let stopped = false
    let t: any = null

    const connect = () => {
      if (stopped) return
      const ws = new WebSocket(wsUrlWithToken)
      wsRef.current = ws
      ws.onopen = () => {
        retryRef.current = 0
        setConnected(true)
      }
      ws.onclose = () => {
        setConnected(false)
        wsRef.current = null
        if (stopped) return
        const attempt = Math.min(10, retryRef.current++)
        const backoff = Math.min(15000, 600 * Math.pow(2, attempt))
        t = setTimeout(connect, backoff)
      }
      ws.onerror = () => {
        setConnected(false)
      }
      ws.onmessage = (ev) => {
        const msg = safeJson(ev.data)
        if (!msg) return
        const m = msg as Msg
        if (m.type === 'state') setState(m.data)
        if (m.type === 'event') {
          setState((prev) => {
            if (!prev) return prev
            const next = { ...prev, feed: [...prev.feed, m.data] }
            if (next.feed.length > 240) next.feed = next.feed.slice(-240)
            return next
          })
        }
      }
    }

    connect()
    return () => {
      stopped = true
      if (t) clearTimeout(t)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [wsUrlWithToken])

  async function post(path: string, body: unknown) {
    await fetch(`${base}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify(body),
    }).catch(() => null)
  }

  return {
    state,
    connected,
    setSpeed: (speed: number) => post('/api/control/speed', { speed }),
    injectEvent: (text: string) => post('/api/control/event', { text }),
    sendMessage: (agentId: string, text: string) => post('/api/control/message', { agentId, text }),
  }
}

function safeJson(data: any) {
  if (typeof data !== 'string') return null
  try {
    return JSON.parse(data)
  } catch {
    return null
  }
}

