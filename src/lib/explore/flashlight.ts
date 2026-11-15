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
  if (typeof Worker === 'undefined' || new Set(visits).size < 2) return Promise.resolve([])
  return new Promise((resolve) => {
    const worker = new Worker(new URL('./flashlight.worker.ts', import.meta.url), { type: 'module' })
    const finish = (hints: CardHint[]) => {
      clearTimeout(timer)
      worker.terminate()
      resolve(hints)
    }
    const timer = setTimeout(() => finish([]), TIMEOUT_MS)
    worker.onmessage = (e: MessageEvent<{ hints: FlashlightHint[] }>) => finish(toCardHints(e.data.hints, n))
    worker.onerror = () => finish([])
    worker.postMessage({ id: 0, images, variances, visits, n })
  })
}
