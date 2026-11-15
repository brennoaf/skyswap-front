import type { FindingDetail } from '@/lib/api/client'
import { referenceGrid } from '@/lib/sky'
import { makeWcs } from '@/lib/sky/lab'

export type Tracks = NonNullable<FindingDetail['tracks']>
type Point = { u: number; v: number }

const PIXEL_ARCSEC = 6.15
const MIN_SIDE = 0.3

export type CrowdSky = { n: number; arcsecPerPx: number; toSky: ((u: number, v: number) => [number, number]) | null }

export function crowdSky(tracks: Pick<Tracks, 'spot' | 'wcs' | 'size_px'>, fovDeg: number): CrowdSky {
  const spot = tracks.spot
  if (spot) {
    const grid = referenceGrid(spot.ra, spot.dec, spot.fov_deg)
    return { n: grid.n, arcsecPerPx: PIXEL_ARCSEC, toSky: (u, v) => grid.wcs.pix2world(u * grid.n - 0.5, (1 - v) * grid.n - 0.5) }
  }
  const w = tracks.wcs
  const [a = 0, b = 0] = w?.cd[0] ?? []
  const [c = 0, d = 0] = w?.cd[1] ?? []
  const [nx = 0, ny = 0] = w?.naxis ?? []
  if (w && nx > 0 && ny > 0 && a * d - b * c !== 0) {
    const wcs = makeWcs({ wcs: [w.crpix[0] ?? 0, w.crpix[1] ?? 0, w.crval[0] ?? 0, w.crval[1] ?? 0, a, b, c, d], sip: null })
    return { n: nx, arcsecPerPx: Math.sqrt(Math.abs(a * d - b * c)) * 3600, toSky: (u, v) => wcs.pix2world(u * nx - 0.5, (1 - v) * ny - 0.5) }
  }
  const n = Math.max(1, tracks.size_px)
  return { n, arcsecPerPx: (fovDeg * 3600) / n, toSky: null }
}

const mean = (pts: Point[]): Point | null => (pts.length ? { u: pts.reduce((s, p) => s + p.u, 0) / pts.length, v: pts.reduce((s, p) => s + p.v, 0) / pts.length } : null)

export function crowdStats(tracks: Pick<Tracks, 'frames'>, sky: Pick<CrowdSky, 'n' | 'arcsecPerPx'>) {
  const { n: size, arcsecPerPx } = sky
  const frames = tracks.frames.map((f) => {
    const m = mean(f.points)
    const spread = m && f.points.length > 1 ? Math.sqrt(f.points.reduce((s, p) => s + (p.u - m.u) ** 2 + (p.v - m.v) ** 2, 0) / f.points.length) : 0
    return { mjd: f.mjd, mean: m, n: f.points.length, margin: m ? ((spread * size) / Math.sqrt(Math.max(1, f.points.length))) * arcsecPerPx : null }
  })
  const used = frames.filter((f): f is (typeof frames)[number] & { mean: Point } => !!f.mean)
  let speed: number | null = null
  let direction: string | null = null
  if (used.length >= 2) {
    const hours = used.map((f) => f.mjd * 24)
    const th = hours.reduce((s, h) => s + h, 0) / hours.length
    const vt = hours.reduce((s, h) => s + (h - th) ** 2, 0)
    if (vt > 0) {
      const slope = (pick: (p: Point) => number) => {
        const m = used.reduce((s, f) => s + pick(f.mean), 0) / used.length
        return used.reduce((s, f, i) => s + ((hours[i] as number) - th) * (pick(f.mean) - m), 0) / vt
      }
      speed = Math.hypot(slope((p) => p.u), slope((p) => p.v)) * size * arcsecPerPx
    }
    const first = (used[0] as (typeof used)[number]).mean
    const last = (used[used.length - 1] as (typeof used)[number]).mean
    const dx = last.u - first.u
    const dy = last.v - first.v
    const big = Math.max(Math.abs(dx), Math.abs(dy))
    if (big > 0) {
      const vert = Math.abs(dy) >= MIN_SIDE * big ? (dy < 0 ? 'up' : 'down') : ''
      const horiz = Math.abs(dx) >= MIN_SIDE * big ? (dx < 0 ? 'Left' : 'Right') : ''
      direction = vert ? `${vert}${horiz}` : horiz.toLowerCase()
    }
  }
  const margins = frames.flatMap((f) => (f.margin !== null ? [f.margin] : []))
  return { frames, speed, direction, margin: margins.length ? margins.reduce((s, m) => s + m, 0) / margins.length : null }
}

export function positionsCsv(sky: CrowdSky, stats: ReturnType<typeof crowdStats>): string | null {
  const toSky = sky.toSky
  if (!toSky) return null
  const rows = ['utc,ra_deg,dec_deg,margin_arcsec,marks']
  for (const f of stats.frames) {
    if (!f.mean) continue
    const [ra, dec] = toSky(f.mean.u, f.mean.v)
    const utc = new Date((f.mjd - 40587) * 86400000).toISOString()
    rows.push([utc, ra.toFixed(6), dec.toFixed(6), (f.margin ?? 0).toFixed(2), f.n].join(','))
  }
  return rows.join('\n')
}
