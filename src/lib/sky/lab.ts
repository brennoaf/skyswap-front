import { decodeSxq as decodeSxqJs, unpack as unpackJs } from './web/cachefmt.js'
import { makeWcs as makeWcsJs } from './sci/wcs.js'
import { measureStar as measureStarJs } from './sci/phot.js'

export interface WaveGrid {
  x: number[]
  y: number[]
  lam: number[]
  nx?: number
  ny?: number
}

export interface PackEpoch {
  band: string
  index: number
  key: string
  release: string
  mjd: number
  iso: string
  pass_index: number
  nx: number
  ny: number
  wcs: number[]
  sip: number[] | null
  wave: WaveGrid
  target_radec: [number, number]
  target_xy: [number, number]
  lam_um: number
  dlam_um: number
  inside: boolean
}

export interface Pack {
  object_id: string
  name: string
  field: { ra: number | null; dec: number | null; fov_deg: number; pixel_scale_arcsec: number; tracking?: string }
  n_epochs: number
  n_passes: number
  bands: Record<string, { file: string; n: number; bytes: number }>
  epochs: PackEpoch[]
}

export interface Decoded {
  image: Float32Array
  flags: Int32Array
  variance: Float32Array
}

export interface Wcs {
  pix2world: (x: number, y: number) => [number, number]
  world2pix: (ra: number, dec: number) => [number, number]
}

export interface StarMeasurement {
  x: number
  y: number
  flux_mjy: number
  err_mjy: number
  wavelength_um: number
  rejected: boolean
}

export const unpack = unpackJs as unknown as (buf: ArrayBuffer) => Uint8Array[]
export const decodeSxq = decodeSxqJs as unknown as (buf: Uint8Array) => Promise<Decoded>
export const makeWcs = makeWcsJs as unknown as (o: { wcs: number[]; sip: number[] | null }) => Wcs
export const measureStar = measureStarJs as unknown as (
  img: Float32Array,
  variance: Float32Array,
  flags: Int32Array,
  w: number,
  h: number,
  wcs: Wcs,
  ra: number,
  dec: number,
  wave: WaveGrid,
) => StarMeasurement | null

export function lambdaAt(grid: WaveGrid, x: number, y: number): number | null {
  const gx = grid.x
  const gy = grid.y
  const nx = gx.length
  if (gx.length < 2 || gy.length < 2) return null
  const X = x + 1
  const Y = y + 1
  const idx = (g: number[], v: number) => {
    let i = 0
    while (i < g.length - 2 && (g[i + 1] as number) <= v) i++
    return i
  }
  const i = idx(gx, X)
  const j = idx(gy, Y)
  const tx = (X - (gx[i] as number)) / ((gx[i + 1] as number) - (gx[i] as number))
  const ty = (Y - (gy[j] as number)) / ((gy[j + 1] as number) - (gy[j] as number))
  const L = (jj: number, ii: number) => grid.lam[jj * nx + ii] as number
  return L(j, i) * (1 - tx) * (1 - ty) + L(j, i + 1) * tx * (1 - ty) + L(j + 1, i) * (1 - tx) * ty + L(j + 1, i + 1) * tx * ty
}

export const FLAG_BITS: Record<number, string> = {
  0: 'TRANSIENT',
  1: 'OVERFLOW',
  2: 'SUR_ERROR',
  6: 'NONFUNC',
  7: 'DICHROIC',
  9: 'MISSING_DATA',
  10: 'HOT',
  11: 'COLD',
  12: 'FULLSAMPLE',
  14: 'PHANMISS',
  15: 'NONLINEAR',
  17: 'PERSIST',
  19: 'OUTLIER',
  20: 'CROSSTALK',
  21: 'SOURCE',
  22: 'GHOST',
  23: 'GHOST_FPA',
  24: 'GHOST_EXT',
  25: 'STREAK',
  26: 'BLOOM',
  27: 'SNOWBALL',
  28: 'HALO',
  29: 'SATELLITE_HALO',
}

const mask = (bits: number[]) => bits.reduce((m, b) => m | (1 << b), 0)

export const FLAG_LAYERS = {
  saturation: mask([1, 15, 26]),
  cosmic: mask([0, 27, 28]),
  persistence: mask([17]),
  satellite: mask([25, 29]),
} as const

export function flagNames(v: number): string[] {
  return Object.entries(FLAG_BITS)
    .filter(([b]) => (v >>> Number(b)) & 1)
    .map(([, n]) => n)
}

export function percentileOf(values: Float32Array, p: number): number {
  const finite = Array.from(values).filter(Number.isFinite).sort((a, b) => a - b)
  if (!finite.length) return 0
  return finite[Math.min(finite.length - 1, Math.max(0, Math.round((p / 100) * (finite.length - 1))))] as number
}
