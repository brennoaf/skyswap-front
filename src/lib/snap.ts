export type Grey = { width: number; height: number; at: (x: number, y: number) => number }

export const SNAP_RADIUS = 0.06
const PEAK_RADIUS = 0.025
const MIN_CONTRAST = 12

const round = (v: number) => Math.round(v * 1e4) / 1e4

export function snapToPeak(grey: Grey, x0: number, y0: number, w: number, u: number, v: number): { u: number; v: number } {
  const cx = x0 + u * w
  const cy = y0 + v * w
  const r = SNAP_RADIUS * w
  const values: number[] = []
  let best = -Infinity
  let bx = cx
  let by = cy
  for (let y = Math.max(y0, Math.floor(cy - r)); y <= Math.min(y0 + w - 1, Math.ceil(cy + r)); y++) {
    for (let x = Math.max(x0, Math.floor(cx - r)); x <= Math.min(x0 + w - 1, Math.ceil(cx + r)); x++) {
      if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > r) continue
      const g = grey.at(x, y)
      values.push(g)
      if (g > best) [best, bx, by] = [g, x + 0.5, y + 0.5]
    }
  }
  if (!values.length) return { u, v }
  const bg = [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] as number
  if (best - bg < MIN_CONTRAST) return { u, v }
  const p = Math.max(1, PEAK_RADIUS * w)
  let sw = 0
  let sx = 0
  let sy = 0
  for (let y = Math.max(y0, Math.floor(by - p)); y <= Math.min(y0 + w - 1, Math.ceil(by + p)); y++) {
    for (let x = Math.max(x0, Math.floor(bx - p)); x <= Math.min(x0 + w - 1, Math.ceil(bx + p)); x++) {
      if (Math.hypot(x + 0.5 - bx, y + 0.5 - by) > p) continue
      const wgt = grey.at(x, y) - bg
      if (wgt <= 0) continue
      sw += wgt
      sx += wgt * (x + 0.5)
      sy += wgt * (y + 0.5)
    }
  }
  if (!sw) return { u, v }
  return { u: round((sx / sw - x0) / w), v: round((sy / sw - y0) / w) }
}

export function greyOf(img: HTMLImageElement): Grey | null {
  const width = img.naturalWidth
  const height = img.naturalHeight
  if (!width || !height || typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(img, 0, 0)
  const data = ctx.getImageData(0, 0, width, height).data
  return { width, height, at: (x, y) => data[(y * width + x) * 4] ?? 0 }
}

export function snapTap(grey: Grey | null, frame: number, u: number, v: number): { u: number; v: number } {
  if (!grey) return { u: round(u), v: round(v) }
  const tile = Math.round(grey.height / 2)
  return snapToPeak(grey, frame * tile, 0, tile, u, v)
}
