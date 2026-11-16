export type TrackKind = 'solid' | 'accent' | 'faint'
export type TrackSegment = { from: number; to: number; kind: TrackKind }
export type TrackLayout = { positions: number[]; segments: TrackSegment[] }

const GAP_UNITS = 2.5
export const PASS_GAP_DAYS = 20

export function passGroups(days: number[], gap = PASS_GAP_DAYS): number[] {
  return days.map((_, i) => i).filter((i) => i === 0 || (days[i] ?? 0) - (days[i - 1] ?? 0) > gap)
}

export function passLayout(days: number[], gap = PASS_GAP_DAYS): TrackLayout {
  const n = days.length
  if (n === 0) return { positions: [], segments: [] }
  if (n === 1) return { positions: [0.5], segments: [{ from: 0, to: 1, kind: 'solid' }] }
  const starts = passGroups(days, gap)
  const units: number[] = []
  let group = -1
  for (let i = 0; i < n; i++) {
    if (starts.includes(i)) group++
    units.push(i + group * GAP_UNITS)
  }
  const total = units[n - 1] || 1
  const positions = units.map((u) => u / total)
  const segments = starts.map((s, g) => {
    const end = (starts[g + 1] ?? n) - 1
    return { from: positions[s] ?? 0, to: positions[end] ?? 0, kind: 'solid' as const }
  })
  return { positions, segments }
}

export function nearestIndex(positions: number[], at: number): number {
  let best = 0
  positions.forEach((p, i) => {
    if (Math.abs(p - at) < Math.abs((positions[best] ?? 0) - at)) best = i
  })
  return best
}
