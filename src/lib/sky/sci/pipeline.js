import { epochsAtTile, S3_HOSTS } from '../web/spherex.js'
import { makeWcs, referenceGrid, coordMap } from './wcs.js'
import { bilinear, adaptive } from './reproject.js'
import { background } from './background.js'
import { coadd, difference, assignPasses } from './stack.js'
import { measureStar, centroid2dg, properMotion, MASK_VALUE } from './phot.js'
import { riceDecodeRows } from '../web/rice.js'

const NX = 2040

export function propagate(t, mjd) {
  if (!t.pmra && !t.pmdec) return [t.ra, t.dec]
  const dt = 2000 + (mjd - 51544.5) / 365.25 - t.epoch
  return [t.ra + t.pmra / 3.6e6 * dt / Math.cos(t.dec * Math.PI / 180), t.dec + t.pmdec / 3.6e6 * dt]
}

function pickEpochs(hits, maxEpochs) {
  if (hits.length <= maxEpochs) return hits
  const passes = assignPasses(hits.map(h => h.mjd)), np = Math.max(...passes) + 1, per = Math.ceil(maxEpochs / np), out = []
  for (let p = 0; p < np; p++) {
    const byBand = {}
    hits.filter((h, i) => passes[i] === p).forEach(h => (byBand[h.band] ??= []).push(h))
    const picked = []
    while (picked.length < per && Object.values(byBand).some(l => l.length)) {
      for (const b of Object.keys(byBand).sort()) if (byBand[b].length && picked.length < per) picked.push(byBand[b].splice(byBand[b].length >> 1, 1)[0])
    }
    out.push(...picked)
  }
  return out.sort((a, b) => a.mjd - b.mjd).slice(0, maxEpochs)
}

async function getRange(url, start, len, stats) {
  const r = await fetch(url, { headers: { Range: `bytes=${start}-${start + len - 1}` }, cache: 'no-store' })
  if (r.status !== 206) throw new Error(`expected 206, got ${r.status}`)
  const b = new Uint8Array(await r.arrayBuffer())
  stats.gets++; stats.bytes += b.length
  return b
}

function cropBE(u8, rows, x0, w, kind) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), out = kind === 'i32' ? new Int32Array(rows * w) : new Float32Array(rows * w)
  for (let y = 0; y < rows; y++) for (let x = 0; x < w; x++) {
    const o = (y * NX + x0 + x) * 4
    out[y * w + x] = kind === 'i32' ? dv.getInt32(o, false) : dv.getFloat32(o, false)
  }
  return out
}

function boxFor(h, grid, n, margin = 10) {
  const w = makeWcs({ wcs: Array.from(h.wcs), sip: Array.from(h.sip) })
  const xs = [], ys = []
  for (const [i, j] of [[0, 0], [n - 1, 0], [0, n - 1], [n - 1, n - 1], [(n - 1) / 2, (n - 1) / 2]]) { const [ra, de] = grid.pix2world(i, j); const [x, y] = w.world2pix(ra, de); xs.push(x); ys.push(y) }
  const x0 = Math.max(0, Math.floor(Math.min(...xs)) - margin), x1 = Math.min(NX, Math.ceil(Math.max(...xs)) + margin + 1)
  const y0 = Math.max(0, Math.floor(Math.min(...ys)) - margin), y1 = Math.min(NX, Math.ceil(Math.max(...ys)) + margin + 1)
  return x1 - x0 < 8 || y1 - y0 < 8 ? null : { x0, y0, w: x1 - x0, h: y1 - y0, wcsFull: w }
}

