const BLOCKS = 10
const MIN_SHARE = 0.15

export function outsideShare(pixels: Uint8ClampedArray, size: number): number {
  const b = Math.max(1, Math.floor(size / BLOCKS))
  const n = Math.floor(size / b)
  const empty: boolean[] = new Array(n * n).fill(false)
  for (let by = 0; by < n; by++) {
    for (let bx = 0; bx < n; bx++) {
      let all = true
      for (let y = by * b; y < (by + 1) * b && all; y++) {
        for (let x = bx * b; x < (bx + 1) * b; x++) {
          const o = (y * size + x) * 4
          if ((pixels[o] ?? 0) + (pixels[o + 1] ?? 0) + (pixels[o + 2] ?? 0) > 0) {
            all = false
            break
          }
        }
      }
      empty[by * n + bx] = all
    }
  }
  const seen = new Set<number>()
  const stack: number[] = []
  for (let i = 0; i < n; i++) stack.push(i, n * n - 1 - i, i * n, i * n + n - 1)
  while (stack.length) {
    const i = stack.pop() as number
    if (seen.has(i) || !empty[i]) continue
    seen.add(i)
    const x = i % n
    if (x > 0) stack.push(i - 1)
    if (x < n - 1) stack.push(i + 1)
    if (i >= n) stack.push(i - n)
    if (i < n * n - n) stack.push(i + n)
  }
  return seen.size / (n * n)
}

export function hasOutsideArea(img: CanvasImageSource, sx: number, sy: number, size: number): boolean {
  if (!size) return false
  try {
    const c = document.createElement('canvas')
    c.width = size
    c.height = size
    const ctx = c.getContext('2d', { willReadFrequently: true })
    if (!ctx) return false
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(img, sx, sy, size, size, 0, 0, size, size)
    return outsideShare(ctx.getImageData(0, 0, size, size).data, size) >= MIN_SHARE
  } catch {
    return false
  }
}
