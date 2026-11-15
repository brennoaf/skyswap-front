export interface Scale {
  (v: number): number
  domain: [number, number]
  ticks: number[]
}

export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return []
  if (min === max) return [min]
  const span = max - min
  const step0 = span / count
  const mag = 10 ** Math.floor(Math.log10(step0))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) ?? mag * 10
  const out: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(Number(v.toPrecision(12)))
  return out
}

export function linear(domain: [number, number], range: [number, number], ticks = 5, pad = 0.04): Scale {
  let [d0, d1] = domain
  if (d0 === d1) {
    d0 -= 1
    d1 += 1
  }
  const p = (d1 - d0) * pad
  d0 -= p
  d1 += p
  const [r0, r1] = range
  const f = ((v: number) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0)) as Scale
  f.domain = [d0, d1]
  f.ticks = niceTicks(Math.min(d0, d1), Math.max(d0, d1), ticks)
  return f
}

export const BAND_EDGES: Record<string, [number, number]> = {
  D1: [0.75, 1.105],
  D2: [1.105, 1.645],
  D3: [1.645, 2.42],
  D4: [2.42, 3.825],
  D5: [3.825, 4.42],
  D6: [4.42, 5.01],
}

export function nearestIndex(points: readonly { x: number; y: number }[], px: number, py: number): number {
  let best = -1
  let dist = Infinity
  points.forEach((p, i) => {
    const d = (p.x - px) ** 2 + (p.y - py) ** 2
    if (d < dist) {
      dist = d
      best = i
    }
  })
  return best
}

const MONTH_STEPS = [1, 2, 3, 4, 6, 12, 24, 60, 120]

export function monthTicks(from: number, to: number, max = 4): number[] {
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return []
  const a = new Date(from)
  const b = new Date(to)
  const startOfA = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), 1)
  const first = a.getUTCFullYear() * 12 + a.getUTCMonth() + (startOfA === from ? 0 : 1)
  const last = b.getUTCFullYear() * 12 + b.getUTCMonth()
  if (last < first) return []
  const step = MONTH_STEPS.find((s) => Math.floor((last - first) / s) + 1 <= max) ?? 120
  const out: number[] = []
  for (let m = first; m <= last; m += step) out.push(Date.UTC(Math.floor(m / 12), m % 12, 1))
  return out
}

export function formatMonthYear(ms: number, locale: string): string {
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' }).replace(/ de /g, ' ')
}

export function logTicks(min: number, max: number): number[] {
  if (!(min > 0) || !Number.isFinite(max) || max < min) return []
  const lo = Math.floor(Math.log10(min))
  const hi = Math.ceil(Math.log10(max))
  const pick = (mults: number[]) => {
    const out: number[] = []
    for (let e = lo; e <= hi; e++) {
      for (const m of mults) {
        const v = Number((m * 10 ** e).toPrecision(12))
        if (v >= min * (1 - 1e-9) && v <= max * (1 + 1e-9)) out.push(v)
      }
    }
    return out
  }
  const decades = pick([1])
  if (decades.length >= 3) return decades
  const fine = pick([1, 2, 5])
  if (fine.length <= 6) return fine
  const thirds = pick([1, 3])
  return thirds.length ? thirds : decades
}

export interface Residual {
  dx: number
  dy: number
  err: number
}

export function residualExtent(points: readonly Residual[], margin: number | null): { half: number; outside: number } {
  const reach = points.map((p) => Math.hypot(p.dx, p.dy) + p.err).sort((a, b) => a - b)
  const robust = reach.length >= 20 ? (reach[Math.min(reach.length - 1, Math.ceil(reach.length * 0.95) - 1)] as number) : (reach[reach.length - 1] ?? 0)
  const half = Math.max(robust, margin ?? 0, 0.05) * 1.2
  const outside = points.filter((p) => Math.max(Math.abs(p.dx), Math.abs(p.dy)) > half).length
  return { half, outside }
}

export function skyOffset(ra: number, dec: number, ra0: number, dec0: number): [number, number] {
  return [(ra - ra0) * Math.cos((dec0 * Math.PI) / 180) * 3600, (dec - dec0) * 3600]
}

export function mixesBatches(releases: readonly (string | null | undefined)[]): boolean {
  const seen = new Set<string>()
  for (const r of releases) for (const part of (r ?? '').toLowerCase().split('+')) if (/^qr\d+$/.test(part)) seen.add(part)
  return seen.size > 1
}
