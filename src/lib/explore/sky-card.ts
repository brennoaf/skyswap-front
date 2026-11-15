import { percentile, skyMovie, type IndexRow } from '@/lib/sky'
import type { Spot } from './sampler'
import { INDEX_BASE, pointHits } from './lookup'

export const SKY_HOSTS = ['/api/s3/']
export const SKY_FOV_DEG = 0.105
export const MAX_VISITS = 4
export const MIN_VISITS = 3
export const SHORT_DAYS = 4 / 24
export const MAX_EXPOSURES = 6
export const VISIT_GAP_DAYS = 30 / 1440
export const WINDOW_DAYS = 8 / 24
export const MAX_SPARES = 2
export const MIN_COVERAGE = 0.9

const DETECTOR_PX = 2040
const PIXEL_DEG = 6.15 / 3600

export interface SkyPick {
  band: string
  visits: IndexRow[][]
  spares: IndexRow[][]
}

export interface SkyExposure {
  key: string
  mjd: number
  wl_um: number
  visit: number
  img: Float32Array
  variance: Float32Array
}

export interface SkyCardDraft {
  ra: number
  dec: number
  band: string
  size_px: number
  frames: { key: string; mjd: number; wl_um: number; visit: number }[]
  exposures: SkyExposure[]
  pixels: { width: number; height: number; data: Uint8ClampedArray }
}

export function groupVisits<T extends { mjd: number }>(rows: T[], gap = VISIT_GAP_DAYS): T[][] {
  const sorted = [...rows].sort((a, b) => a.mjd - b.mjd)
  const out: T[][] = []
  for (const r of sorted) {
    const cur = out[out.length - 1]
    const last = cur?.[cur.length - 1]
    if (cur && last && r.mjd - last.mjd <= gap) cur.push(r)
    else out.push([r])
  }
  return out
}

const midMjd = (v: { mjd: number }[]) => v.reduce((a, r) => a + r.mjd, 0) / Math.max(1, v.length)

export function edgeCoverage(h: { px: number; py: number }, fovDeg = SKY_FOV_DEG): number {
  if (!Number.isFinite(h.px) || !Number.isFinite(h.py)) return 1
  const half = fovDeg / PIXEL_DEG / 2
  const side = (c: number) => Math.max(0, Math.min(DETECTOR_PX, c + half) - Math.max(0, c - half))
  return (side(h.px) * side(h.py)) / (4 * half * half)
}

export function chooseVisits(hits: IndexRow[], maxVisits = MAX_VISITS, budget = MAX_EXPOSURES): SkyPick | null {
  const byBand = new Map<string, IndexRow[]>()
  for (const h of hits) {
    if (h.dqa !== 'Pass' || !Number.isFinite(h.mjd) || edgeCoverage(h) < MIN_COVERAGE) continue
    byBand.set(h.band, [...(byBand.get(h.band) ?? []), h])
  }
  let best: (SkyPick & { span: number }) | null = null
  for (const [band, list] of [...byBand.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const visits = groupVisits(list)
    if (visits.length < MIN_VISITS) continue
    const mids = visits.map(midMjd)
    const at = (i: number) => mids[i] as number
    let from = -1
    let to = -1
    let span = Infinity
    for (let i = 0; i + MIN_VISITS - 1 < visits.length; i++) {
      const j = i + MIN_VISITS - 1
      const s = at(j) - at(i)
      if (s <= WINDOW_DAYS && s < span) [from, to, span] = [i, j, s]
    }
    if (from < 0) continue
    while (to - from + 1 < maxVisits) {
      const before = from > 0 ? at(to) - at(from - 1) : Infinity
      const after = to + 1 < visits.length ? at(to + 1) - at(from) : Infinity
      if (Math.min(before, after) > SHORT_DAYS) break
      if (after <= before) to++
      else from--
    }
    const chosen = visits.slice(from, to + 1)
    const per = Math.max(1, Math.min(2, Math.floor(budget / chosen.length)))
    const centre = (at(from) + at(to)) / 2
    const spares = visits
      .filter((v) => !chosen.includes(v))
      .sort((a, b) => Math.abs(midMjd(a) - centre) - Math.abs(midMjd(b) - centre))
      .filter((v) => Math.abs(midMjd(v) - centre) <= WINDOW_DAYS / 2)
      .slice(0, MAX_SPARES)
    if (!best || span < best.span || (span === best.span && chosen.length > best.visits.length)) best = { band, visits: chosen.map((v) => v.slice(0, per)), spares: spares.map((v) => v.slice(0, per)), span }
  }
  return best ? { band: best.band, visits: best.visits, spares: best.spares } : null
}

export function meanImage(images: Float32Array[]): Float32Array {
  const n = images[0]?.length ?? 0
  const out = new Float32Array(n)
  for (let p = 0; p < n; p++) {
    let sum = 0
    let cnt = 0
    for (const img of images) {
      const v = img[p] as number
      if (Number.isFinite(v)) {
        sum += v
        cnt++
      }
    }
    out[p] = cnt ? sum / cnt : NaN
  }
  return out
}

export function coverage(img: Float32Array): number {
  if (!img.length) return 0
  let n = 0
  for (const v of img) if (Number.isFinite(v)) n++
  return n / img.length
}

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const m = sorted.length >> 1
  return sorted.length % 2 ? (sorted[m] as number) : ((sorted[m - 1] as number) + (sorted[m] as number)) / 2
}

