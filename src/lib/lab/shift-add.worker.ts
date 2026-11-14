import { decodeSxq } from '@/lib/sky/lab'
import { shiftAndAdd, type StackGrid, type StackResult, type TrialMotion } from './shift-add'

type Job = { id: number; parts: Uint8Array[]; epochs: { nx: number; ny: number; wcs: number[]; sip: number[] | null; mjd: number }[]; grid: StackGrid; motions: TrialMotion[] }

self.onmessage = async (e: MessageEvent<Job>) => {
  const { id, parts, epochs, grid, motions } = e.data
  try {
    const exposures = await Promise.all(
      epochs.map(async (ep, i) => {
        const d = await decodeSxq(parts[i] as Uint8Array)
        return { ...ep, image: d.image, variance: d.variance, flags: d.flags }
      }),
    )
    const results: StackResult[] = motions.map((m) => shiftAndAdd(exposures, grid, m))
    self.postMessage({ id, results }, { transfer: results.flatMap((r) => [r.image.buffer, r.variance.buffer]) })
  } catch {
    self.postMessage({ id, results: null })
  }
}
