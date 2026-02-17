import assert from 'node:assert/strict'
import { createEngine } from './engine.js'

const events: any[] = []
const engine = createEngine({
  tickMs: 999999,
  onState: () => null,
  onEvent: (e) => events.push(e),
})

for (let i = 0; i < 40; i++) {
  await engine.stepOnce()
}

const state = engine.getState()
assert.equal(state.agents.length, 5)
assert.ok(state.feed.length > 0)
assert.ok(state.feed.every((e) => typeof e.type === 'string' && typeof e.title === 'string' && typeof e.text === 'string'))
assert.ok(state.feed.every((e) => e.participants && e.participants.length >= 1))
assert.ok(state.world.nodes.length > 0)
assert.ok(state.relations.length > 0)

console.log('smoke: ok', { events: events.length, feed: state.feed.length })
