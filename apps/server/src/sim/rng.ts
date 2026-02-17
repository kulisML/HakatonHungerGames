export function mulberry32(seed: number) {
  let t = seed >>> 0
  return function next() {
    t += 0x6d2b79f5
    let x = t
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

export function pick<T>(rnd: () => number, arr: T[]) {
  return arr[Math.floor(rnd() * arr.length)]!
}

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

export function norm(n: number, min: number, max: number) {
  const d = max - min
  if (d === 0) return 0
  return (n - min) / d
}

