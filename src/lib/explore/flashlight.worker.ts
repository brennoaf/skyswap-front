import { detectAll, differenceStack, hints } from '@/lib/sky/sci/detect.js'
import { linkMoving, type DetectionRow } from './moving'

type Job = { id: number; images: Float32Array[]; variances: Float32Array[]; visits: number[]; hours: number[]; n: number }

self.onmessage = (e: MessageEvent<Job>) => {
  const { id, images, variances, visits, hours, n } = e.data
  try {
    const stack = differenceStack(images, variances, visits)
    const rows = detectAll(stack, visits, n) as DetectionRow[]
    self.postMessage({ id, hints: hints(rows), moved: linkMoving(rows, hours) })
  } catch {
    self.postMessage({ id, hints: [], moved: [] })
  }
}
