import { skyMovie as skyMovieJs } from './sci/pipeline.js'
import { parseFitsImage as parseFitsImageJs, percentile as percentileJs, stretch as stretchJs } from './web/spherex.js'

export interface IndexRow {
  key: string
  release: string
  band: string
  mjd: number
  lam: number
  dqa: string
  px: number
  py: number
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
}

export interface SkyMovieResult {
  n_available: number
  n_epochs: number
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
