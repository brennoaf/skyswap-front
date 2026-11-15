import type { TrackPoint } from './moving'

export const RULER_TIMES = 5
const MAX_STARS = 12
const MIN_STARS = 3
const BOX = 2
const RING = 4
const EDGE = RING + 1
const MIN_SEP_PX = 5
const PEAK_SIGMA = 10

export type Ruler = { photos: number; fromMjd: number; toMjd: number; scatterPx: number; stars: number }

const median = (values: number[]) => {
  const s = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!s.length) return Number.NaN
  const m = s.length >> 1
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2
}

function meanImage(images: Float32Array[]): Float32Array {
  const n = images[0]?.length ?? 0
  const out = new Float32Array(n)
  for (let p = 0; p < n; p++) {
    let s = 0
    let c = 0
    for (const img of images) {
      const v = img[p] as number
      if (Number.isFinite(v)) {
        s += v
        c++
      }
    }
    out[p] = c ? s / c : Number.NaN
  }
  return out
}

function findStars(img: Float32Array, n: number): { x: number; y: number }[] {
  const bg = median(Array.from(img))
  const noise = 1.4826 * median(Array.from(img, (v) => Math.abs(v - bg)))
  if (!Number.isFinite(bg) || !(noise > 0)) return []
  const peaks: { x: number; y: number; v: number }[] = []
  for (let y = EDGE; y < n - EDGE; y++) {
    for (let x = EDGE; x < n - EDGE; x++) {
      const v = img[y * n + x] as number
      if (!(v > bg + PEAK_SIGMA * noise)) continue
      let top = true
      for (let dy = -1; dy <= 1 && top; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && !((img[(y + dy) * n + x + dx] as number) < v)) top = false
      if (top) peaks.push({ x, y, v })
    }
  }
  peaks.sort((a, b) => b.v - a.v)
  const out: { x: number; y: number }[] = []
  for (const p of peaks) {
    if (out.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < MIN_SEP_PX)) continue
    out.push(p)
    if (out.length >= MAX_STARS) break
  }
  return out
}

export function centroid(img: Float32Array, n: number, sx: number, sy: number): { x: number; y: number } | null {
  const ring: number[] = []
  for (let dy = -RING; dy <= RING; dy++) for (let dx = -RING; dx <= RING; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === RING) ring.push(img[(sy + dy) * n + sx + dx] as number)
  const bg = median(ring)
  if (!Number.isFinite(bg)) return null
  let w = 0
  let cx = 0
  let cy = 0
  for (let dy = -BOX; dy <= BOX; dy++) {
    for (let dx = -BOX; dx <= BOX; dx++) {
      const v = img[(sy + dy) * n + sx + dx] as number
      if (!Number.isFinite(v)) return null
      const f = Math.max(0, v - bg)
      w += f
      cx += f * (sx + dx)
      cy += f * (sy + dy)
    }
  }
  return w > 0 ? { x: cx / w, y: cy / w } : null
}

export function stillScatter(images: Float32Array[], visits: number[], n: number): { px: number; stars: number } | null {
  const ids = [...new Set(visits)].sort((a, b) => a - b)
  if (ids.length < 2) return null
  const perVisit = ids.map((v) => meanImage(images.filter((_, i) => visits[i] === v)))
  const stars = findStars(meanImage(perVisit), n)
  const seen = stars.map((s) => perVisit.map((img) => centroid(img, n, s.x, s.y)))
  const used = seen.filter((list) => list.filter(Boolean).length >= 2)
  if (used.length < MIN_STARS) return null
  const dev = used.map((list) => {
    const ok = list.filter((p): p is { x: number; y: number } => !!p)
    const mx = ok.reduce((s, p) => s + p.x, 0) / ok.length
    const my = ok.reduce((s, p) => s + p.y, 0) / ok.length
    return list.map((p) => (p ? { dx: p.x - mx, dy: p.y - my } : null))
  })
  const residuals: number[] = []
  ids.forEach((_, v) => {
    const here = dev.map((d) => d[v]).filter((d): d is { dx: number; dy: number } => !!d)
    if (here.length < MIN_STARS) return
    const sx = median(here.map((d) => d.dx))
    const sy = median(here.map((d) => d.dy))
    for (const d of here) residuals.push(d.dx - sx, d.dy - sy)
  })
  if (residuals.length < 2 * MIN_STARS) return null
  return { px: 1.4826 * median(residuals.map(Math.abs)), stars: used.length }
}

export function passesRuler(track: TrackPoint[], scatterPx: number | null): boolean {
  if (scatterPx === null) return track.length > 0
  const a = track[0]
  const b = track[track.length - 1]
  return !!a && !!b && Math.hypot(b.x - a.x, b.y - a.y) > RULER_TIMES * scatterPx
}
