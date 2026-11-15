export type Levels = { lo: number; hi: number }

const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2
}

export function bandLevels(frames: readonly { band: string; lo: number; hi: number }[]): Map<string, Levels> {
  const groups = new Map<string, { lo: number[]; hi: number[] }>()
  for (const f of frames) {
    if (!Number.isFinite(f.lo) || !Number.isFinite(f.hi)) continue
    const g = groups.get(f.band) ?? { lo: [], hi: [] }
    g.lo.push(f.lo)
    g.hi.push(f.hi)
    groups.set(f.band, g)
  }
  const out = new Map<string, Levels>()
  for (const [band, g] of groups) {
    const lo = median(g.lo)
    const hi = median(g.hi)
    out.set(band, { lo, hi: hi > lo ? hi : lo + 1 })
  }
  return out
}
