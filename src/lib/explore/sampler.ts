import { ang2pixNest } from '@/lib/sky'

export interface Spot {
  ra: number
  dec: number
}

export function randomSpot(cells: ReadonlySet<number>, rng: () => number = Math.random, order = 5, tries = 400): Spot | null {
  if (!cells.size) return null
  for (let i = 0; i < tries; i++) {
    const ra = rng() * 360
    const dec = (Math.asin(2 * rng() - 1) * 180) / Math.PI
    if (cells.has(ang2pixNest(order, ra, dec))) return { ra: Math.round(ra * 1e4) / 1e4, dec: Math.round(dec * 1e4) / 1e4 }
  }
  return null
}
