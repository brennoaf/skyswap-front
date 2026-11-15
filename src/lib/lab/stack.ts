import type { StackGrid, StackResult, TrialMotion } from './shift-add'

export type StackEpoch = { nx: number; ny: number; wcs: number[]; sip: number[] | null; mjd: number }

const TIMEOUT_MS = 90_000

let worker: Worker | null = null
let seq = 0
const pending = new Map<number, (r: StackResult[] | null) => void>()

function settle(id: number, results: StackResult[] | null) {
  const done = pending.get(id)
  pending.delete(id)
  done?.(results)
}

function reset() {
  worker?.terminate()
  worker = null
  for (const id of [...pending.keys()]) settle(id, null)
}

function getWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null
  if (!worker) {
    try {
      worker = new Worker(new URL('./shift-add.worker.ts', import.meta.url), { type: 'module' })
    } catch {
      return null
    }
    worker.onmessage = (e: MessageEvent<{ id: number; results: StackResult[] | null }>) => settle(e.data.id, e.data.results)
    worker.onerror = reset
    worker.onmessageerror = reset
  }
  return worker
}

export function runShiftAdd(parts: Uint8Array[], epochs: StackEpoch[], grid: StackGrid, motions: TrialMotion[], timeoutMs = TIMEOUT_MS): Promise<StackResult[] | null> {
  const w = getWorker()
  if (!w) return Promise.resolve(null)
  const id = ++seq
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (pending.has(id)) reset()
    }, timeoutMs)
    pending.set(id, (r) => {
      clearTimeout(timer)
      resolve(r)
    })
    try {
      w.postMessage({ id, parts, epochs, grid, motions })
    } catch {
      settle(id, null)
    }
  })
}
