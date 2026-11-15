import { propagate as propagateJs, skyMovie as skyMovieJs } from './sci/pipeline.js'
import { referenceGrid as referenceGridJs } from './sci/wcs.js'
import { detectAll as detectAllJs, differenceStack as differenceStackJs, hints as hintsJs } from './sci/detect.js'
import { loadCells as loadCellsJs, pick as pickJs } from './web/sampler.js'
import { ang2pixNest as ang2pixNestJs } from './web/sky.js'
import { epochsAtCell as epochsAtCellJs, parseFitsImage as parseFitsImageJs, percentile as percentileJs, stretch as stretchJs } from './web/spherex.js'

export interface IndexRow {
  key: string
  release: string
  band: string
  mjd: number
  lam: number
  dqa: string
  px: number
  py: number
  lam_min: number
  lam_max: number
}

export interface SkyFrame {
  h: IndexRow
  img: Float32Array
  variance: Float32Array
}

export interface SkyMovieOptions {
  ra: number
  dec: number
  target?: { ra: number; dec: number; epoch: number; pmra: number; pmdec: number } | null
  fovDeg: number
  indexBase: string
  maxEpochs?: number
  mode?: 'bilinear' | 'adaptive'
  onFrame?: (i: number, frame: SkyFrame) => void
  concurrency?: number
  bands?: string[] | null
  hosts?: string[]
  pick?: ((hits: IndexRow[]) => IndexRow[]) | null
  fetchImpl?: typeof fetch | null
  hits?: IndexRow[] | null
  cropBase?: string | null
  signal?: AbortSignal | null
  retries?: number
  timeoutMs?: number
}

export interface SkyMovieResult {
  n_available: number
  n_epochs: number
  n_failed: number
  retries: number
  grid_n: number
  passes: number
  timings_ms: Record<string, number>
  gets: number
  bytes: number
}

export interface FitsImage {
  data: Float32Array
  nx: number
  ny: number
  header: Record<string, string>
}

export const skyMovie = skyMovieJs as unknown as (o: SkyMovieOptions) => Promise<SkyMovieResult>
export const parseFitsImage = parseFitsImageJs as unknown as (buf: ArrayBuffer, extname?: string) => FitsImage
export const percentile = percentileJs as unknown as (data: ArrayLike<number>, p: number) => number
export const stretch = stretchJs as unknown as (data: ArrayLike<number>, lo: number, hi: number) => Uint8ClampedArray

export const propagate = propagateJs as unknown as (t: { ra: number; dec: number; epoch: number; pmra: number; pmdec: number }, mjd: number) => [number, number]
export const referenceGrid = referenceGridJs as unknown as (ra: number, dec: number, fovDeg: number) => { n: number; wcs: { world2pix: (ra: number, dec: number) => [number, number]; pix2world: (x: number, y: number) => [number, number] } }

export const ang2pixNest = ang2pixNestJs as unknown as (order: number, ra: number, dec: number) => number
export const epochsAtCell = epochsAtCellJs as unknown as (
  base: string,
  wave: unknown,
  ra: number,
  dec: number,
  opts?: { order?: number; fetchImpl?: typeof fetch; photosOk?: (homes: number[]) => boolean },
) => Promise<{ cell: number; hits: IndexRow[] | null; homes: number[]; bytes: number }>

export interface FlashlightHint {
  kind: 'appeared' | 'missing' | 'flash' | 'residual'
  visit: number
  x: number
  y: number
  snr: number
  n_exp: number
  novelty: number
  score: number
}

export interface SkyCell {
  cell: number
  ra: number
  dec: number
  eclLat: number
  nImages: number
  nPasses: number
  nVisits: number
  mjdMax: number
}

export const differenceStack = differenceStackJs as unknown as (images: Float32Array[], variances: Float32Array[], visits: number[]) => unknown
export const detectAll = detectAllJs as unknown as (stack: unknown, visits: number[], n: number) => unknown[]
export const hints = hintsJs as unknown as (rows: unknown[]) => FlashlightHint[]
export const loadCells = loadCellsJs as unknown as (json: unknown) => SkyCell[]
export const pickCell = pickJs as unknown as (cells: SkyCell[], opts: { looks?: Record<number, number>; nowMjd?: number | null; uniform?: number; minVisits?: number; rnd?: () => number }) => { ra: number; dec: number; cell: number; why: 'uniform' | 'interest' } | null