export function robustScale(values: number[]): number {
  if (!values.length) return 1
  const med = medianOf(values)
  return Math.max(1e-6, 1.4826 * medianOf(values.map((v) => Math.abs(v - med))))
}

export function differenceImages(images: Float32Array[]): Float32Array[] {
  const k = images.length
  const n = images[0]?.length ?? 0
  const others: number[] = []
  return images.map((img, i) => {
    const out = new Float32Array(n)
    for (let p = 0; p < n; p++) {
      others.length = 0
      for (let j = 0; j < k; j++) {
        if (j === i) continue
        const v = (images[j] as Float32Array)[p] as number
        if (Number.isFinite(v)) others.push(v)
      }
      const v = img[p] as number
      out[p] = others.length && Number.isFinite(v) ? v - medianOf(others) : NaN
    }
    return out
  })
}

export function differenceScale(diffs: Float32Array[]): number {
  const values: number[] = []
  for (const d of diffs) for (let p = 0; p < d.length; p += 3) if (Number.isFinite(d[p])) values.push(d[p] as number)
  return 6 * robustScale(values)
}

export function differenceGrey(d: number, scale: number): number {
  return Number.isFinite(d) ? 128 + 127 * Math.max(-1, Math.min(1, d / scale)) : 128
}

export function composeSprite(images: Float32Array[], n: number): { width: number; height: number; data: Uint8ClampedArray } {
  const k = images.length
  const width = n * k
  const height = n * 2
  const data = new Uint8ClampedArray(width * height * 4)
  const all: number[] = []
  for (const img of images) for (const v of img) if (Number.isFinite(v)) all.push(v)
  const lo = all.length ? percentile(all, 45) : 0
  const hi = all.length ? percentile(all, 99.6) : 1
  const span = hi > lo ? hi - lo : 1
  const asinh10 = Math.asinh(10)
  const diffs = differenceImages(images)
  const scale = differenceScale(diffs)
  const put = (x: number, y: number, g: number) => {
    const o = (y * width + x) * 4
    data[o] = g
    data[o + 1] = g
    data[o + 2] = g
    data[o + 3] = 255
  }
  for (let i = 0; i < k; i++) {
    const img = images[i] as Float32Array
    const diff = diffs[i] as Float32Array
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const src = (n - 1 - y) * n + x
        const v = img[src] as number
        const t = Number.isFinite(v) ? Math.min(1, Math.max(0, (v - lo) / span)) : 0
        put(i * n + x, y, Number.isFinite(v) ? (255 * Math.asinh(10 * t)) / asinh10 : 0)
        put(i * n + x, n + y, differenceGrey(diff[src] as number, scale))
      }
    }
  }
  return { width, height, data }
}

export type BuildGuard = () => boolean

export interface SpotFrames {
  ra: number
  dec: number
  fov_deg: number
  band: string
  frames: { key: string; mjd: number; wl_um: number; visit: number }[]
}

const rowId = (h: { key: string; mjd: number }) => `${h.key}|${h.mjd}`

