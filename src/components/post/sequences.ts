import type { Frame, Post } from '@/lib/api/client'

export type FilterKey = 'original' | 'warm' | 'rainbow' | 'water' | 'changed'

export interface Sequence {
  key: FilterKey | 'slider'
  frames: Frame[]
  predicted: Map<number, { x: number; y: number }>
}

export const FILTERS: FilterKey[] = ['original', 'warm', 'rainbow', 'water', 'changed']

const POOL_TYPES = new Set(['timelapse', 'pass_blink', 'band_compare'])

export const centre = (f: Frame) => (f.wavelength_um && f.wavelength_um.length >= 2 ? ((f.wavelength_um[0] as number) + (f.wavelength_um[1] as number)) / 2 : null)

function coverFrame(post: Post): Frame {
  return {
    src: post.cover,
    t: post.date_range[0] ?? '',
    mjd: 0,
    band: post.band ?? '',
    wavelength_um: post.wavelength_um,
    release: '',
    fov_deg: 0,
    kind: 'coadd',
    flags: { saturated_frac: 0, cosmic_ray: false, satellite: false, persistence: false },
  }
}

export function framePool(posts: Post[]): Frame[] {
  const seen = new Set<string>()
  const out: Frame[] = []
  for (const p of posts) {
    if (!POOL_TYPES.has(p.type)) continue
    for (const f of p.frames) {
      if (seen.has(f.src)) continue
      seen.add(f.src)
      out.push(f)
    }
  }
  return out.sort((a, b) => a.mjd - b.mjd)
}

export function buildSequences(post: Post, objectPosts: Post[]): Record<FilterKey, Sequence> {
  const pool = framePool(objectPosts)
  const byType = (type: string) => objectPosts.find((p) => p.type === type)
  const seq = (key: FilterKey, frames: Frame[], predicted = new Map<number, { x: number; y: number }>()): Sequence => ({ key, frames, predicted })
  const composite = byType('composite')
  const difference = byType('difference')
  return {
    original: seq('original', post.frames.length ? post.frames : [coverFrame(post)], new Map(post.marks.map((m) => [m.frame, { x: m.x, y: m.y }]))),
    warm: seq('warm', pool.filter((f) => f.band === 'D5' || f.band === 'D6')),
    rainbow: seq('rainbow', composite ? (composite.frames.length ? composite.frames : [coverFrame(composite)]) : []),
    water: seq(
      'water',
      pool.filter((f) => {
        const c = centre(f)
        return c !== null && c >= 2.6 && c <= 3.4
      }),
    ),
    changed: seq('changed', difference ? (difference.frames.length ? difference.frames : [coverFrame(difference)]) : []),
  }
}

export function nearestByWavelength(pool: Frame[], um: number): Frame | null {
  let best: Frame | null = null
  let d = Infinity
  for (const f of pool) {
    const c = centre(f)
    if (c === null) continue
    const dd = Math.abs(c - um)
    if (dd < d) {
      d = dd
      best = f
    }
  }
  return best
}
