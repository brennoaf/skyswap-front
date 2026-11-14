import type { StackGrid, StackResult, TrialMotion } from './shift-add'

export type StackEpoch = { nx: number; ny: number; wcs: number[]; sip: number[] | null; mjd: number }

let worker: Worker | null = null
let seq = 0
const pending = new Map<number, (r: StackResult[] | null) => void>()

function getWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null
  if (!worker) {
    worker = new Worker(new URL('./shift-add.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<{ id: number; results: StackResult[] | null }>) => {
      pending.get(e.data.id)?.(e.data.results)
      pending.delete(e.data.id)
    }
  }
  return worker
}

export function runShiftAdd(parts: Uint8Array[], epochs: StackEpoch[], grid: StackGrid, motions: TrialMotion[]): Promise<StackResult[] | null> {
  const w = getWorker()
  if (!w) return Promise.resolve(null)
  const id = ++seq
  return new Promise((resolve) => {
    pending.set(id, resolve)
    w.postMessage({ id, parts, epochs, grid, motions })
  })
}
