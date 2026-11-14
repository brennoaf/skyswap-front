import { asyncBufferFromUrl, parquetMetadataAsync, parquetReadObjects } from 'hyparquet'
import { ang2pixNest, insideQuad, wavelengthAt, world2pix } from './sky.js'

export const S3 = 'https://nasa-irsa-spherex.s3.amazonaws.com/'
export const S3_HOSTS = [S3, 'https://nasa-irsa-spherex.s3.us-east-1.amazonaws.com/',
  'https://s3.us-east-1.amazonaws.com/nasa-irsa-spherex/', 'https://s3.amazonaws.com/nasa-irsa-spherex/']
export const NX = 2040
const COLS = ['key', 'release', 'det', 'band', 'mjd', 'c_ra', 'c_dec', 'lam_min', 'lam_max', 'off_image', 'off_flags', 'flags_rice', 'flags_theap', 'file_size', 'off_var',
  'wcs', 'sip', 'wave_id', 'dqa']

export async function openIndex(base, { order = 5, file, fetchImpl, usePageIndex = false } = {}) {
  const url = base + (file ?? `cells_o${order}_snappy.parquet`)
  const t0 = performance.now()
  const stats = { requests: 0, bytes: 0 }
  const f = countingFetch(fetchImpl ?? globalThis.fetch, stats)
  const buf = await asyncBufferFromUrl({ url, fetch: f })
  const metadata = await parquetMetadataAsync(buf)
  const wave = await f(base + 'wave.json').then(r => r.json())
  return { url, buf, metadata, order, wave, stats, usePageIndex, openMs: performance.now() - t0, fetch: f }
}

export async function epochsAt(idx, ra, dec, { band, t1, t2 } = {}) {
  const t0 = performance.now()
  const req0 = idx.stats.requests, bytes0 = idx.stats.bytes
  const cell = ang2pixNest(idx.order, ra, dec)
  const filter = { cell: { $eq: cell } }
  const rows = await parquetReadObjects({ file: idx.buf, metadata: idx.metadata, columns: COLS, filter, rowFormat: 'object', usePageIndex: idx.usePageIndex })
  const hits = rows.filter(r => insideQuad(ra, dec, Array.from(r.c_ra), Array.from(r.c_dec))
    && (!band || r.band === band) && (t1 == null || r.mjd >= t1) && (t2 == null || r.mjd <= t2))
  for (const h of hits) {
    const [x, y] = world2pix(Array.from(h.wcs), Array.from(h.sip), ra, dec)
    h.px = x; h.py = y
    h.lam = wavelengthAt(idx.wave[h.wave_id], x, y)
  }
  hits.sort((a, b) => a.mjd - b.mjd)
  return { cell, candidates: rows.length, hits, ms: performance.now() - t0,
    requests: idx.stats.requests - req0, bytes: idx.stats.bytes - bytes0 }
}

export async function cutoutS3(h, size, { base = S3, fetchImpl, signal } = {}) {
  const f = fetchImpl ?? globalThis.fetch
  const x0 = Math.round(h.px) - (size >> 1), y0 = Math.round(h.py) - (size >> 1)
  const cy0 = Math.max(0, y0), cy1 = Math.min(NX, y0 + size)
  if (cy1 <= cy0) throw new Error('outside the detector')
  const start = h.off_image + cy0 * NX * 4, len = (cy1 - cy0) * NX * 4
  const r = await f(base + h.key, { headers: { Range: `bytes=${start}-${start + len - 1}` }, signal })
  if (r.status !== 206) throw new Error(`expected 206, got ${r.status}`)
  const dv = new DataView(await r.arrayBuffer())
  const out = new Float32Array(size * size).fill(NaN)
  for (let y = cy0; y < cy1; y++) {
    for (let x = Math.max(0, x0); x < Math.min(NX, x0 + size); x++) {
      out[(y - y0) * size + (x - x0)] = dv.getFloat32(((y - cy0) * NX + x) * 4, false)
    }
  }
  return { data: out, size, bytes: len, source: 's3' }
}

export async function cutout(h, size, opts = {}) {
  const errors = []
  const steps = opts.order ?? ['snapshot', 's3', 'irsa']
  for (const step of steps) {
    const t0 = performance.now()
    try {
      let res
      if (step === 'snapshot' && opts.snapshot) res = await opts.snapshot(h, size)
      else if (step === 's3') res = await withTimeout(cutoutS3(h, size, opts), opts.timeoutMs ?? 8000)
      else if (step === 'irsa' && opts.irsaProxy) res = await withTimeout(opts.irsaProxy(h, size), opts.irsaTimeoutMs ?? 30000)
      if (res) return { ...res, ms: performance.now() - t0, errors }
    } catch (e) {
      errors.push(`${step}: ${e.message}`)
    }
  }
  throw new Error('no source available: ' + errors.join(' | '))
}

