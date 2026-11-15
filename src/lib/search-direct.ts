import type { SearchResult } from '@/lib/api/client'

export type DirectSpot = { ra: number; dec: number; name: string | null; obj: string | null }

export function directSpot(r: SearchResult | null | undefined): DirectSpot | null {
  const spot = r?.resolved ? r.spot : null
  if (!r || !spot) return null
  if (spot.source === 'coordinates') return { ra: spot.ra, dec: spot.dec, name: null, obj: null }
  if (spot.source === 'kit') return r.objects.length === 1 ? { ra: spot.ra, dec: spot.dec, name: spot.name, obj: r.objects[0]?.id ?? null } : null
  return { ra: spot.ra, dec: spot.dec, name: spot.name, obj: null }
}
