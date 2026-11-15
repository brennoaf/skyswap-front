import type { SearchResult } from '@/lib/api/client'

export type DirectSpot = { ra: number; dec: number; name: string | null; obj: string | null }

export function spotName(r: SearchResult): string | null {
  const spot = r.spot
  if (!spot || spot.source === 'coordinates') return null
  return spot.source === 'kit' ? spot.name : r.query.trim() || spot.name
}

export function spotObject(r: SearchResult): string | null {
  return r.spot?.source === 'kit' ? (r.objects[0]?.id ?? null) : null
}

export function directSpot(r: SearchResult | null | undefined): DirectSpot | null {
  const spot = r?.resolved ? r.spot : null
  if (!r || !spot) return null
  if (spot.source === 'kit' && r.objects.length !== 1) return null
  return { ra: spot.ra, dec: spot.dec, name: spotName(r), obj: spotObject(r) }
}
