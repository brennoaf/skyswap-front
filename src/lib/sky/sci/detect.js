const KS = 5, KR = 2
const KERNEL = (() => {
  const k = new Float64Array(KS * KS)
  let s = 0
  for (let y = -KR; y <= KR; y++) for (let x = -KR; x <= KR; x++) {
    const v = Math.exp(-(x * x + y * y) / (2 * 0.8 * 0.8)); k[(y + KR) * KS + x + KR] = v; s += v
  }
  for (let i = 0; i < k.length; i++) k[i] /= s
  return k
})()
const KERNEL2 = KERNEL.map(v => v * v)

function median(arr) {
  const a = Float64Array.from(arr).sort()
  const n = a.length
  if (!n) return NaN
  return n % 2 ? a[(n - 1) / 2] : 0.5 * (a[n / 2 - 1] + a[n / 2])
}

function nanMedianOf(vals) {
  const f = vals.filter(Number.isFinite)
  return f.length ? median(f) : NaN
}

export function differenceStack(images, variances, visits) {
  const N = images[0].length, E = images.length
  const diffs = [], dvars = [], templates = []
  const buf = new Float64Array(E)
  for (let i = 0; i < E; i++) {
    const others = []
    for (let j = 0; j < E; j++) if (visits[j] !== visits[i]) others.push(j)
    if (!others.length) throw new Error('need at least 2 visits')
    const d = new Float32Array(N), dv = new Float32Array(N), t = new Float32Array(N)
    for (let k = 0; k < N; k++) {
      let m = 0, vs = 0, nv = 0
      for (const j of others) {
        const a = images[j][k]
        if (Number.isFinite(a)) buf[m++] = a
        const v = variances[j][k]
        if (Number.isFinite(v)) { vs += v; nv++ }
      }
      const tm = m ? median(buf.subarray(0, m)) : NaN
      const tvar = nv ? (Math.PI / 2) * (vs / nv) / Math.max(m, 1) : NaN
      t[k] = tm
      d[k] = images[i][k] - tm
      dv[k] = variances[i][k] + tvar
    }
    diffs.push(d); dvars.push(dv); templates.push(t)
  }
  const stat = new Float32Array(N), svar = new Float32Array(N)
  for (let k = 0; k < N; k++) {
    let m = 0, vs = 0, nv = 0
    for (let j = 0; j < E; j++) {
      const a = images[j][k]
      if (Number.isFinite(a)) buf[m++] = a
      const v = variances[j][k]
      if (Number.isFinite(v)) { vs += v; nv++ }
    }
    stat[k] = m ? median(buf.subarray(0, m)) : NaN
    svar[k] = nv ? (Math.PI / 2) * (vs / nv) / E : NaN
  }
  return { diffs, dvars, templates, static: stat, staticVar: svar }
}

export function skyMask(stat, svar, n, snrMin = 5, r = 3) {
  const src = new Uint8Array(n * n)
  for (let k = 0; k < n * n; k++) {
    const s = Number.isFinite(stat[k]) && svar[k] > 0 ? stat[k] / Math.sqrt(svar[k]) : 0
    src[k] = s > snrMin ? 1 : 0
  }
  const out = new Uint8Array(n * n), rr = Math.ceil(r)
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (!Number.isFinite(stat[y * n + x])) continue
    let near = false
    for (let dy = -rr; dy <= rr && !near; dy++) for (let dx = -rr; dx <= rr; dx++) {
      if (dx * dx + dy * dy > r * r) continue
      const yy = y + dy, xx = x + dx
      if (yy >= 0 && yy < n && xx >= 0 && xx < n && src[yy * n + xx]) { near = true; break }
    }
    out[y * n + x] = near ? 0 : 1
  }
  return out
}

function convolve(img, n, k) {
  const out = new Float64Array(n * n)
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let s = 0
    for (let dy = -KR; dy <= KR; dy++) {
      const yy = y + dy
      if (yy < 0 || yy >= n) continue
      for (let dx = -KR; dx <= KR; dx++) {
        const xx = x + dx
        if (xx < 0 || xx >= n) continue
        s += img[yy * n + xx] * k[(dy + KR) * KS + dx + KR]
      }
    }
    out[y * n + x] = s
  }
  return out
}

