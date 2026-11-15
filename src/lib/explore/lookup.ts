import { apiFetch } from '@/lib/api/client'
import { ang2pixNest, epochsAtCell, type IndexRow } from '@/lib/sky'
import { cellUrl, hasCell, hasPhotos, indexFetch, type FileProgress } from './index-files'

export const INDEX_BASE = '/kit/index/'
export const BIG_POINT_BYTES = 2 * 1024 * 1024
export const SERVER_MAX_ROWS = 400

export type PointSize = { point: number | null } | { cell: number | null; photos: ReadonlyMap<number, number> }

let wavePromise: Promise<unknown> | null = null

export function loadWave(): Promise<unknown> {
  wavePromise ??= fetch(`${INDEX_BASE}wave.json`).then((r) => {
    if (!r.ok) throw new Error(`wave ${r.status}`)
    return r.json()
  })
  wavePromise.catch(() => {
    wavePromise = null
  })
  return wavePromise
}

export function askServer(cell: number, size: PointSize): boolean {
  return (('point' in size ? size.point : size.cell) ?? 0) > BIG_POINT_BYTES && !hasCell(cell)
}

function photosFit(size: PointSize): ((homes: number[]) => boolean) | undefined {
  if ('point' in size) return undefined
  return (homes) => homes.reduce((a, h) => a + (hasPhotos(h) ? 0 : (size.photos.get(h) ?? 0)), size.cell ?? 0) <= BIG_POINT_BYTES
}

export async function serverHits(ra: number, dec: number, max = SERVER_MAX_ROWS): Promise<{ hits: IndexRow[]; total: number }> {
  const q = new URLSearchParams({ ra: String(ra), dec: String(dec), max: String(max) })
  const r = await apiFetch(`/api/index/at?${q}`)
  if (!r.ok) throw new Error(`lookup ${r.status}`)
  const body = (await r.json()) as { rows: IndexRow[]; total: number }
  return { hits: body.rows, total: body.total }
}

export async function pointHits(ra: number, dec: number, size: PointSize, onProgress?: FileProgress): Promise<{ hits: IndexRow[]; source: 'server' | 'files' }> {
  const cell = ang2pixNest(5, ra, dec)
  if (askServer(cell, size)) return { hits: (await serverHits(ra, dec)).hits, source: 'server' }
  const fetchImpl = indexFetch(onProgress)
  const [wave] = await Promise.all([loadWave(), fetchImpl(cellUrl(cell))])
  const q = await epochsAtCell(INDEX_BASE, wave, ra, dec, { order: 5, fetchImpl, photosOk: photosFit(size) })
  if (!q.hits) return { hits: (await serverHits(ra, dec)).hits, source: 'server' }
  return { hits: q.hits, source: 'files' }
}

export function warmSpot(ra: number, dec: number, size: PointSize): void {
  pointHits(ra, dec, size).catch(() => null)
}
