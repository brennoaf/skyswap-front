import type { FlashlightHint } from '@/lib/sky'

export type HintKind = 'appeared' | 'missing' | 'flash'

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
const TIMEOUT_MS = 8000

let worker: Worker | null = null
let seq = 0
const pending = new Map<number, (h: FlashlightHint[]) => void>()

function getWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null
  if (!worker) {
    worker = new Worker(new URL('./flashlight.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<{ id: number; hints: FlashlightHint[] }>) => {
      pending.get(e.data.id)?.(e.data.hints)
      pending.delete(e.data.id)
    }
  }
  return worker
}

export function toCardHints(raw: FlashlightHint[], n: number): CardHint[] {
  return raw
    .filter((h): h is FlashlightHint & { kind: HintKind } => h.kind !== 'residual')
    .slice(0, MAX_HINTS)
    .map((h) => ({ kind: h.kind, visit: h.visit, u: (h.x + 0.5) / n, v: (n - 1 - h.y + 0.5) / n, snr: h.snr, score: h.score }))
}

export function isStrong(hints: CardHint[]): boolean {
  return hints.some((h) => h.kind === 'appeared' && h.snr >= STRONG_SNR)
}

export function runFlashlight(images: Float32Array[], variances: Float32Array[], visits: number[], n: number): Promise<CardHint[]> {
  const w = getWorker()
  if (!w || new Set(visits).size < 2) return Promise.resolve([])
  const id = ++seq
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      resolve([])
    }, TIMEOUT_MS)
    pending.set(id, (raw) => {
      clearTimeout(timer)
      resolve(toCardHints(raw, n))
    })
    w.postMessage({ id, images, variances, visits, n })
  })
}
