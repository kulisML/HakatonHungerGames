import type { Mood, WorldEventType } from './types.js'
import { clamp } from './rng.js'

export function applyEventToMood(mood: Mood, type: WorldEventType, importance: number) {
  const k = clamp(importance, 0, 1)
  if (type === 'attack') return bump(mood, -0.35 * k, 0.5 * k)
  if (type === 'message') return bump(mood, 0.08 * k, 0.05 * k)
  if (type === 'gather') return bump(mood, 0.18 * k, 0.1 * k)
  if (type === 'control') return bump(mood, 0.12 * k, 0.08 * k)
  if (type === 'rest') return bump(mood, 0.12 * k, -0.15 * k)
  if (type === 'move') return bump(mood, 0.02 * k, 0.05 * k)
  if (type === 'goal') return bump(mood, 0.05 * k, 0.1 * k)
  if (type === 'summarize') return bump(mood, 0.08 * k, -0.1 * k)
  return bump(mood, 0, 0)
}

export function decayMood(mood: Mood) {
  mood.valence *= 0.985
  mood.arousal *= 0.985
}

function bump(mood: Mood, dv: number, da: number) {
  mood.valence = clamp(mood.valence + dv, -1, 1)
  mood.arousal = clamp(mood.arousal + da, -1, 1)
  return mood
}

