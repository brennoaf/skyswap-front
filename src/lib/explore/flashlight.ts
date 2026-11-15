import type { FlashlightHint } from '@/lib/sky'
import type { TrackPoint } from './moving'

export type HintKind = 'moved' | 'appeared' | 'missing' | 'flash'

export interface CardHint {
  kind: HintKind
  visit: number
  u: number
  v: number
  snr: number
  score: number
}

export const STRONG_SNR = 8
const MAX_HINTS = 3
const SAME_SPOT_PX = 3
const TIMEOUT_MS = 8000

export function toCardHints(raw: FlashlightHint[], n: number, moved: TrackPoint[] = []): CardHint[] {
  const place = (x: number, y: number) => ({ u: (x + 0.5) / n, v: (n - 1 - y + 0.5) / n })
  const track = moved.map((p): CardHint => ({ kind: 'moved', visit: p.visit, ...place(p.x, p.y), snr: p.snr, score: p.snr }))
  const rest = raw
    .filter((h): h is FlashlightHint & { kind: Exclude<HintKind, 'moved'> } => h.kind !== 'residual')
    .filter((h) => !moved.some((p) => p.visit === h.visit && Math.hypot(p.x - h.x, p.y - h.y) <= SAME_SPOT_PX))
    .slice(0, MAX_HINTS)
    .map((h): CardHint => ({ kind: h.kind, visit: h.visit, ...place(h.x, h.y), snr: h.snr, score: h.score }))
  return [...track, ...rest]
}

export function isStrong(hints: CardHint[]): boolean {
  return hints.some((h) => h.kind === 'appeared' && h.snr >= STRONG_SNR)
}

export function visitHours(visits: number[], mjds: number[]): number[] {
  const sum: number[] = []
  const count: number[] = []
  visits.forEach((v, i) => {
    sum[v] = (sum[v] ?? 0) + (mjds[i] ?? NaN) * 24
    count[v] = (count[v] ?? 0) + 1
  })
  return sum.map((s, v) => s / (count[v] ?? 1))
}

export function runFlashlight(images: Float32Array[], variances: Float32Array[], visits: number[], mjds: number[], n: number): Promise<CardHint[]> {
  if (typeof Worker === 'undefined' || new Set(visits).size < 2) return Promise.resolve([])
  return new Promise((resolve) => {
    const worker = new Worker(new URL('./flashlight.worker.ts', import.meta.url), { type: 'module' })
    const finish = (hints: CardHint[]) => {
      clearTimeout(timer)
      worker.terminate()
      resolve(hints)
    }
    const timer = setTimeout(() => finish([]), TIMEOUT_MS)
    worker.onmessage = (e: MessageEvent<{ hints: FlashlightHint[]; moved: TrackPoint[] }>) => finish(toCardHints(e.data.hints, n, e.data.moved))
    worker.onerror = () => finish([])
    worker.postMessage({ id: 0, images, variances, visits, hours: visitHours(visits, mjds), n })
  })
}
