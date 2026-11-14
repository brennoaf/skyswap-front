import type { Frame, Post } from './api/client'

export const PLAYABLE = new Set(['timelapse', 'long_baseline'])
export const LONG_BASELINE_FPS = 3
export const TIMELAPSE_FPS = 6

const YEAR_MS = 365.25 * 86400000

export function isLongBaseline(post: Pick<Post, 'type'>): boolean {
  return post.type === 'long_baseline'
}

export function telescopeOf(f: Pick<Frame, 'telescope' | 'release'>): string {
  if (f.telescope) return f.telescope
  if (f.release === 'wise') return 'WISE'
  if (f.release === 'neowise') return 'NEOWISE'
  return 'SPHEREx'
}

export function frameYear(f: Pick<Frame, 't'>): number {
  return new Date(f.t).getUTCFullYear()
}

export function yearsSpanned(post: Pick<Post, 'date_range'>): number {
  const [a, b] = post.date_range
  const ms = Date.parse(b ?? '') - Date.parse(a ?? '')
  return Number.isFinite(ms) ? Math.max(1, Math.round(ms / YEAR_MS)) : 0
}

export function hasWise(frames: Pick<Frame, 'telescope' | 'release'>[]): boolean {
  return frames.some((f) => telescopeOf(f) !== 'SPHEREx')
}

export type Segment = { from: number; to: number; kind: 'data' | 'gap' | 'spherex' }

export function eraLayout(frames: Pick<Frame, 't' | 'telescope' | 'release'>[], gapYears = 2) {
  const times = frames.map((f) => Date.parse(f.t))
  const start = Date.UTC(new Date(times[0] ?? Date.now()).getUTCFullYear(), 0, 1)
  const end = Date.UTC(new Date(times[times.length - 1] ?? Date.now()).getUTCFullYear() + 1, 0, 1)
  const span = end - start || 1
  const at = (t: number) => (t - start) / span
  const segments: Segment[] = []
  for (let i = 1; i < times.length; i++) {
    const a = times[i - 1] as number
    const b = times[i] as number
    const spherex = telescopeOf(frames[i - 1] as Frame) === 'SPHEREx' && telescopeOf(frames[i] as Frame) === 'SPHEREx'
    segments.push({ from: at(a), to: at(b), kind: (b - a) / YEAR_MS > gapYears ? 'gap' : spherex ? 'spherex' : 'data' })
  }
  return {
    startYear: new Date(start).getUTCFullYear(),
    endYear: new Date(end).getUTCFullYear() - 1,
    positions: times.map(at),
    segments,
  }
}
