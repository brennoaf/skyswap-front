import { riceDecode32 } from './rice.js'

export function mulberry32Fill(seed, n, out = new Float64Array(n)) {
  let a = seed >>> 0
  for (let k = 0; k < n; k++) {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    out[k] = ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return out
}

export async function inflate(bytes) {
  const ds = new DecompressionStream('deflate')
  const buf = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer()
  return buf
}

async function decodeBlock(bytes, codec, n) {
  if (codec === 'rice') { const out = new Int32Array(n); riceDecode32(bytes, 0, n, 32, out); return out }
  if (codec === 'deflate') return new Int32Array(await inflate(bytes))
  if (codec === 'deflate4') {
    const u = new Uint8Array(await inflate(bytes)), out = new Uint8Array(u.length), m = u.length >> 2
    for (let k = 0; k < m; k++) { out[4 * k] = u[k]; out[4 * k + 1] = u[m + k]; out[4 * k + 2] = u[2 * m + k]; out[4 * k + 3] = u[3 * m + k] }
    return new Int32Array(out.buffer)
  }
  return new Int32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
}

export async function decodeSxq(buf) {
  const u8 = new Uint8Array(buf)
  if (String.fromCharCode(...u8.subarray(0, 4)) !== 'SXQ1') throw new Error('not an SXQ1 file')
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
  const n = dv.getUint32(4, true)
  const head = JSON.parse(new TextDecoder().decode(u8.subarray(8, 8 + n)))
  let off = 8 + n
  const npx = head.ny * head.nx, out = { head }
  for (const blk of head.blocks) {
    const ints = await decodeBlock(u8.subarray(off, off + blk.nbytes), blk.codec, npx)
    off += blk.nbytes
    if (blk.name === 'image') {
      const r = mulberry32Fill(head.seed, npx), img = new Float32Array(npx)
      for (let k = 0; k < npx; k++) img[k] = ints[k] === 0 ? NaN : ((ints[k] - 1 + head.lo) - r[k] + 0.5) * head.step
      out.image = img
      out.ints = ints
    } else if (blk.name === 'variance') {
      const v = new Float32Array(npx), l = Math.log1p(head.var_eps)
      for (let k = 0; k < npx; k++) v[k] = ints[k] === 0 ? NaN : Math.exp(2 * (ints[k] - 1 + head.var_lo) * l)
      out.variance = v
    } else out[blk.name] = ints
  }
  return out
}

export function unpack(buf) {
  const u8 = new Uint8Array(buf), dv = new DataView(buf)
  if (String.fromCharCode(...u8.subarray(0, 4)) !== 'SXQP') throw new Error('not an SXQP pack')
  const n = dv.getUint32(4, true), parts = []
  for (let i = 0; i < n; i++) parts.push(u8.subarray(dv.getUint32(8 + 8 * i, true), dv.getUint32(8 + 8 * i, true) + dv.getUint32(12 + 8 * i, true)))
  return parts
}

export async function deflate(bytes) {
  const cs = new CompressionStream('deflate')
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(cs)).arrayBuffer())
}

export function noiseSigma(img, nx) {
  const d = []
  for (let k = 0; k + 1 < img.length; k++) if ((k + 1) % nx && Number.isFinite(img[k]) && Number.isFinite(img[k + 1])) d.push(Math.abs(img[k] - img[k + 1]))
  d.sort((a, b) => a - b)
  return 1.4826 * d[d.length >> 1] / Math.SQRT2
}

export async function encodeSxq(img, ny, nx, meta, sigma = noiseSigma(img, nx), seed = 12345) {
  const step = sigma / 4, n = ny * nx, r = mulberry32Fill(seed >>> 0, n), q = new Float64Array(n)
  let lo = Infinity
  for (let k = 0; k < n; k++) if (Number.isFinite(img[k])) { q[k] = Math.round(img[k] / step + r[k] - 0.5); if (q[k] < lo) lo = q[k] }
  const ints = new Int32Array(n)
  for (let k = 0; k < n; k++) ints[k] = Number.isFinite(img[k]) ? q[k] - lo + 1 : 0
  const u = new Uint8Array(ints.buffer), m = n, sh = new Uint8Array(4 * n)
  for (let k = 0; k < m; k++) { sh[k] = u[4 * k]; sh[m + k] = u[4 * k + 1]; sh[2 * m + k] = u[4 * k + 2]; sh[3 * m + k] = u[4 * k + 3] }
  const blk = await deflate(sh)
  const head = new TextEncoder().encode(JSON.stringify({ ...meta, ny, nx, step, lo, seed: seed >>> 0, sigma_ref: sigma,
    quant: 'sigma/4 dither=mulberry32 (sigma estimated on the client)', blocks: [{ name: 'image', codec: 'deflate4', nbytes: blk.length }] }))
  const out = new Uint8Array(8 + head.length + blk.length)
  out.set([83, 88, 81, 49]); new DataView(out.buffer).setUint32(4, head.length, true); out.set(head, 8); out.set(blk, 8 + head.length)
  return out
}
