export interface DetectionRow {
  visit: number
  sign: number
  x: number
  y: number
  snr: number
  novelty: number
}

export interface TrackPoint {
  visit: number
  x: number
  y: number
  snr: number
}

const MERGE_PX = 3
const MIN_NOVELTY = 0.6
const MIN_STEP_PX = 1.5
const LINK_TOL_PX = 1.5
const MIN_POINTS = 3

function perVisit(rows: DetectionRow[]): TrackPoint[] {
  const out: TrackPoint[] = []
  const bright = rows.filter((r) => r.sign > 0 && Number.isFinite(r.novelty) && r.novelty >= MIN_NOVELTY).sort((a, b) => b.snr - a.snr)
  for (const r of bright) {
    if (out.some((p) => p.visit === r.visit && Math.hypot(p.x - r.x, p.y - r.y) <= MERGE_PX)) continue
    out.push({ visit: r.visit, x: r.x, y: r.y, snr: r.snr })
  }
  return out
}

export function linkMoving(rows: DetectionRow[], hours: number[]): TrackPoint[] {
  const points = perVisit(rows)
  const visits = [...new Set(points.map((p) => p.visit))]
  if (visits.length < MIN_POINTS) return []
  let best: TrackPoint[] = []
  let bestScore = 0
  for (const a of points) {
    for (const b of points) {
      const ta = hours[a.visit]
      const tb = hours[b.visit]
      if (ta === undefined || tb === undefined || tb <= ta) continue
      if (Math.hypot(b.x - a.x, b.y - a.y) < MIN_STEP_PX) continue
      const vx = (b.x - a.x) / (tb - ta)
      const vy = (b.y - a.y) / (tb - ta)
      const track = [a, b]
      for (const visit of visits) {
        const tc = hours[visit]
        if (visit === a.visit || visit === b.visit || tc === undefined) continue
        const px = a.x + vx * (tc - ta)
        const py = a.y + vy * (tc - ta)
        const near = points
          .filter((p) => p.visit === visit && Math.hypot(p.x - px, p.y - py) <= LINK_TOL_PX)
          .sort((p, q) => Math.hypot(p.x - px, p.y - py) - Math.hypot(q.x - px, q.y - py))[0]
        if (near) track.push(near)
      }
      if (track.length < MIN_POINTS) continue
      const score = track.length * 1000 + track.reduce((s, p) => s + p.snr, 0)
      if (score > bestScore) {
        bestScore = score
        best = track
      }
    }
  }
  return [...best].sort((p, q) => p.visit - q.visit)
}