function countingFetch(f, stats) {
  return async (url, init) => {
    const r = await f(url, init)
    stats.requests++
    const len = (init?.method === 'HEAD') ? 0 : Number(r.headers.get('content-length') || 0)
    stats.bytes += len
    return r
  }
}

function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout ${ms} ms`)), ms))])
}

export function stretch(data, lo, hi) {
  const out = new Uint8ClampedArray(data.length)
  const k = Math.asinh(10)
  for (let i = 0; i < data.length; i++) {
    const v = data[i]
    if (!Number.isFinite(v)) { out[i] = 0; continue }
    const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo)))
    out[i] = 255 * Math.asinh(10 * t) / k
  }
  return out
}

export function percentile(data, p) {
  const a = Array.from(data).filter(Number.isFinite).sort((x, y) => x - y)
  return a.length ? a[Math.min(a.length - 1, Math.floor(p / 100 * a.length))] : 0
}

export function mjdToIso(mjd) {
  return new Date((mjd - 40587) * 86400000).toISOString().replace('T', ' ').slice(0, 16)
}

export async function epochsAtTile(base, wave, ra, dec, { order = 5, fetchImpl } = {}) {
  const f = fetchImpl ?? globalThis.fetch
  const t0 = performance.now()
  const cell = ang2pixNest(order, ra, dec)
  const r = await f(`${base}tiles/o${order}/${cell}.parquet`)
  if (r.status === 404) return { cell, candidates: 0, hits: [], ms: performance.now() - t0, requests: 1, bytes: 0 }
  if (!r.ok) throw new Error(`tile ${cell}: ${r.status}`)
  const buf = await r.arrayBuffer()
  const rows = await parquetReadObjects({ file: buf, rowFormat: 'object' })
  const hits = finish(rows, wave, ra, dec, {})
  return { cell, candidates: rows.length, hits, ms: performance.now() - t0, requests: 1, bytes: buf.byteLength }
}

function finish(rows, wave, ra, dec, { band, t1, t2 }) {
  for (const r of rows) for (const k in r) {
    const v = r[k]
    if (typeof v === 'bigint') r[k] = Number(v)
    else if (Array.isArray(v) && typeof v[0] === 'bigint') r[k] = v.map(Number)
  }
  const hits = rows.filter(r => insideQuad(ra, dec, Array.from(r.c_ra), Array.from(r.c_dec))
    && (!band || r.band === band) && (t1 == null || r.mjd >= t1) && (t2 == null || r.mjd <= t2))
  for (const h of hits) {
    const [x, y] = world2pix(Array.from(h.wcs), Array.from(h.sip), ra, dec)
    h.px = x; h.py = y
    h.lam = wavelengthAt(wave[h.wave_id], x, y)
  }
  return hits.sort((a, b) => a.mjd - b.mjd)
}

export function parseFitsImage(buffer, extname = 'IMAGE') {
  const u8 = new Uint8Array(buffer), dv = new DataView(buffer)
  let off = 0
  while (off < u8.length) {
    const cards = {}
    let end = -1
    for (let i = off; i + 80 <= u8.length; i += 80) {
      const card = String.fromCharCode(...u8.subarray(i, i + 80))
      const key = card.slice(0, 8).trim()
      if (key === 'END') { end = i; break }
      if (card[8] === '=') cards[key] = card.slice(10).split('/')[0].trim().replace(/^'|'$/g, '').trim()
    }
    if (end < 0) break
    const dataStart = Math.ceil((end + 80) / 2880) * 2880
    const naxis = Number(cards.NAXIS || 0), bitpix = Number(cards.BITPIX)
    let n = naxis ? 1 : 0
    for (let k = 1; k <= naxis; k++) n *= Number(cards[`NAXIS${k}`])
    const nbytes = Math.abs(bitpix) / 8 * (n + Number(cards.PCOUNT || 0))
    if ((cards.EXTNAME || 'PRIMARY') === extname) {
      const nx = Number(cards.NAXIS1), ny = Number(cards.NAXIS2), out = new Float32Array(nx * ny)
      for (let i = 0; i < nx * ny; i++) out[i] = bitpix === -32 ? dv.getFloat32(dataStart + 4 * i, false) : dv.getInt32(dataStart + 4 * i, false)
      return { data: out, nx, ny, header: cards }
    }
    off = dataStart + Math.ceil(nbytes / 2880) * 2880
  }
  throw new Error(`extension ${extname} not found`)
}

export function centerCrop(img, size) {
  const out = new Float32Array(size * size).fill(NaN)
  const x0 = (img.nx - size) >> 1, y0 = (img.ny - size) >> 1
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const sx = x + x0, sy = y + y0
    if (sx >= 0 && sy >= 0 && sx < img.nx && sy < img.ny) out[y * size + x] = img.data[sy * img.nx + sx]
  }
  return out
}
