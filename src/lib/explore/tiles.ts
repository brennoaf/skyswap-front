export const TILE_BASE = '/kit/index/tiles/o5/'
const KEEP = 4

export type TileProgress = (loaded: number, total: number | null) => void

const mem = new Map<string, Promise<ArrayBuffer | null>>()

export function tileUrl(cell: number): string {
  return `${TILE_BASE}${cell}.parquet`
}

async function download(url: string, onProgress?: TileProgress): Promise<ArrayBuffer | null> {
  const r = await fetch(url)
  if (r.status === 404) return null
  if (!r.ok) throw new Error(`tile ${r.status}`)
  const total = Number(r.headers.get('content-length')) || null
  if (!r.body || !onProgress) return r.arrayBuffer()
  const reader = r.body.getReader()
  const parts: Uint8Array[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    parts.push(value)
    loaded += value.length
    onProgress(loaded, total)
  }
  const out = new Uint8Array(loaded)
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out.buffer
}

export function loadTile(url: string, onProgress?: TileProgress): Promise<ArrayBuffer | null> {
  const hit = mem.get(url)
  if (hit) {
    mem.delete(url)
    mem.set(url, hit)
    return hit
  }
  const p = download(url, onProgress)
  mem.set(url, p)
  p.catch(() => mem.delete(url))
  while (mem.size > KEEP) {
    const oldest = mem.keys().next().value
    if (oldest === undefined) break
    mem.delete(oldest)
  }
  return p
}

export const tileFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (!url.includes(TILE_BASE)) return fetch(input, init)
  const buf = await loadTile(url.slice(url.indexOf(TILE_BASE)))
  return buf ? new Response(buf.slice(0)) : new Response(null, { status: 404 })
}) as typeof fetch
