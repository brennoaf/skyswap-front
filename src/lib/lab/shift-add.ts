import { FLAG_LAYERS, makeWcs } from '@/lib/sky/lab'

export const SHIFT_ADD_MASK = FLAG_LAYERS.saturation | FLAG_LAYERS.cosmic | FLAG_LAYERS.persistence
const MAS_PER_DEG = 3.6e6
const DAYS_PER_YEAR = 365.25

export interface StackExposure {
  image: Float32Array
  variance: Float32Array
  flags: Int32Array
  nx: number
  ny: number
  wcs: number[]
  sip: number[] | null
  mjd: number
}

export interface StackGrid {
  nx: number
  ny: number
  wcs: number[]
  sip: number[] | null
}

export interface TrialMotion {
  pmra: number
  pmdec: number
  refMjd: number
}

export interface StackResult {
  nx: number
  ny: number
  image: Float32Array
  variance: Float32Array
  used: number
}

function sample(e: StackExposure, x: number, y: number, mask: number): [number, number] | null {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  if (x0 < 0 || y0 < 0 || x0 + 1 >= e.nx || y0 + 1 >= e.ny) return null
  const fx = x - x0
  const fy = y - y0
  let v = 0
  let s = 0
  const corners: [number, number, number][] = [
    [x0, y0, (1 - fx) * (1 - fy)],
    [x0 + 1, y0, fx * (1 - fy)],
    [x0, y0 + 1, (1 - fx) * fy],
    [x0 + 1, y0 + 1, fx * fy],
  ]
  for (const [cx, cy, w] of corners) {
    const k = cy * e.nx + cx
    const val = e.image[k] as number
    const variance = e.variance[k] as number
    if (((e.flags[k] as number) & mask) !== 0 || !Number.isFinite(val) || !(variance > 0)) return null
    v += w * val
    s += w * variance
  }
  return [v, s]
}

export function shiftAndAdd(exposures: StackExposure[], grid: StackGrid, motion: TrialMotion, mask = SHIFT_ADD_MASK): StackResult {
  const n = grid.nx * grid.ny
  const ref = makeWcs({ wcs: grid.wcs, sip: grid.sip })
  const ra = new Float64Array(n)
  const dec = new Float64Array(n)
  for (let y = 0; y < grid.ny; y++) {
    for (let x = 0; x < grid.nx; x++) {
      const [r, d] = ref.pix2world(x, y)
      ra[y * grid.nx + x] = r
      dec[y * grid.nx + x] = d
    }
  }
  const num = new Float64Array(n)
  const den = new Float64Array(n)
  let used = 0
  for (const e of exposures) {
    const w = makeWcs({ wcs: e.wcs, sip: e.sip })
    const years = (e.mjd - motion.refMjd) / DAYS_PER_YEAR
    const dDec = (motion.pmdec / MAS_PER_DEG) * years
    const dRa = (motion.pmra / MAS_PER_DEG) * years
    let any = false
    for (let k = 0; k < n; k++) {
      const d = dec[k] as number
      const [ex, ey] = w.world2pix((ra[k] as number) + dRa / Math.cos((d * Math.PI) / 180), d + dDec)
      const got = sample(e, ex, ey, mask)
      if (!got) continue
      num[k] = (num[k] as number) + got[0] / got[1]
      den[k] = (den[k] as number) + 1 / got[1]
      any = true
    }
    if (any) used++
  }
  const image = new Float32Array(n)
  const variance = new Float32Array(n)
  for (let k = 0; k < n; k++) {
    const d = den[k] as number
    image[k] = d > 0 ? (num[k] as number) / d : NaN
    variance[k] = d > 0 ? 1 / d : NaN
  }
  return { nx: grid.nx, ny: grid.ny, image, variance, used }
}

export function localBackground(r: StackResult, x: number, y: number, inner: number, outer: number): number {
  const ring: number[] = []
  for (let j = Math.max(0, Math.floor(y - outer)); j <= Math.min(r.ny - 1, Math.ceil(y + outer)); j++) {
    for (let i = Math.max(0, Math.floor(x - outer)); i <= Math.min(r.nx - 1, Math.ceil(x + outer)); i++) {
      const dist = Math.hypot(i - x, j - y)
      const v = r.image[j * r.nx + i] as number
      if (dist >= inner && dist <= outer && Number.isFinite(v)) ring.push(v)
    }
  }
  ring.sort((a, b) => a - b)
  return ring.length ? (ring[ring.length >> 1] as number) : 0
}

export function noiseLevel(r: StackResult): number {
  const values: number[] = []
  for (const v of r.image) if (Number.isFinite(v)) values.push(v)
  if (values.length < 3) return NaN
  values.sort((a, b) => a - b)
  const med = values[values.length >> 1] as number
  const dev = values.map((v) => Math.abs(v - med)).sort((a, b) => a - b)
  return 1.4826 * (dev[dev.length >> 1] as number)
}

export function peakSnr(r: StackResult, x: number, y: number, radius = 1.5): number {
  const bg = localBackground(r, x, y, 5, 9)
  const noise = noiseLevel(r)
  let best = -Infinity
  for (let j = Math.max(0, Math.floor(y - radius)); j <= Math.min(r.ny - 1, Math.ceil(y + radius)); j++) {
    for (let i = Math.max(0, Math.floor(x - radius)); i <= Math.min(r.nx - 1, Math.ceil(x + radius)); i++) {
      if (Math.hypot(i - x, j - y) > radius) continue
      const v = r.image[j * r.nx + i] as number
      if (Number.isFinite(v)) best = Math.max(best, v - bg)
    }
  }
  return noise > 0 ? best / noise : NaN
}
