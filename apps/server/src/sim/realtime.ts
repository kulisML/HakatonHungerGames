import type { WebSocket, WebSocketServer } from 'ws'
import type { EventEnvelope, WorldState } from './types.js'

export function createBroadcaster(wss: WebSocketServer) {
  const clients = new Set<WebSocket>()

  function addClient(ws: WebSocket) {
    clients.add(ws)
    ws.on('close', () => clients.delete(ws))
  }

  function broadcast(obj: unknown) {
    const data = JSON.stringify(obj)
    for (const ws of clients) {
      if (ws.readyState === ws.OPEN) ws.send(data)
    }
  }

  function broadcastState(state: WorldState) {
    broadcast({ type: 'state', data: state })
  }

  function broadcastEvent(ev: EventEnvelope) {
    broadcast({ type: 'event', data: ev })
  }

  return { addClient, broadcastState, broadcastEvent }
}