export function snrMap(diff, variance, n, sky = null) {
  const N = n * n, bad = new Uint8Array(N), d = new Float64Array(N), v = new Float64Array(N)
  const vm = nanMedianOf(Array.from(variance))
  for (let k = 0; k < N; k++) {
    const b = !Number.isFinite(diff[k]) || !Number.isFinite(variance[k])
    bad[k] = b ? 1 : 0
    d[k] = b ? 0 : diff[k]
    v[k] = b ? vm : variance[k]
  }
  const num = convolve(d, n, KERNEL), den = convolve(v, n, KERNEL2)
  const s = new Float64Array(N)
  for (let k = 0; k < N; k++) s[k] = num[k] / Math.sqrt(den[k])
  let good = []
  const useSky = sky && (() => { let c = 0; for (let k = 0; k < N; k++) if (!bad[k] && Number.isFinite(s[k]) && sky[k]) c++; return c > 500 })()
  for (let k = 0; k < N; k++) if (!bad[k] && Number.isFinite(s[k]) && (!useSky || sky[k])) good.push(s[k])
  const med = median(good)
  const mad = 1.4826 * median(good.map(x => Math.abs(x - med)))
  const sc = Math.max(mad, 1e-6)
  const out = new Float32Array(N)
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let nb = false
    for (let dy = -1; dy <= 1 && !nb; dy++) for (let dx = -1; dx <= 1; dx++) {
      const yy = y + dy, xx = x + dx
      if (yy < 0 || yy >= n || xx < 0 || xx >= n || bad[yy * n + xx]) { nb = true; break }
    }
    out[y * n + x] = nb ? 0 : s[y * n + x] / sc
  }
  return out
}

function localSum(img, n, x, y, r = 1) {
  const xi = Math.round(x), yi = Math.round(y)
  if (xi < r || yi < r || xi >= n - r || yi >= n - r) return NaN
  let s = 0
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const v = img[(yi + dy) * n + xi + dx]
    if (Number.isFinite(v)) s += v
  }
  return s
}

export function detectFrame(i, visit, diff, snr, template, stat, n, sign = 1, thr = 5, minPix = 2) {
  const N = n * n, lab = new Int32Array(N), out = []
  let next = 0
  const stack = []
  for (let k0 = 0; k0 < N; k0++) {
    if (lab[k0] || sign * snr[k0] <= thr) continue
    next++
    const px = []
    lab[k0] = next; stack.push(k0)
    while (stack.length) {
      const k = stack.pop(); px.push(k)
      const x = k % n, y = (k / n) | 0
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy
        if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue
        const kk = yy * n + xx
        if (!lab[kk] && sign * snr[kk] > thr) { lab[kk] = next; stack.push(kk) }
      }
    }
    if (px.length < minPix) continue
    let sw = 0, sx = 0, sy = 0, peak = -Infinity
    for (const k of px) {
      const w = sign * snr[k]
      sw += w; sx += w * (k % n); sy += w * ((k / n) | 0)
      peak = Math.max(peak, sign * snr[k])
    }
    if (sw <= 0) continue
    const x = sx / sw, y = sy / sw
    if (x < 3 || y < 3 || x > n - 4 || y > n - 4) continue
    const flux = sign * localSum(diff, n, x, y), tmpl = localSum(template, n, x, y)
    out.push({ frame: i, visit, sign, x, y, snr: peak, area: px.length, flux, template_flux: tmpl,
      static_flux: localSum(stat, n, x, y),
      novelty: Number.isFinite(flux) ? flux / (Math.abs(tmpl) + 0.25 * Math.abs(flux) + 1e-9) : NaN })
  }
  return out
}

export function detectAll({ diffs, dvars, templates, static: stat, staticVar }, visits, n, { thr = 5, useSky = true } = {}) {
  const sky = useSky ? skyMask(stat, staticVar, n) : null
  const rows = []
  for (let i = 0; i < diffs.length; i++) {
    const s = snrMap(diffs[i], dvars[i], n, sky)
    rows.push(...detectFrame(i, visits[i], diffs[i], s, templates[i], stat, n, +1, thr))
    rows.push(...detectFrame(i, visits[i], diffs[i], s, templates[i], stat, n, -1, thr))
  }
  return rows
}

export function hints(rows, { matchPx = 3, minNovelty = 0.6 } = {}) {
  const groups = []
  for (const r of [...rows].sort((a, b) => b.snr - a.snr)) {
    const g = groups.find(g => g.visit === r.visit && g.sign === r.sign && Math.hypot(g.x - r.x, g.y - r.y) <= matchPx)
    if (g) { g.rows.push(r); continue }
    groups.push({ visit: r.visit, sign: r.sign, x: r.x, y: r.y, rows: [r] })
  }
  return groups.map(g => {
    const frames = new Set(g.rows.map(r => r.frame))
    const snr = Math.max(...g.rows.map(r => r.snr))
    const nov = median(g.rows.map(r => r.novelty).filter(Number.isFinite))
    const x = g.rows.reduce((s, r) => s + r.x, 0) / g.rows.length, y = g.rows.reduce((s, r) => s + r.y, 0) / g.rows.length
    let kind = 'flash'
    if (frames.size >= 2) kind = g.sign > 0 ? (nov >= minNovelty ? 'appeared' : 'residual') : 'missing'
    return { kind, visit: g.visit, x, y, snr, n_exp: frames.size, novelty: nov,
      score: kind === 'appeared' ? snr * Math.sqrt(frames.size) : kind === 'missing' ? 0.5 * snr : 0.1 * snr }
  }).sort((a, b) => b.score - a.score)
}
