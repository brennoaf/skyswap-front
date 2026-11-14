export const MASK_VALUE = [0, 1, 2, 6, 7, 9, 10, 11, 14, 15, 17, 20, 22, 23, 24, 25, 26, 27, 28, 29].reduce((s, b) => s + 2 ** b, 0)

function median(a) {
  const s = Float64Array.from(a).sort(), n = s.length
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2
}

export function sigmaClippedStats(values, sigma = 3, maxiters = 5) {
  let v = Float64Array.from(values)
  for (let it = 0; it < maxiters; it++) {
    const med = median(v)
    let m = 0
    for (const x of v) m += x
    m /= v.length
    let s = 0
    for (const x of v) s += (x - m) ** 2
    const std = Math.sqrt(s / v.length)
    const keep = v.filter(x => Math.abs(x - med) <= sigma * std)
    if (keep.length === v.length) break
    v = keep
  }
  let mean = 0
  for (const x of v) mean += x
  mean /= v.length
  let s = 0
  for (const x of v) s += (x - mean) ** 2
  return [mean, median(v), Math.sqrt(s / v.length)]
}

function gauss(p, x, y) {
  const [A, x0, y0, sx, sy, th] = p
  const c = Math.cos(th), s = Math.sin(th)
  const a = c * c / (2 * sx * sx) + s * s / (2 * sy * sy)
  const b = Math.sin(2 * th) / (2 * sx * sx) - Math.sin(2 * th) / (2 * sy * sy)
  const cc = s * s / (2 * sx * sx) + c * c / (2 * sy * sy)
  const dx = x - x0, dy = y - y0
  return A * Math.exp(-(a * dx * dx + b * dx * dy + cc * dy * dy))
}

function moments(d, w, h) {
  let m00 = 0, m10 = 0, m01 = 0
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = d[y * w + x]; m00 += v; m10 += v * x; m01 += v * y }
  const xc = m10 / m00, yc = m01 / m00
  let mu20 = 0, mu02 = 0, mu11 = 0
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = d[y * w + x]; mu20 += v * (x - xc) ** 2; mu02 += v * (y - yc) ** 2; mu11 += v * (x - xc) * (y - yc) }
  mu20 /= m00; mu02 /= m00; mu11 /= m00
  const t = 0.5 * Math.atan2(2 * mu11, mu20 - mu02)
  const common = Math.sqrt(((mu20 - mu02) / 2) ** 2 + mu11 ** 2), mean = (mu20 + mu02) / 2
  const l1 = mean + common, l2 = mean - common
  let amp = -Infinity
  for (const v of d) if (v > amp) amp = v
  return [amp, xc, yc, Math.sqrt(Math.max(l1, 1e-6)), Math.sqrt(Math.max(l2, 1e-6)), t]
}

export function centroid2dg(data, w, h, mask = null) {
  let mn = Infinity
  for (let k = 0; k < data.length; k++) if (!(mask && mask[k]) && data[k] < mn) mn = data[k]
  const shifted = Float64Array.from(data, (v, k) => (mask && mask[k]) ? 0 : v - mn)
  let p = moments(shifted, w, h)
  const N = w * h
  const res = q => { const r = new Float64Array(N); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const k = y * w + x; r[k] = (mask && mask[k]) ? 0 : data[k] - gauss(q, x, y) } return r }
  let r = res(p), cost = r.reduce((s, v) => s + v * v, 0), lambda = 1e-3
  for (let it = 0; it < 200; it++) {
    const J = []
    for (let j = 0; j < 6; j++) {
      const h_ = 1e-6 * Math.max(1, Math.abs(p[j])), q = p.slice(); q[j] += h_
      const rq = res(q); J.push(Float64Array.from(rq, (v, k) => -(v - r[k]) / h_))
    }
    const A = Array.from({ length: 6 }, () => new Float64Array(6)), g = new Float64Array(6)
    for (let i = 0; i < 6; i++) { for (let k = 0; k < N; k++) g[i] += J[i][k] * r[k]; for (let j = 0; j < 6; j++) { let s = 0; for (let k = 0; k < N; k++) s += J[i][k] * J[j][k]; A[i][j] = s } }
    let improved = false
    for (let tries = 0; tries < 10; tries++) {
      const M = A.map((row, i) => Float64Array.from(row, (v, j) => v + (i === j ? lambda * (v || 1) : 0)))
      const step = solve(M, g)
      const q = p.map((v, i) => v + step[i])
      const rq = res(q), cq = rq.reduce((s, v) => s + v * v, 0)
      if (cq < cost) { p = q; r = rq; const rel = (cost - cq) / cost; cost = cq; lambda /= 10; improved = true; if (rel < 1e-12) return [p[1], p[2]]; break }
      lambda *= 10
    }
    if (!improved) break
  }
  return [p[1], p[2]]
}

