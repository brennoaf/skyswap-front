import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeWcs, referenceGrid, coordMap } from '../../src/lib/sky/sci/wcs.js'
import { bilinear, adaptive } from '../../src/lib/sky/sci/reproject.js'
import { measureStar } from '../../src/lib/sky/sci/phot.js'

const here = dirname(fileURLToPath(import.meta.url))
const arch = resolve(process.argv[2] ?? join(here, '../../../../nasa2026/data/arch'))
const bundle = join(arch, 'r3/bundles/eps_ind_b_fov0.1')
const out = join(here, 'fixtures')
mkdirSync(out, { recursive: true })

const f32 = p => new Float32Array(readFileSync(join(bundle, p)).buffer.slice(0))
const i32 = p => new Int32Array(readFileSync(join(bundle, p)).buffer.slice(0))
const man = JSON.parse(readFileSync(join(bundle, 'manifest.json'), 'utf8'))
const ref = JSON.parse(readFileSync(join(bundle, 'ref/ref.json'), 'utf8'))
const sha = a => createHash('sha256').update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)).digest('hex')

class Blob {
  constructor() { this.parts = []; this.size = 0; this.index = {} }
  add(key, arr) {
    const dtype = arr instanceof Float32Array ? 'f4' : arr instanceof Int32Array ? 'i4' : 'u1'
    this.index[key] = [this.size, arr.length, dtype]
    const b = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength)
    this.parts.push(b); this.size += b.length
  }
  write(name) { writeFileSync(join(out, name), Buffer.concat(this.parts)); return this.size }
}

function crop(a, w, x0, y0, cw, ch) {
  const o = new a.constructor(cw * ch)
  for (let y = 0; y < ch; y++) o.set(a.subarray((y0 + y) * w + x0, (y0 + y) * w + x0 + cw), y * cw)
  return o
}
const shiftWcs = (wcs, x0, y0) => { const w = wcs.slice(); w[0] -= x0; w[1] -= y0; return w }
const shiftWave = (wave, x0, y0) => ({ ...wave, x: wave.x.map(v => v - x0), y: wave.y.map(v => v - y0) })

function sameMaps(a, b) {
  let worst = 0
  for (let k = 0; k < a.length; k++) {
    if (Number.isFinite(a[k]) !== Number.isFinite(b[k])) return Infinity
    if (Number.isFinite(a[k])) worst = Math.max(worst, Math.abs(a[k] - b[k]) / Math.max(1e-30, Math.abs(a[k])))
  }
  return worst
}

const { n, wcs: grid } = referenceGrid(man.ra, man.dec, man.fov_deg)
const rep = new Blob(), repMeta = []
for (const e of man.exposures.slice(0, 2)) {
  const full = makeWcs({ wcs: e.wcs, sip: e.sip }), mp = coordMap(grid, n, full, { pad: 1 })
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity
  for (let k = 0; k < mp.length; k += 2) {
    if (!Number.isFinite(mp[k]) || !Number.isFinite(mp[k + 1])) continue
    xmin = Math.min(xmin, mp[k]); xmax = Math.max(xmax, mp[k]); ymin = Math.min(ymin, mp[k + 1]); ymax = Math.max(ymax, mp[k + 1])
  }
  const M = 8
  const x0 = Math.max(0, Math.floor(xmin) - M), y0 = Math.max(0, Math.floor(ymin) - M)
  const x1 = Math.min(e.nx, Math.ceil(xmax) + M + 1), y1 = Math.min(e.ny, Math.ceil(ymax) + M + 1)
  const cw = x1 - x0, ch = y1 - y0
  const src = f32(`ref/${e.stem}.native_bgsub`), sv = f32(`ref/${e.stem}.native_var`)
  const csrc = crop(src, e.nx, x0, y0, cw, ch), csv = crop(sv, e.nx, x0, y0, cw, ch)
  const cw_ = makeWcs({ wcs: shiftWcs(e.wcs, x0, y0), sip: e.sip })
  for (const [name, fn] of [['bilinear', (s, w, h, W) => bilinear(s, w, h, coordMap(grid, n, W), n)],
    ['adaptive', (s, w, h, W) => adaptive(s, w, h, coordMap(grid, n, W, { pad: 1 }), n, { conserveFlux: true })]]) {
    const d = Math.max(sameMaps(fn(src, e.nx, e.ny, full), fn(csrc, cw, ch, cw_)), sameMaps(fn(sv, e.nx, e.ny, full), fn(csv, cw, ch, cw_)))
    if (!(d < 1e-5)) throw new Error(`${e.stem}: cropped ${name} differs from full frame (${d})`)
  }
  rep.add(`${e.stem}.native_bgsub`, csrc); rep.add(`${e.stem}.native_var`, csv)
  for (const s of ['interp_img', 'interp_var', 'adaptive_img', 'adaptive_var']) rep.add(`${e.stem}.${s}`, f32(`ref/${e.stem}.${s}`))
  repMeta.push({ stem: e.stem, band: e.band, nx: cw, ny: ch, crop_x0: x0, crop_y0: y0, wcs: shiftWcs(e.wcs, x0, y0), sip: e.sip })
}
const repBytes = rep.write('reproject.bin')

