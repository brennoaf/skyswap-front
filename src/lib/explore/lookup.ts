import { apiFetch } from '@/lib/api/client'
import { ang2pixNest, epochsAtTile, type IndexRow } from '@/lib/sky'
import { hasTile, loadTile, tileFetch, tileUrl, type TileProgress } from './tiles'

export const INDEX_BASE = '/kit/index/'
export const BIG_TILE_BYTES = 2 * 1024 * 1024
export const SERVER_MAX_ROWS = 400

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

export function askServer(cell: number, tileBytes: number | null | undefined): boolean {
  return (tileBytes ?? 0) > BIG_TILE_BYTES && !hasTile(cell)
}

export async function serverHits(ra: number, dec: number, max = SERVER_MAX_ROWS): Promise<{ hits: IndexRow[]; total: number }> {
  const q = new URLSearchParams({ ra: String(ra), dec: String(dec), max: String(max) })
  const r = await apiFetch(`/api/index/at?${q}`)
  if (!r.ok) throw new Error(`lookup ${r.status}`)
  const body = (await r.json()) as { rows: IndexRow[]; total: number }
  return { hits: body.rows, total: body.total }
}

export async function pointHits(ra: number, dec: number, tileBytes: number | null | undefined, onProgress?: TileProgress): Promise<{ hits: IndexRow[]; source: 'server' | 'tile' }> {
  const cell = ang2pixNest(5, ra, dec)
  if (askServer(cell, tileBytes)) return { hits: (await serverHits(ra, dec)).hits, source: 'server' }
  const [wave] = await Promise.all([loadWave(), loadTile(tileUrl(cell), onProgress)])
  const q = await epochsAtTile(INDEX_BASE, wave, ra, dec, { order: 5, fetchImpl: tileFetch })
  return { hits: q.hits, source: 'tile' }
}

export function warmSpot(ra: number, dec: number, tileBytes: number | null | undefined): void {
  const cell = ang2pixNest(5, ra, dec)
  if (askServer(cell, tileBytes)) serverHits(ra, dec).catch(() => null)
  else loadTile(tileUrl(cell)).catch(() => null)
}