function solve(M, b) {
  const n = b.length, A = M.map((r, i) => [...r, b[i]])
  for (let c = 0; c < n; c++) {
    let piv = c
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r
    ;[A[c], A[piv]] = [A[piv], A[c]]
    for (let r = c + 1; r < n; r++) { const f = A[r][c] / A[c][c]; for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k] }
  }
  const x = new Float64Array(n)
  for (let r = n - 1; r >= 0; r--) { let s = A[r][n]; for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k]; x[r] = s / A[r][r] }
  return x
}

function bilinearGrid(grid, x, y) {
  const gx = grid.x, gy = grid.y, nx = gx.length
  const idx = (g, v) => { let i = 0; while (i < g.length - 2 && g[i + 1] <= v) i++; return i }
  const i = idx(gx, x), j = idx(gy, y), tx = (x - gx[i]) / (gx[i + 1] - gx[i]), ty = (y - gy[j]) / (gy[j + 1] - gy[j])
  const L = (jj, ii) => grid.lam[jj * nx + ii]
  return L(j, i) * (1 - tx) * (1 - ty) + L(j, i + 1) * tx * (1 - ty) + L(j + 1, i) * (1 - tx) * ty + L(j + 1, i + 1) * tx * ty
}

export function measureStar(img, variance, flags, w, h, wcs, ra, dec, wave, { rAp = 2, rIn = 4, rOut = 7 } = {}) {
  let [x, y] = wcs.world2pix(ra, dec)
  if (!(rOut < x && x < w - rOut - 1 && rOut < y && y < h - rOut - 1)) return null
  const xi = Math.round(x), yi = Math.round(y)
  const box = new Float64Array(25)
  for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) { const v = img[(yi - 2 + j) * w + (xi - 2 + i)]; box[j * 5 + i] = Number.isFinite(v) ? v : 0 }
  const med = median(box)
  let refined = false
  try {
    const [dx, dy] = centroid2dg(box.map(v => v - med), 5, 5)
    if (Number.isFinite(dx) && Math.hypot(dx - 2, dy - 2) < 1.5) { x = xi - 2 + dx; y = yi - 2 + dy; refined = true }
  } catch {}
  const ann = [], apIdx = []
  let apBad = false
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const r = Math.hypot(i - x, j - y), k = j * w + i
    const bad = (flags[k] & MASK_VALUE) !== 0
    if (r <= rAp) { apIdx.push(k); if (bad) apBad = true }
    if (r >= rIn && r <= rOut && !bad && Number.isFinite(img[k])) ann.push(img[k])
  }
  if (apBad || ann.length < 20) return { x, y, rejected: true }
  const [, bkg] = sigmaClippedStats(ann, 3)
  let sb = 0, sv = 0
  for (const k of apIdx) { if (Number.isFinite(img[k])) sb += img[k] - bkg; if (Number.isFinite(variance[k])) sv += variance[k] }
  let am = 0
  for (const v of ann) am += v
  am /= ann.length
  let avar = 0
  for (const v of ann) avar += (v - am) ** 2
  avar /= ann.length
  const npx = apIdx.length, sbErr = Math.sqrt(sv + npx * npx * avar / ann.length)
  const pixSr = wcs.pixelAreaSr
  return { x, y, refined, rejected: false, bkg, sb, sb_err: sbErr, npx, pix_sr: pixSr, flux_mjy: sb * pixSr * 1e9, err_mjy: sbErr * pixSr * 1e9,
    wavelength_um: bilinearGrid(wave, x + 1, y + 1) }
}

export function properMotion(positions) {
  if (positions.length < 2) return null
  const a = positions[0], b = positions[positions.length - 1], dt = (b.mjd - a.mjd) / 365.25
  return { pmra_mas_yr: (b.ra - a.ra) * Math.cos(a.dec * Math.PI / 180) * 3.6e6 / dt, pmdec_mas_yr: (b.dec - a.dec) * 3.6e6 / dt, dt_yr: dt }
}
