export type CatalogId = 'simbad' | 'vizier' | 'legacy' | 'irsa' | 'sky'

export interface CatalogLink {
  id: CatalogId
  url: string
  external: boolean
}

export const CATALOG_RADIUS_ARCMIN = 1

const signed = (v: number, digits: number) => `${v >= 0 ? '+' : '-'}${Math.abs(v).toFixed(digits)}`

function position(ra: number, dec: number): { ra: number; dec: number } | null {
  if (!Number.isFinite(ra) || !Number.isFinite(dec) || dec < -90 || dec > 90) return null
  return { ra: ((ra % 360) + 360) % 360, dec }
}

export function catalogLinks(raIn: number, decIn: number, radiusArcmin = CATALOG_RADIUS_ARCMIN): CatalogLink[] {
  const p = position(raIn, decIn)
  if (!p) return []
  const ra = p.ra.toFixed(5)
  const dec = signed(p.dec, 5)
  const r = String(radiusArcmin)
  const simbad = new URLSearchParams({ Coord: `${ra} ${dec}`, CooFrame: 'ICRS', CooEpoch: '2000', CooEqui: '2000', Radius: r, 'Radius.unit': 'arcmin', submit: 'submit query' })
  const vizier = new URLSearchParams({ '-c': `${ra} ${dec}`, '-c.rm': r })
  const legacy = new URLSearchParams({ ra, dec: p.dec.toFixed(5), layer: 'unwise-neo7', zoom: '14' })
  const irsa = new URLSearchParams({ locstr: `${ra} ${dec}`, subsetsize: String(radiusArcmin * 2), mode: 'getResult' })
  const sky = new URLSearchParams({ ra: p.ra.toFixed(5), dec: p.dec.toFixed(5), fov: '0.1' })
  return [
    { id: 'simbad', url: `https://simbad.cds.unistra.fr/simbad/sim-coo?${simbad}`, external: true },
    { id: 'vizier', url: `https://vizier.cds.unistra.fr/viz-bin/VizieR?${vizier}`, external: true },
    { id: 'legacy', url: `https://www.legacysurvey.org/viewer?${legacy}`, external: true },
    { id: 'irsa', url: `https://irsa.ipac.caltech.edu/applications/finderchart/servlet/api?${irsa}`, external: true },
    { id: 'sky', url: `/sky?${sky}`, external: false },
  ]
}
