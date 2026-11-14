import { detectAll, differenceStack, hints } from '@/lib/sky/sci/detect.js'

type Job = { id: number; images: Float32Array[]; variances: Float32Array[]; visits: number[]; n: number }

self.onmessage = (e: MessageEvent<Job>) => {
  const { id, images, variances, visits, n } = e.data
  try {
    const stack = differenceStack(images, variances, visits)
    self.postMessage({ id, hints: hints(detectAll(stack, visits, n)) })
  } catch {
    self.postMessage({ id, hints: [] })
  }
}
