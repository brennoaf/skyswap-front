export const MARK_PHOTOS = 6
export const PASS_GAP_DAYS = 20
export const VISIT_GAP_DAYS = 30 / 1440

type Timed = { mjd: number }

function startsAt(frames: Timed[], gap: number): number[] {
  if (frames.length < 2) return [0]
  const starts = [0]
  for (let i = 1; i < frames.length; i++) if ((frames[i]?.mjd ?? 0) - (frames[i - 1]?.mjd ?? 0) > gap) starts.push(i)
  return starts
}

export const passStarts = (frames: Timed[]) => startsAt(frames, PASS_GAP_DAYS)

export function markPlan(frames: Timed[], n = MARK_PHOTOS): number[] {
  const total = frames.length
  if (total <= n) return frames.map((_, i) => i)
  const last = total - 1
  const starts = startsAt(frames, VISIT_GAP_DAYS)
  if (starts.length < 3) return [...new Set(Array.from({ length: n }, (_, k) => Math.round((k * last) / (n - 1))))]
  const visits = starts.map((a, i) => [a, (starts[i + 1] ?? total) - 1] as const)
  const mid = (v: readonly [number, number]) => ((frames[v[0]]?.mjd ?? 0) + (frames[v[1]]?.mjd ?? 0)) / 2
  let chosen = visits.map((_, i) => i)
  if (visits.length > n) {
    const t0 = mid(visits[0] as readonly [number, number])
    const t1 = mid(visits[visits.length - 1] as readonly [number, number])
    const used = new Set<number>()
    for (let k = 0; k < n; k++) {
      const target = t0 + (k * (t1 - t0)) / (n - 1)
      let best = -1
      visits.forEach((v, i) => {
        if (!used.has(i) && (best < 0 || Math.abs(mid(v) - target) < Math.abs(mid(visits[best] as readonly [number, number]) - target))) best = i
      })
      used.add(best)
    }
    chosen = [...used].sort((a, b) => a - b)
  }
  return chosen.map((i) => {
    const [a, b] = visits[i] as readonly [number, number]
    return a === 0 ? 0 : b === last ? last : Math.round((a + b) / 2)
  })
}
