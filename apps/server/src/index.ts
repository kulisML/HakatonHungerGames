import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import http from 'http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { WebSocketServer } from 'ws'
import { z } from 'zod'
import { createEngine } from './sim/engine.js'
import { createBroadcaster } from './sim/realtime.js'

const port = Number(process.env.SERVER_PORT ?? 8787)
const appToken = (process.env.APP_TOKEN ?? '').trim()

const app = express()
app.use(cors({ origin: true }))
app.use(express.json({ limit: '1mb' }))

const server = http.createServer(app)
const wss = new WebSocketServer({
  server,
  verifyClient: (info, cb) => {
    if (!appToken) return cb(true)
    const ok = extractTokenFromUrl(info.req.url ?? '') === appToken
    cb(ok, ok ? 101 : 401, ok ? 'OK' : 'Unauthorized')
  },
})
const broadcaster = createBroadcaster(wss)

const engine = createEngine({
  tickMs: Number(process.env.TICK_MS ?? 1500),
  onState: broadcaster.broadcastState,
  onEvent: broadcaster.broadcastEvent,
})

app.get('/api/state', (req, res) => {
  if (!checkBearer(req.headers.authorization, appToken)) return res.status(401).json({ error: 'unauthorized' })
  res.json(engine.getState())
})

const speedSchema = z.object({
  speed: z.number().min(0.25).max(6),
})
app.post('/api/control/speed', (req, res) => {
  if (!checkBearer(req.headers.authorization, appToken)) return res.status(401).json({ error: 'unauthorized' })
  const parsed = speedSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'bad_request' })
  engine.setSpeed(parsed.data.speed)
  res.json({ ok: true })
})

const eventSchema = z.object({
  text: z.string().min(1).max(500),
})
app.post('/api/control/event', (req, res) => {
  if (!checkBearer(req.headers.authorization, appToken)) return res.status(401).json({ error: 'unauthorized' })
  const parsed = eventSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'bad_request' })
  engine.injectWorldEvent(parsed.data.text)
  res.json({ ok: true })
})

const messageSchema = z.object({
  agentId: z.string().min(1),
  text: z.string().min(1).max(500),
})
app.post('/api/control/message', (req, res) => {
  if (!checkBearer(req.headers.authorization, appToken)) return res.status(401).json({ error: 'unauthorized' })
  const parsed = messageSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'bad_request' })
  engine.injectUserMessage(parsed.data.agentId, parsed.data.text)
  res.json({ ok: true })
})

app.get('/api/debug/trace', async (req, res) => {
  if (!checkBearer(req.headers.authorization, appToken)) return res.status(401).json({ error: 'unauthorized' })
  const tail = Math.max(1, Math.min(500, Number(req.query.tail ?? 120)))
  const file = path.resolve(process.cwd(), 'apps/data/logs/sim.trace.jsonl')
  const text = await fs.readFile(file, 'utf8').catch(() => '')
  const lines = text.split('\n').filter(Boolean)
  res.json({ file, lines: lines.slice(-tail).map((l) => safeJson(l) ?? { raw: l }) })
})

wss.on('connection', (ws) => {
  broadcaster.addClient(ws)
  ws.send(JSON.stringify({ type: 'state', data: engine.getState() }))
})

server.listen(port, () => {
  engine.start()
  console.log(`server: http://localhost:${port}`)
})

function checkBearer(authHeader: string | undefined, token: string) {
  if (!token) return true
  if (!authHeader) return false
  const m = authHeader.match(/^Bearer\s+(.+)$/i)
  if (!m) return false
  return m[1] === token
}

function extractTokenFromUrl(url: string) {
  const idx = url.indexOf('?')
  if (idx === -1) return ''
  const qs = url.slice(idx + 1)
  for (const part of qs.split('&')) {
    const [k, v] = part.split('=')
    if (k === 'token') return decodeURIComponent(v ?? '')
  }
  return ''
}

function safeJson(s: string) {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

