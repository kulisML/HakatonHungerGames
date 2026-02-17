import fs from 'node:fs'
import path from 'node:path'

export type LogRecord = Record<string, unknown>

export function createJsonlLogger(dir: string, filename = 'sim.trace.jsonl') {
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, filename)
  const stream = fs.createWriteStream(file, { flags: 'a' })
  const enabled = (process.env.SIM_TRACE ?? '').trim() === '1'

  function write(rec: LogRecord) {
    if (!enabled) return
    stream.write(`${JSON.stringify({ ts: Date.now(), ...rec })}\n`)
  }

  function close() {
    stream.end()
  }

  return { write, close, file, enabled }
}