async function fetchEpoch(h, box, host, stats) {
  const url = host + h.key, rowBytes = NX * 4, { y0, h: rows, x0, w } = box
  const jobs = [getRange(url, h.off_image + y0 * rowBytes, rows * rowBytes, stats), getRange(url, h.off_var + y0 * rowBytes, rows * rowBytes, stats)]
  let flagsP
  if (!h.flags_rice) flagsP = getRange(url, h.off_flags + y0 * rowBytes, rows * rowBytes, stats).then(b => cropBE(b, rows, x0, w, 'i32'))
  else {
    const heap = h.off_flags + h.flags_theap
    if (h.flags_ckpt) {
      const K = 32, c0 = Math.floor(y0 / K), c1 = Math.ceil((y0 + rows) / K), ck = Array.from(h.flags_ckpt)
      const a = ck[c0], b = c1 < ck.length ? ck[c1] : h.flags_heap_end
      flagsP = getRange(url, heap + a, b - a, stats).then(span => {
        const all = riceDecodeRows(span, Math.min(c1 * K, NX) - c0 * K, NX).data
        return cropRows(all.subarray((y0 - c0 * K) * NX, (y0 - c0 * K + rows) * NX), rows, x0, w)
      })
    } else {
      flagsP = getRange(url, h.off_flags + y0 * 8, rows * 8, stats).then(async desc => {
        const dv = new DataView(desc.buffer, desc.byteOffset, desc.byteLength)
        const o0 = dv.getInt32(4, false), last = dv.getInt32((rows - 1) * 8 + 4, false) + dv.getInt32((rows - 1) * 8, false)
        const span = await getRange(url, heap + o0, last - o0, stats)
        return cropRows(riceDecodeRows(span, rows, NX).data, rows, x0, w)
      })
    }
  }
  const [im, va, flags] = await Promise.all([...jobs, flagsP])
  return { img: cropBE(im, rows, x0, w, 'f32'), variance: cropBE(va, rows, x0, w, 'f32'), flags }
}

function cropRows(full, rows, x0, w) {
  const out = new Int32Array(rows * w)
  for (let y = 0; y < rows; y++) out.set(full.subarray(y * NX + x0, y * NX + x0 + w), y * w)
  return out
}