async function readExposures(ra: number, dec: number, fovDeg: number, band: string, rows: IndexRow[], visitOf: Map<string, number>, keep?: BuildGuard): Promise<SkyExposure[] | null> {
  const got: SkyExposure[] = []
  await skyMovie({
    ra,
    dec,
    fovDeg,
    indexBase: INDEX_BASE,
    mode: 'bilinear',
    bands: [band],
    hosts: SKY_HOSTS,
    concurrency: 4,
    hits: rows,
    onFrame: (_i, f) => {
      if (keep && !keep()) throw new Error('stopped')
      const lam = Number.isFinite(f.h.lam) ? f.h.lam : (f.h.lam_min + f.h.lam_max) / 2
      got.push({ key: f.h.key, mjd: f.h.mjd, wl_um: Math.round(lam * 1000) / 1000, visit: visitOf.get(rowId(f.h)) ?? 0, img: f.img, variance: f.variance })
    },
  }).catch(() => null)
  return keep && !keep() ? null : got
}

function toDraft(ra: number, dec: number, band: string, usable: SkyExposure[]): SkyCardDraft | null {
  const ids = [...new Set(usable.map((e) => e.visit))].sort((a, b) => a - b)
  if (ids.length < MIN_VISITS) return null
  const exposures = usable.map((e) => ({ ...e, visit: ids.indexOf(e.visit) })).sort((a, b) => a.mjd - b.mjd)
  const panels = ids.map((_, i) => meanImage(exposures.filter((e) => e.visit === i).map((e) => e.img)))
  const n = Math.round(Math.sqrt((panels[0] as Float32Array).length))
  return {
    ra,
    dec,
    band,
    size_px: n,
    frames: exposures.map((e) => ({ key: e.key, mjd: e.mjd, wl_um: e.wl_um, visit: e.visit })),
    exposures,
    pixels: composeSprite(panels, n),
  }
}

export function matchSpotRows(frames: SpotFrames['frames'], hits: IndexRow[]): IndexRow[] | null {
  const byKey = new Map<string, IndexRow>()
  for (const h of hits) if (!byKey.has(h.key)) byKey.set(h.key, h)
  const rows = frames.map((f) => byKey.get(f.key))
  return rows.every((r): r is IndexRow => !!r) ? rows : null
}

export async function buildSkyCard(spot: Spot, tileBytes: number | null = null, keep?: BuildGuard): Promise<SkyCardDraft | null> {
  const q = await pointHits(spot.ra, spot.dec, tileBytes)
  const choice = chooseVisits(q.hits)
  if (!choice || (keep && !keep())) return null
  const visitOf = new Map<string, number>()
  const inTime = [...choice.visits, ...choice.spares].sort((a, b) => midMjd(a) - midMjd(b))
  inTime.forEach((v, i) => v.forEach((h) => visitOf.set(rowId(h), i)))
  const read = async (visits: IndexRow[][]) => {
    const got = await readExposures(spot.ra, spot.dec, SKY_FOV_DEG, choice.band, visits.flat(), visitOf, keep)
    return got ? got.filter((e) => coverage(e.img) >= MIN_COVERAGE) : null
  }
  const usable = await read(choice.visits)
  if (!usable) return null
  const lost = choice.visits.length - new Set(usable.map((e) => e.visit)).size
  if (lost > 0 && choice.spares.length) {
    const extra = await read(choice.spares.slice(0, lost))
    if (!extra) return null
    usable.push(...extra)
  }
  return toDraft(spot.ra, spot.dec, choice.band, usable)
}

export async function buildSpotCard(spot: SpotFrames, tileBytes: number | null = null, keep?: BuildGuard): Promise<SkyCardDraft | null> {
  const q = await pointHits(spot.ra, spot.dec, tileBytes)
  const rows = matchSpotRows(spot.frames, q.hits)
  if (!rows || (keep && !keep())) return null
  const visitOf = new Map<string, number>()
  rows.forEach((h, i) => visitOf.set(rowId(h), (spot.frames[i] as SpotFrames['frames'][number]).visit))
  const got = await readExposures(spot.ra, spot.dec, spot.fov_deg, spot.band, rows, visitOf, keep)
  if (!got || got.length !== rows.length) return null
  return toDraft(spot.ra, spot.dec, spot.band, got)
}
