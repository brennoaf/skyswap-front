import { ang2pixNest } from './sky.js'

export function loadCells(json) {
  const col = Object.fromEntries(json.columns.map((c, i) => [c, i]))
  return json.rows.map(r => ({ cell: r[col.cell], ra: r[col.ra], dec: r[col.dec], eclLat: r[col.ecl_lat],
    nImages: r[col.n_images], nPasses: r[col.n_passes], nVisits: r[col.n_visits], mjdMax: r[col.mjd_max] }))
}

export function interest(c, looks = 0, nowMjd = null, w = {}) {
  const { unexplored = 1, fresh = 1, ecliptic = 0.6, depth = 0.4 } = w
  const ageDays = nowMjd == null ? Infinity : nowMjd - c.mjdMax
  const fFresh = ageDays < 30 ? 1 : ageDays < 90 ? 0.5 : 0
  const fEcl = Math.exp(-((c.eclLat / 15) ** 2))
  const fDepth = Math.min(c.nPasses - 1, 3) / 3
  return unexplored / (1 + looks) + fresh * fFresh + ecliptic * fEcl + depth * fDepth
}

export function pick(cells, { looks = {}, nowMjd = null, uniform = 0.3, minVisits = 2, weights = {}, rnd = Math.random } = {}) {
  const ok = cells.filter(c => c.nVisits >= minVisits)
  if (!ok.length) return null
  let c, why
  if (rnd() < uniform) {
    c = ok[Math.floor(rnd() * ok.length)]
    why = 'uniform'
  } else {
    const ws = ok.map(x => interest(x, looks[x.cell] || 0, nowMjd, weights))
    const tot = ws.reduce((a, b) => a + b, 0)
    let t = rnd() * tot, i = 0
    while (i < ok.length - 1 && t >= ws[i]) t -= ws[i++]
    c = ok[i]
    why = 'interest'
  }
  const [ra, dec] = pointInCell(c, rnd)
  return { ra, dec, cell: c.cell, why }
}

export function pointInCell(c, rnd = Math.random, order = 5) {
  const half = 2.4
  const d0 = Math.max(-90, c.dec - half), d1 = Math.min(90, c.dec + half)
  const s0 = Math.sin(d0 * Math.PI / 180), s1 = Math.sin(d1 * Math.PI / 180)
  const cosd = Math.max(Math.cos(c.dec * Math.PI / 180), 0.05)
  const span = Math.min(half / cosd, 180)
  for (let k = 0; k < 2000; k++) {
    const dec = Math.asin(s0 + rnd() * (s1 - s0)) * 180 / Math.PI
    const ra = (c.ra + (rnd() * 2 - 1) * span + 360) % 360
    if (ang2pixNest(order, ra, dec) === c.cell) return [ra, dec]
  }
  return [c.ra, c.dec]
}
