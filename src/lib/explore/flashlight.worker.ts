import { detectAll, differenceStack, hints } from '@/lib/sky/sci/detect.js'
import { linkMoving, type DetectionRow } from './moving'
import { passesRuler, stillScatter } from './ruler'

type Job = { id: number; images: Float32Array[]; variances: Float32Array[]; visits: number[]; hours: number[]; n: number }

self.onmessage = (e: MessageEvent<Job>) => {
  const { id, images, variances, visits, hours, n } = e.data
  try {
    const stack = differenceStack(images, variances, visits)
    const rows = detectAll(stack, visits, n) as DetectionRow[]
    const still = stillScatter(images, visits, n)
    const moved = linkMoving(rows, hours)
    self.postMessage({ id, hints: hints(rows), moved: passesRuler(moved, still?.px ?? null) ? moved : [], still })
  } catch {
    self.postMessage({ id, hints: [], moved: [], still: null })
  }
}
