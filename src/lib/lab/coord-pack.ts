import { mulberry32Fill as mulberryJs, noiseSigma as noiseSigmaJs } from '@/lib/sky/web/cachefmt.js'
import { INDEX_BASE, loadWave, pointHits } from '@/lib/explore/lookup'
import { indexFetch } from '@/lib/explore/index-files'
import { SKY_CROP } from '@/lib/explore/sky-card'
import { skyMovie, type IndexRow, type SkyFrame } from '@/lib/sky'
import { lambdaAt, makeWcs, type Pack, type PackEpoch, type WaveGrid } from '@/lib/sky/lab'
import { passGroups } from '@/lib/passes'

export const LIGHT_MAX_PHOTOS = 60
export const LIGHT_FOV_DEG = 0.1
const PIXEL_ARCSEC = 6.15
const VAR_EPS = 0.01
const SEED = 12345

const mulberry32Fill = mulberryJs as unknown as (seed: number, n: number) => Float64Array
const noiseSigma = noiseSigmaJs as unknown as (img: Float32Array, nx: number) => number

type Row = IndexRow & { wcs: ArrayLike<number>; sip: ArrayLike<number>; wave_id: number }
type RawFrame = SkyFrame & { h: Row; raw: { img: Float32Array; variance: Float32Array; flags: Int32Array }; box: { x0: number; y0: number; w: number; h: number }; wv: number[] }

export function encodeLabPart(img: Float32Array, variance: Float32Array, flags: Int32Array, ny: number, nx: number): Uint8Array {
  const n = ny * nx
  const sigma = noiseSigma(img, nx)
  const step = Number.isFinite(sigma) && sigma > 0 ? sigma / 8 : 1e-6
  const r = mulberry32Fill(SEED, n)
  const q = new Float64Array(n)
  let lo = Infinity
  for (let k = 0; k < n; k++) {
    const v = img[k] as number
    if (!Number.isFinite(v)) continue
    q[k] = Math.round(v / step + (r[k] as number) - 0.5)
    lo = Math.min(lo, q[k] as number)
  }
  if (!Number.isFinite(lo)) lo = 0
  const image = new Int32Array(n)
  for (let k = 0; k < n; k++) image[k] = Number.isFinite(img[k] as number) ? (q[k] as number) - lo + 1 : 0
  const l = Math.log1p(VAR_EPS)
  const lv = new Float64Array(n)
  let varLo = Infinity
  for (let k = 0; k < n; k++) {
    const v = variance[k] as number
    if (!(v > 0) || !Number.isFinite(v)) continue
    lv[k] = Math.round(Math.log(v) / (2 * l))
    varLo = Math.min(varLo, lv[k] as number)
  }
  if (!Number.isFinite(varLo)) varLo = 0
  const vars = new Int32Array(n)
  for (let k = 0; k < n; k++) {
    const v = variance[k] as number
    vars[k] = v > 0 && Number.isFinite(v) ? (lv[k] as number) - varLo + 1 : 0
  }
  const blocks = [
    { name: 'image', data: image },
    { name: 'variance', data: vars },
    { name: 'flags', data: Int32Array.from(flags) },
  ]
  const head = new TextEncoder().encode(
    JSON.stringify({ ny, nx, step, lo, seed: SEED, var_eps: VAR_EPS, var_lo: varLo, blocks: blocks.map((b) => ({ name: b.name, codec: 'raw', nbytes: b.data.byteLength })) }),
  )
  const out = new Uint8Array(8 + head.length + blocks.reduce((s, b) => s + b.data.byteLength, 0))
  out.set([83, 88, 81, 49])
  new DataView(out.buffer).setUint32(4, head.length, true)
  out.set(head, 8)
  let off = 8 + head.length
  for (const b of blocks) {
    out.set(new Uint8Array(b.data.buffer, b.data.byteOffset, b.data.byteLength), off)
    off += b.data.byteLength
  }
  return out
}

export type LightPack = { pack: Pack; parts: Uint8Array[] }

export async function buildLightPack(opts: {
  ra: number
  dec: number
  band: string
  name: string
  bandCounts: Record<string, number>
  pointBytes: number | null
  signal?: AbortSignal
  onProgress?: (done: number, total: number) => void
}): Promise<LightPack> {
  const { ra, dec, band, signal } = opts
  const size = { point: opts.pointBytes }
  const [wave, found] = await Promise.all([loadWave() as Promise<WaveGrid[]>, pointHits(ra, dec, size)])
  const hits = found.hits.filter((h) => h.band === band)
  const frames: RawFrame[] = []
  const total = Math.min(LIGHT_MAX_PHOTOS, hits.filter((h) => h.dqa === 'Pass').length)
  await skyMovie({
    hits,
    fetchImpl: ((input: RequestInfo | URL, init?: RequestInit) => indexFetch()(input, { ...init, signal })) as typeof fetch,
    ra,
    dec,
    fovDeg: LIGHT_FOV_DEG,
    indexBase: INDEX_BASE,
    maxEpochs: LIGHT_MAX_PHOTOS,
    mode: 'bilinear',
    cropBase: SKY_CROP,
    signal: signal ?? null,
    bands: [band],
    onFrame: (_i, f) => {
      frames.push(f as RawFrame)
      opts.onProgress?.(frames.length, total)
    },
  })
  frames.sort((a, b) => a.h.mjd - b.h.mjd)
  const passes = passGroups(frames.map((f) => f.h.mjd))
  const parts: Uint8Array[] = []
  const epochs: PackEpoch[] = frames.map((f, i) => {
    const sip = Array.from(f.h.sip)
    const wcs = makeWcs({ wcs: f.wv, sip })
    const [tx, ty] = wcs.world2pix(ra, dec)
    const grid = wave[f.h.wave_id] as WaveGrid
    const shifted: WaveGrid = { ...grid, x: grid.x.map((v) => v - f.box.x0), y: grid.y.map((v) => v - f.box.y0) }
    parts.push(encodeLabPart(f.raw.img, f.raw.variance, f.raw.flags, f.box.h, f.box.w))
    return {
      band: f.h.band,
      index: i,
      key: f.h.key,
      release: f.h.release,
      mjd: f.h.mjd,
      iso: new Date((f.h.mjd - 40587) * 86400000).toISOString(),
      pass_index: Math.max(0, passes.filter((p) => p <= i).length - 1),
      nx: f.box.w,
      ny: f.box.h,
      wcs: f.wv,
      sip,
      wave: shifted,
      target_radec: [ra, dec],
      target_xy: [tx, ty],
      lam_um: lambdaAt(shifted, tx, ty) ?? f.h.lam,
      dlam_um: f.h.lam_max - f.h.lam_min,
      inside: tx >= 0 && ty >= 0 && tx < f.box.w && ty < f.box.h,
    }
  })
  const bands = Object.fromEntries(Object.entries(opts.bandCounts).filter(([, n]) => n > 0).map(([b, n]) => [b, { file: '', n, bytes: 0 }]))
  return {
    pack: {
      object_id: 'point',
      name: opts.name,
      field: { ra, dec, fov_deg: LIGHT_FOV_DEG, pixel_scale_arcsec: PIXEL_ARCSEC, tracking: 'fixed' },
      n_epochs: epochs.length,
      n_passes: passes.length,
      bands,
      epochs,
    },
    parts,
  }
}

