import assert from 'node:assert/strict'
import { createEngine } from './engine.js'

const engine = createEngine({
  tickMs: 999999,
  onState: () => null,
  onEvent: () => null,
})

const started = Date.now()
for (let i = 0; i < 500; i++) {
  await engine.stepOnce()
}
const ms = Date.now() - started
const state = engine.getState()

assert.ok(state.feed.length > 0)
console.log('load: ok', { ticks: 500, ms, events: state.feed.length })