const R = 10
const phot = new Blob(), photMeta = []
for (const e of man.exposures) {
  const r = ref.photometry.find(p => p.stem === e.stem)
  if (!r || r.outside || r.rejected) continue
  const img = f32(`bin/${e.stem}.img`), vr = f32(`bin/${e.stem}.var`), fl = i32(`bin/${e.stem}.flags`)
  const W = makeWcs({ wcs: e.wcs, sip: e.sip })
  const [tx, ty] = W.world2pix(e.target_radec[0], e.target_radec[1])
  const x0 = Math.round(tx) - R, y0 = Math.round(ty) - R, s = 2 * R + 1
  if (x0 < 0 || y0 < 0 || x0 + s > e.nx || y0 + s > e.ny) throw new Error(`${e.stem}: target too close to the edge`)
  const ci = crop(img, e.nx, x0, y0, s, s), cv = crop(vr, e.nx, x0, y0, s, s), cf = crop(fl, e.nx, x0, y0, s, s)
  const wcs = shiftWcs(e.wcs, x0, y0), wave = shiftWave(e.wave, x0, y0)
  const a = measureStar(img, vr, fl, e.nx, e.ny, W, e.target_radec[0], e.target_radec[1], e.wave)
  const b = measureStar(ci, cv, cf, s, s, makeWcs({ wcs, sip: e.sip }), e.target_radec[0], e.target_radec[1], wave)
  if (!a || !b || a.rejected !== b.rejected || Math.hypot(a.x - x0 - b.x, a.y - y0 - b.y) > 1e-9 || Math.abs(a.flux_mjy - b.flux_mjy) > 1e-9 * Math.abs(a.err_mjy))
    throw new Error(`${e.stem}: photometry on the crop differs from the full frame`)
  phot.add(`${e.stem}.img`, ci); phot.add(`${e.stem}.var`, cv); phot.add(`${e.stem}.flags`, cf)
  photMeta.push({ stem: e.stem, band: e.band, nx: s, ny: s, crop_x0: x0, crop_y0: y0, wcs, sip: e.sip, wave, target_radec: e.target_radec,
    ref: { x: r.x - x0, y: r.y - y0, flux_mjy: r.flux_mjy, err_mjy: r.err_mjy, wavelength_um: r.wavelength_um } })
}
const photBytes = phot.write('phot.bin')

writeFileSync(join(out, 'eps_ind_b_fov0.1.json'), JSON.stringify({
  source: 'nasa2026 data/arch/r3/bundles/eps_ind_b_fov0.1 (manifest.json, ref/ref.json, ref/*, bin/*); arrays cropped from the native cutouts, WCS CRPIX and wave grid shifted by the crop origin',
  field: { ra: man.ra, dec: man.dec, fov_deg: man.fov_deg },
  reproject: { file: 'reproject.bin', index: rep.index, exposures: repMeta },
  phot: { file: 'phot.bin', index: phot.index, exposures: photMeta },
}))

const r2 = join(arch, 'r2')
const heap = new Uint8Array(readFileSync(join(r2, 'qr3_flags_heap.bin')))
const refF = new Int32Array(readFileSync(join(r2, 'qr3_flags_ref.i32')).buffer.slice(0))
const desc = JSON.parse(readFileSync(join(r2, 'qr3_flags_desc.json'), 'utf8'))
const NX = 2040, blocks = [], parts = []
let size = 0
for (const [row0, nrows] of [[0, 4], [1000, 8], [2036, 4]]) {
  const start = desc.off[row0], end = desc.off[row0 + nrows - 1] + desc.nel[row0 + nrows - 1]
  for (let r = row0; r + 1 < row0 + nrows; r++) if (desc.off[r] + desc.nel[r] !== desc.off[r + 1]) throw new Error(`row ${r} is not contiguous`)
  parts.push(heap.subarray(start, end))
  blocks.push({ row0, nrows, offset: size, bytes: end - start, off: desc.off.slice(row0, row0 + nrows).map(o => o - start + size),
    nel: desc.nel.slice(row0, row0 + nrows), sha256_astropy: sha(refF.subarray(row0 * NX, (row0 + nrows) * NX)) })
  size += end - start
}
writeFileSync(join(out, 'qr3_flags_heap.bin'), Buffer.concat(parts.map(p => Buffer.from(p))))
writeFileSync(join(out, 'qr3_flags.json'), JSON.stringify({
  source: 'nasa2026 data/arch/r2/qr3_flags_{heap.bin,desc.json,ref.i32}: QR3 FLAGS extension, RICE_1 tiles of one row (BYTEPIX=4, BLOCKSIZE=32), reference decoded by astropy',
  nx: NX, nblock: 32, blocks }, null, 1))

process.stdout.write(JSON.stringify({ reproject_bytes: repBytes, reproject_crops: repMeta.map(e => [e.nx, e.ny]), phot_bytes: photBytes, phot_exposures: photMeta.length, rice_bytes: size }) + '\n')
