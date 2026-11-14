const D2R = Math.PI / 180

export function ang2pixNest(order, raDeg, decDeg) {
  const nside = 2 ** order
  const theta = (90 - decDeg) * D2R
  let phi = (((raDeg % 360) + 360) % 360) * D2R
  const z = Math.cos(theta), za = Math.abs(z)
  const tt = (phi / (Math.PI / 2)) % 4
  let face, ix, iy
  if (za <= 2 / 3) {
    const t1 = nside * (0.5 + tt), t2 = nside * z * 0.75
    const jp = Math.floor(t1 - t2), jm = Math.floor(t1 + t2)
    const ifp = Math.floor(jp / nside), ifm = Math.floor(jm / nside)
    face = ifp === ifm ? (ifp | 4) : (ifp < ifm ? ifp : ifm + 8)
    ix = jm & (nside - 1)
    iy = nside - (jp & (nside - 1)) - 1
  } else {
    const ntt = Math.min(3, Math.floor(tt)), tp = tt - ntt
    const tmp = nside * Math.sqrt(3 * (1 - za))
    let jp = Math.floor(tp * tmp), jm = Math.floor((1 - tp) * tmp)
    jp = Math.min(jp, nside - 1); jm = Math.min(jm, nside - 1)
    if (z >= 0) { face = ntt; ix = nside - jm - 1; iy = nside - jp - 1 } else { face = ntt + 8; ix = jp; iy = jm }
  }
  let pix = 0
  for (let b = 0; b < order; b++) pix += (((ix >> b) & 1) << (2 * b)) + (((iy >> b) & 1) << (2 * b + 1))
  return face * nside * nside + pix
}

function sipTerms(c, off, u, v) {
  let s = 0, k = off
  for (let p = 0; p <= 3; p++) for (let q = 0; q <= 3; q++) {
    if (p + q > 3) continue
    s += c[k++] * u ** p * v ** q
  }
  return s
}

export function world2pix(wcs, sip, raDeg, decDeg) {
  const [crpix1, crpix2, crval1, crval2, a, b, c, d] = wcs
  const ra = raDeg * D2R, de = decDeg * D2R, ra0 = crval1 * D2R, de0 = crval2 * D2R
  const cosc = Math.sin(de0) * Math.sin(de) + Math.cos(de0) * Math.cos(de) * Math.cos(ra - ra0)
  const xi = Math.cos(de) * Math.sin(ra - ra0) / cosc / D2R
  const eta = (Math.cos(de0) * Math.sin(de) - Math.sin(de0) * Math.cos(de) * Math.cos(ra - ra0)) / cosc / D2R
  const det = a * d - b * c
  const U = (d * xi - b * eta) / det, V = (-c * xi + a * eta) / det
  const u = U + sipTerms(sip, 20, U, V), v = V + sipTerms(sip, 30, U, V)
  return [u + crpix1 - 1, v + crpix2 - 1]
}

export function insideQuad(ra, dec, cra, cdec) {
  const ra0 = ra * D2R, de0 = dec * D2R
  const x = [], y = []
  for (let i = 0; i < 4; i++) {
    const r = cra[i] * D2R, d = cdec[i] * D2R
    const cosc = Math.sin(de0) * Math.sin(d) + Math.cos(de0) * Math.cos(d) * Math.cos(r - ra0)
    if (cosc <= 0) return false
    x.push(Math.cos(d) * Math.sin(r - ra0) / cosc)
    y.push((Math.cos(de0) * Math.sin(d) - Math.sin(de0) * Math.cos(d) * Math.cos(r - ra0)) / cosc)
  }
  let pos = 0, neg = 0
  for (let i = 0; i < 4; i++) {
    const cr = x[i] * y[(i + 1) % 4] - y[i] * x[(i + 1) % 4]
    if (cr > 0) pos++; else if (cr < 0) neg++
  }
  return pos === 4 || neg === 4
}

export function wavelengthAt(grid, x0, y0) {
  const x = x0 + 1, y = y0 + 1, gx = grid.x, gy = grid.y, nx = gx.length
  const find = (g, v) => Math.max(0, Math.min(g.length - 2, g.findIndex(t => t > v) - 1 < 0 ? g.length - 2 : g.findIndex(t => t > v) - 1))
  const i = find(gx, x), j = find(gy, y)
  const tx = (x - gx[i]) / (gx[i + 1] - gx[i]), ty = (y - gy[j]) / (gy[j + 1] - gy[j])
  const L = (jj, ii) => grid.lam[jj * nx + ii]
  return L(j, i) * (1 - tx) * (1 - ty) + L(j, i + 1) * tx * (1 - ty) + L(j + 1, i) * (1 - tx) * ty + L(j + 1, i + 1) * tx * ty
}