export async function skyMovie({ ra, dec, target = null, fovDeg = 0.1, indexBase, maxEpochs = 48, mode = 'bilinear',
  engine = null, onFrame = null, concurrency = 12, hosts = S3_HOSTS, bands = null, pick = null, fetchImpl = null, hits: given = null } = {}) {
  const T0 = performance.now(), stats = { gets: 0, bytes: 0 }, tm = {}
  const wave = await fetch(indexBase + 'wave.json').then(r => r.json())
  const q = given ? { hits: given, bytes: 0, candidates: given.length } : await epochsAtTile(indexBase, wave, ra, dec, { order: 5, fetchImpl })
  tm.index_ms = performance.now() - T0
  let hits = q.hits.filter(h => h.dqa === 'Pass' && (!bands || bands.includes(h.band)))
  const nAvailable = hits.length
  hits = pick ? pick(hits) : pickEpochs(hits, maxEpochs)
  const { n, wcs: grid } = referenceGrid(ra, dec, fovDeg)
  const frames = new Array(hits.length)
  let next = 0, firstFrame = null
  const worker = async (wi) => {
    while (next < hits.length) {
      const i = next++, h = hits[i]
      const box = boxFor(h, grid, n)
      if (!box) continue
      const host = hosts[(i + wi) % hosts.length]
      const raw = await fetchEpoch(h, box, host, stats)
      const bad = new Uint8Array(raw.img.length)
      for (let k = 0; k < bad.length; k++) bad[k] = ((raw.flags[k] & MASK_VALUE) !== 0 || !Number.isFinite(raw.img[k]) || !Number.isFinite(raw.variance[k])) ? 1 : 0
      const bkg = background(raw.img, bad, box.w, box.h)
      const sub = new Float32Array(raw.img.length), svar = new Float32Array(raw.img.length)
      for (let k = 0; k < sub.length; k++) { sub[k] = bad[k] ? NaN : raw.img[k] - bkg[k]; svar[k] = bad[k] ? NaN : raw.variance[k] }
      const wv = Array.from(h.wcs); wv[0] -= box.x0; wv[1] -= box.y0
      const sw = makeWcs({ wcs: wv, sip: Array.from(h.sip) })
      let a, v
      if (mode === 'adaptive') {
        const mp = engine?.coordMap ? engine.coordMap([(n + 1) / 2, (n + 1) / 2, ra, dec, -6.15 / 3600, 0, 0, 6.15 / 3600], n, 1, wv, Array.from(h.sip)) : coordMap(grid, n, sw, { pad: 1 })
        a = (engine?.adaptive ?? adaptive)(sub, box.w, box.h, mp, n, { conserveFlux: true }); v = (engine?.adaptive ?? adaptive)(svar, box.w, box.h, mp, n, { conserveFlux: true })
      } else {
        const mp = coordMap(grid, n, sw)
        a = bilinear(sub, box.w, box.h, mp, n); v = bilinear(svar, box.w, box.h, mp, n)
      }
      if (a instanceof Promise) { a = await a; v = await v }
      for (let k = 0; k < a.length; k++) if (!Number.isFinite(a[k]) || !Number.isFinite(v[k])) { a[k] = NaN; v[k] = NaN }
      frames[i] = { h, img: a, variance: v, raw, box, wv }
      if (firstFrame === null) { firstFrame = performance.now() - T0; tm.first_frame_ms = firstFrame }
      onFrame?.(i, frames[i])
    }
  }
  await Promise.all(Array.from({ length: concurrency }, (_, wi) => worker(wi)))
  tm.all_frames_ms = performance.now() - T0
  const T1 = performance.now()
  const ok = frames.filter(Boolean), passes = assignPasses(ok.map(f => f.h.mjd)), bandSet = [...new Set(ok.map(f => f.h.band))].sort()
  const co = {}
  for (const p of [...new Set(passes)]) for (const b of [...bandSet, 'white']) {
    const sel = ok.filter((f, i) => passes[i] === p && (b === 'white' || f.h.band === b))
    if (sel.length) co[`p${p}_${b}`] = { ...coadd(sel.map(f => f.img), sel.map(f => f.variance)), n: sel.length, mjd: sel.reduce((s, f) => s + f.h.mjd, 0) / sel.length }
  }
  const ps = [...new Set(passes)].sort((x, y) => x - y), diffs = {}
  for (const b of [...bandSet, 'white']) for (let i = 0; i + 1 < ps.length; i++) {
    const A = co[`p${ps[i]}_${b}`], B = co[`p${ps[i + 1]}_${b}`]
    if (A && B) diffs[`p${ps[i]}p${ps[i + 1]}_${b}`] = difference(A.img, B.img)
  }
  const spectrum = []
  for (const f of ok) {
    const [tra, tdec] = target ? propagate(target, f.h.mjd) : [ra, dec]
    const m = measureStar(f.raw.img, f.raw.variance, f.raw.flags, f.box.w, f.box.h, makeWcs({ wcs: f.wv, sip: Array.from(f.h.sip) }), tra, tdec,
      { ...wave[f.h.wave_id], x: wave[f.h.wave_id].x.map(v => v - f.box.x0), y: wave[f.h.wave_id].y.map(v => v - f.box.y0) })
    if (m && !m.rejected) spectrum.push({ mjd: f.h.mjd, band: f.h.band, lam: m.wavelength_um, flux_mjy: m.flux_mjy, err_mjy: m.err_mjy })
  }
  const [sra, sdec] = target ? propagate(target, co[`p${ps[0]}_white`]?.mjd ?? ok[0].h.mjd) : [ra, dec]
  const [gx, gy] = grid.world2pix(sra, sdec), sx = Math.round(gx), sy = Math.round(gy), pos = []
  for (const p of ps) {
    const c = co[`p${p}_white`]
    if (!c || sx < 3 || sy < 3 || sx > n - 4 || sy > n - 4) continue
    const box = new Float64Array(49)
    let nanNear = 0
    for (let j = 0; j < 7; j++) for (let i = 0; i < 7; i++) { const v = c.img[(sy - 3 + j) * n + (sx - 3 + i)]; box[j * 7 + i] = v; if (!Number.isFinite(v) && Math.abs(i - 3) <= 1 && Math.abs(j - 3) <= 1) nanNear++ }
    const fin = Array.from(box).filter(Number.isFinite).sort((x, y) => x - y)
    if (fin.length < 10) continue
    const med = fin[fin.length >> 1]
    const [dx, dy] = centroid2dg(box.map(v => Number.isFinite(v) ? v - med : 0), 7, 7)
    const [pra, pdec] = grid.pix2world(sx - 3 + dx, sy - 3 + dy)
    const snr = (c.img[sy * n + sx] - med) / Math.sqrt(c.variance[sy * n + sx])
    pos.push({ pass: p, mjd: c.mjd, ra: pra, dec: pdec, snr, nanNear, moved_px: Math.hypot(dx - 3, dy - 3) })
  }
  const pm = properMotion(pos)
  const valid = pos.length >= 2 && pos.every(q => q.nanNear === 0 && q.moved_px < 1.5 && q.snr >= 10)
  tm.science_ms = performance.now() - T1
  tm.total_ms = performance.now() - T0
  return { n_available: nAvailable, n_epochs: ok.length, grid_n: n, passes: ps.length, coadds: Object.keys(co).length, diffs: Object.keys(diffs).length,
    spectrum, pm: pm ? { ...pm, valid, positions: pos } : null, timings_ms: Object.fromEntries(Object.entries(tm).map(([k, v]) => [k, Math.round(v)])), gets: stats.gets, bytes: stats.bytes,
    index: { tile_bytes: q.bytes, candidates: q.candidates, hits: q.hits.length } }
}
