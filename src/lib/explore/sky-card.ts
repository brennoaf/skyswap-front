import { epochsAtTile, percentile, skyMovie, type IndexRow } from '@/lib/sky'
import type { Spot } from './sampler'
import { tileFetch } from './tiles'

export const INDEX_BASE = '/kit/index/'
export const SKY_HOSTS = ['/api/s3/']
export const SKY_FOV_DEG = 0.105
export const MAX_VISITS = 3
export const EXP_PER_VISIT = 2
export const VISIT_GAP_DAYS = 30 / 1440
export const MIN_COVERAGE = 0.9

export interface SkyPick {
  band: string
  visits: IndexRow[][]
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

export function chooseVisits(hits: IndexRow[], maxVisits = MAX_VISITS, perVisit = EXP_PER_VISIT): SkyPick | null {
  const byBand = new Map<string, IndexRow[]>()
  for (const h of hits) {
    if (h.dqa !== 'Pass' || !Number.isFinite(h.mjd)) continue
    byBand.set(h.band, [...(byBand.get(h.band) ?? []), h])
  }
  let best: (SkyPick & { score: number }) | null = null
  for (const [band, list] of [...byBand.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const visits = groupVisits(list)
    if (visits.length < 2) continue
    const first = visits[0] as IndexRow[]
    const last = visits[visits.length - 1] as IndexRow[]
    const chosen = [first]
    for (let k = 1; k < maxVisits - 1; k++) {
      const target = midMjd(first) + ((midMjd(last) - midMjd(first)) * k) / (maxVisits - 1)
      const near = visits.filter((v) => v !== last && !chosen.includes(v)).sort((a, b) => Math.abs(midMjd(a) - target) - Math.abs(midMjd(b) - target))[0]
      if (near) chosen.push(near)
    }
    chosen.push(last)
    chosen.sort((a, b) => midMjd(a) - midMjd(b))
    const picked = chosen.map((v) => v.slice(0, perVisit))
    const exposures = picked.reduce((a, v) => a + v.length, 0)
    const score = picked.length * 1000 + exposures * 10 + (midMjd(last) - midMjd(first))
    if (!best || score > best.score) best = { band, visits: picked, score }
  }
  return best ? { band: best.band, visits: best.visits } : null
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

function robustScale(values: number[]): number {
  if (!values.length) return 1
  const sorted = [...values].sort((a, b) => a - b)
  const med = sorted[sorted.length >> 1] as number
  const dev = values.map((v) => Math.abs(v - med)).sort((a, b) => a - b)
  return Math.max(1e-6, 1.4826 * (dev[dev.length >> 1] as number))
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
  const diffs = images.map((img, i) => {
    const out = new Float32Array(n * n)
    for (let p = 0; p < n * n; p++) {
      let sum = 0
      let cnt = 0
      for (let j = 0; j < k; j++) {
        if (j === i) continue
        const v = (images[j] as Float32Array)[p] as number
        if (Number.isFinite(v)) {
          sum += v
          cnt++
        }
      }
      const v = img[p] as number
      out[p] = cnt && Number.isFinite(v) ? v - sum / cnt : NaN
    }
    return out
  })
  const diffValues: number[] = []
  for (const d of diffs) for (let p = 0; p < d.length; p += 3) if (Number.isFinite(d[p])) diffValues.push(d[p] as number)
  const scale = 6 * robustScale(diffValues)
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
        const d = diff[src] as number
        put(i * n + x, n + y, Number.isFinite(d) ? 128 + 127 * Math.max(-1, Math.min(1, d / scale)) : 128)
      }
    }
  }
  return { width, height, data }
}

let wavePromise: Promise<unknown> | null = null

function loadWave(): Promise<unknown> {
  wavePromise ??= fetch(`${INDEX_BASE}wave.json`).then((r) => {
    if (!r.ok) throw new Error(`wave ${r.status}`)
    return r.json()
  })
  wavePromise.catch(() => {
    wavePromise = null
  })
  return wavePromise
}

export async function buildSkyCard(spot: Spot): Promise<SkyCardDraft | null> {
  const wave = await loadWave()
  const q = await epochsAtTile(INDEX_BASE, wave, spot.ra, spot.dec, { order: 5, fetchImpl: tileFetch })
  const choice = chooseVisits(q.hits)
  if (!choice) return null
  const visitOf = new Map<string, number>()
  choice.visits.forEach((v, i) => v.forEach((h) => visitOf.set(`${h.key}|${h.mjd}`, i)))
  const got: SkyExposure[] = []
  await skyMovie({
    ra: spot.ra,
    dec: spot.dec,
    fovDeg: SKY_FOV_DEG,
    indexBase: INDEX_BASE,
    mode: 'bilinear',
    bands: [choice.band],
    hosts: SKY_HOSTS,
    fetchImpl: tileFetch,
    concurrency: 4,
    pick: (hits) => hits.filter((h) => visitOf.has(`${h.key}|${h.mjd}`)),
    onFrame: (_i, f) => {
      const lam = Number.isFinite(f.h.lam) ? f.h.lam : (f.h.lam_min + f.h.lam_max) / 2
      got.push({ key: f.h.key, mjd: f.h.mjd, wl_um: Math.round(lam * 1000) / 1000, visit: visitOf.get(`${f.h.key}|${f.h.mjd}`) ?? 0, img: f.img, variance: f.variance })
    },
  }).catch(() => null)
  const usable = got.filter((e) => coverage(e.img) >= MIN_COVERAGE)
  const ids = [...new Set(usable.map((e) => e.visit))].sort((a, b) => a - b)
  if (ids.length < 2) return null
  const exposures = usable.map((e) => ({ ...e, visit: ids.indexOf(e.visit) })).sort((a, b) => a.mjd - b.mjd)
  const panels = ids.map((_, i) => meanImage(exposures.filter((e) => e.visit === i).map((e) => e.img)))
  const n = Math.round(Math.sqrt((panels[0] as Float32Array).length))
  return {
    ra: spot.ra,
    dec: spot.dec,
    band: choice.band,
    size_px: n,
    frames: exposures.map((e) => ({ key: e.key, mjd: e.mjd, wl_um: e.wl_um, visit: e.visit })),
    exposures,
    pixels: composeSprite(panels, n),
  }
}
