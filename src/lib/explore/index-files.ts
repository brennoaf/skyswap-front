export const CELL_BASE = '/kit/index/cells/o5/'
export const PHOTO_BASE = '/kit/index/photos/o5/'
const KEEP_CELLS = 4
const KEEP_PHOTOS = 64

export type FileProgress = (loaded: number, total: number | null) => void

const cells = new Map<string, Promise<ArrayBuffer | null>>()
const photos = new Map<string, Promise<ArrayBuffer | null>>()

export function cellUrl(cell: number): string {
  return `${CELL_BASE}${cell}.parquet`
}

export function hasCell(cell: number): boolean {
  return cells.has(cellUrl(cell))
}

export function hasPhotos(home: number): boolean {
  return photos.has(`${PHOTO_BASE}${home}.parquet`)
}

function indexPath(url: string): string | null {
  for (const base of [CELL_BASE, PHOTO_BASE]) {
    const at = url.indexOf(base)
    if (at >= 0) return url.slice(at)
  }
  return null
}

async function download(url: string, onProgress?: (loaded: number) => void): Promise<ArrayBuffer | null> {
  const r = await fetch(url)
  if (r.status === 404) return null
  if (!r.ok) throw new Error(`index ${r.status}`)
  if (!r.body || !onProgress) return r.arrayBuffer()
  const reader = r.body.getReader()
  const parts: Uint8Array[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    parts.push(value)
    loaded += value.length
    onProgress(loaded)
  }
  const out = new Uint8Array(loaded)
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out.buffer
}

export function loadIndexFile(path: string, onProgress?: (loaded: number) => void): Promise<ArrayBuffer | null> {
  const [mem, keep] = path.startsWith(CELL_BASE) ? [cells, KEEP_CELLS] : [photos, KEEP_PHOTOS]
  const hit = mem.get(path)
  if (hit) {
    mem.delete(path)
    mem.set(path, hit)
    return hit
  }
  const p = download(path, onProgress)
  mem.set(path, p)
  p.catch(() => mem.delete(path))
  while (mem.size > keep) {
    const oldest = mem.keys().next().value
    if (oldest === undefined) break
    mem.delete(oldest)
  }
  return p
}

export function indexFetch(onProgress?: FileProgress): typeof fetch {
  const seen = new Map<string, number>()
  const track = (path: string) =>
    onProgress &&
    ((loaded: number) => {
      seen.set(path, loaded)
      let sum = 0
      for (const v of seen.values()) sum += v
      onProgress(sum, null)
    })
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const path = indexPath(url)
    if (!path) return fetch(input, init)
    const buf = await loadIndexFile(path, track(path))
    return buf ? new Response(buf.slice(0)) : new Response(null, { status: 404 })
  }) as typeof fetch
}
