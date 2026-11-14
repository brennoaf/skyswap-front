
const D2R = Math.PI / 180

const PU = new Float64Array(4), PV = new Float64Array(4)
function powers(u, v) { PU[0] = 1; PU[1] = u; PU[2] = u * u; PU[3] = PU[2] * u; PV[0] = 1; PV[1] = v; PV[2] = v * v; PV[3] = PV[2] * v }

function poly(c, off, u, v) {
  powers(u, v)
  return c[off] + c[off + 1] * PV[1] + c[off + 2] * PV[2] + c[off + 3] * PV[3]
    + c[off + 4] * PU[1] + c[off + 5] * PU[1] * PV[1] + c[off + 6] * PU[1] * PV[2]
    + c[off + 7] * PU[2] + c[off + 8] * PU[2] * PV[1] + c[off + 9] * PU[3]
}

function dpoly(c, off, u, v) {
  powers(u, v)
  const du = c[off + 4] + c[off + 5] * PV[1] + c[off + 6] * PV[2] + 2 * c[off + 7] * PU[1] + 2 * c[off + 8] * PU[1] * PV[1] + 3 * c[off + 9] * PU[2]
  const dv = c[off + 1] + 2 * c[off + 2] * PV[1] + 3 * c[off + 3] * PV[2] + c[off + 5] * PU[1] + 2 * c[off + 6] * PU[1] * PV[1] + c[off + 8] * PU[2]
  return [du, dv]
}

export function makeWcs({ wcs, sip = null }) {
  const [crpix1, crpix2, crval1, crval2, a, b, c, d] = wcs
  const det = a * d - b * c
  const ra0 = crval1 * D2R, de0 = crval2 * D2R, sd0 = Math.sin(de0), cd0 = Math.cos(de0)
  const hasSip = !!sip && sip.some(x => x !== 0)

  function deproject(xi, eta) {
    const X = xi * D2R, Y = eta * D2R
    const den = cd0 - Y * sd0
    const ra = ra0 + Math.atan2(X, den)
    const dec = Math.atan2(Y * cd0 + sd0, Math.hypot(X, den))
    return [((ra / D2R) % 360 + 360) % 360, dec / D2R]
  }
  function project(raDeg, decDeg) {
    const ra = raDeg * D2R, de = decDeg * D2R
    const cosc = sd0 * Math.sin(de) + cd0 * Math.cos(de) * Math.cos(ra - ra0)
    return [Math.cos(de) * Math.sin(ra - ra0) / cosc / D2R,
      (cd0 * Math.sin(de) - sd0 * Math.cos(de) * Math.cos(ra - ra0)) / cosc / D2R]
  }

  function pix2world(x, y) {
    let u = x + 1 - crpix1, v = y + 1 - crpix2
    if (hasSip) { const f = poly(sip, 0, u, v), g = poly(sip, 10, u, v); u += f; v += g }
    return deproject(a * u + b * v, c * u + d * v)
  }

  function world2pix(raDeg, decDeg, exact = true) {
    const [xi, eta] = project(raDeg, decDeg)
    const U = (d * xi - b * eta) / det, V = (-c * xi + a * eta) / det
    if (!hasSip) return [U + crpix1 - 1, V + crpix2 - 1]
    let u = U + poly(sip, 20, U, V), v = V + poly(sip, 30, U, V)
    if (exact) {
      for (let it = 0; it < 20; it++) {
        const fu = u + poly(sip, 0, u, v) - U, fv = v + poly(sip, 10, u, v) - V
        const [au, av] = dpoly(sip, 0, u, v), [bu, bv] = dpoly(sip, 10, u, v)
        const j11 = 1 + au, j12 = av, j21 = bu, j22 = 1 + bv, jd = j11 * j22 - j12 * j21
        const du = (j22 * fu - j12 * fv) / jd, dv = (-j21 * fu + j11 * fv) / jd
        u -= du; v -= dv
        if (Math.abs(du) < 1e-12 && Math.abs(dv) < 1e-12) break
      }
    }
    return [u + crpix1 - 1, v + crpix2 - 1]
  }

  const pixelAreaSr = Math.abs(det) * D2R * D2R
  return { pix2world, world2pix, pixelAreaSr, crval: [crval1, crval2] }
}

export function referenceGrid(ra, dec, fovDeg, scaleArcsec = 6.15) {
  const n = Math.round(fovDeg * 3600 / scaleArcsec), s = scaleArcsec / 3600
  return { n, wcs: makeWcs({ wcs: [(n + 1) / 2, (n + 1) / 2, ra, dec, -s, 0, 0, s] }) }
}

export function coordMap(dstWcs, n, srcWcs, { pad = 0, approxStep = 1, exact = true } = {}) {
  const m = n + 2 * pad, out = new Float64Array(m * m * 2)
  const exactAt = (i, j) => { const [ra, de] = dstWcs.pix2world(i - pad, j - pad); return srcWcs.world2pix(ra, de, exact) }
  if (approxStep <= 1) {
    for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) { const [x, y] = exactAt(i, j); out[2 * (j * m + i)] = x; out[2 * (j * m + i) + 1] = y }
    return out
  }
  const S = approxStep, g = Math.ceil((m - 1) / S) + 1, grid = new Float64Array(g * g * 2)
  for (let gj = 0; gj < g; gj++) for (let gi = 0; gi < g; gi++) {
    const [x, y] = exactAt(Math.min(gi * S, m - 1), Math.min(gj * S, m - 1))
    grid[2 * (gj * g + gi)] = x; grid[2 * (gj * g + gi) + 1] = y
  }
  for (let j = 0; j < m; j++) {
    const gj = Math.min(Math.floor(j / S), g - 2), j0 = gj * S, j1 = Math.min((gj + 1) * S, m - 1), ty = j1 > j0 ? (j - j0) / (j1 - j0) : 0
    for (let i = 0; i < m; i++) {
      const gi = Math.min(Math.floor(i / S), g - 2), i0 = gi * S, i1 = Math.min((gi + 1) * S, m - 1), tx = i1 > i0 ? (i - i0) / (i1 - i0) : 0
      for (let k = 0; k < 2; k++) {
        const v00 = grid[2 * (gj * g + gi) + k], v10 = grid[2 * (gj * g + gi + 1) + k]
        const v01 = grid[2 * ((gj + 1) * g + gi) + k], v11 = grid[2 * ((gj + 1) * g + gi + 1) + k]
        out[2 * (j * m + i) + k] = v00 * (1 - tx) * (1 - ty) + v10 * tx * (1 - ty) + v01 * (1 - tx) * ty + v11 * tx * ty
      }
    }
  }
  return out
}
