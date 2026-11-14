import type { ReactNode } from 'react'

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
  f.ticks = niceTicks(d0, d1, ticks)
  return f
}

export const PLOT = { w: 343, h: 220, l: 44, r: 10, t: 12, b: 34 }

export function Frame({
  x,
  y,
  xLabel,
  yLabel,
  xFormat = (v) => String(v),
  yFormat = (v) => String(v),
  children,
  height = PLOT.h,
  title,
}: {
  x: Scale
  y: Scale
  xLabel: string
  yLabel: string
  xFormat?: (v: number) => string
  yFormat?: (v: number) => string
  children: ReactNode
  height?: number
  title: string
}) {
  return (
    <svg viewBox={`0 0 ${PLOT.w} ${height}`} className="w-full text-text" role="img" aria-label={title}>
      <g className="text-divider">
        {y.ticks.map((v) => (
          <line key={`y${v}`} x1={PLOT.l} x2={PLOT.w - PLOT.r} y1={y(v)} y2={y(v)} stroke="currentColor" strokeWidth="0.5" />
        ))}
      </g>
      <g className="fill-text-secondary text-chart">
        {y.ticks.map((v) => (
          <text key={`yt${v}`} x={PLOT.l - 5} y={y(v) + 3} textAnchor="end">
            {yFormat(v)}
          </text>
        ))}
        {x.ticks.map((v) => (
          <text key={`xt${v}`} x={x(v)} y={height - PLOT.b + 13} textAnchor="middle">
            {xFormat(v)}
          </text>
        ))}
        <text x={(PLOT.l + PLOT.w - PLOT.r) / 2} y={height - 4} textAnchor="middle">
          {xLabel}
        </text>
        <text x={10} y={(PLOT.t + height - PLOT.b) / 2} textAnchor="middle" transform={`rotate(-90 10 ${(PLOT.t + height - PLOT.b) / 2})`}>
          {yLabel}
        </text>
      </g>
      <line x1={PLOT.l} x2={PLOT.w - PLOT.r} y1={height - PLOT.b} y2={height - PLOT.b} stroke="currentColor" strokeOpacity="0.4" strokeWidth="0.75" />
      <defs>
        <clipPath id={`clip-${title.replace(/\W/g, '')}`}>
          <rect x={PLOT.l} y={PLOT.t - 4} width={PLOT.w - PLOT.l - PLOT.r} height={height - PLOT.t - PLOT.b + 8} />
        </clipPath>
      </defs>
      <g clipPath={`url(#clip-${title.replace(/\W/g, '')})`}>{children}</g>
    </svg>
  )
}

export function Legend({ items }: { items: { color: string; label: string; hollow?: boolean }[] }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-meta text-text-secondary">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-full" style={i.hollow ? { border: `1.5px solid ${i.color}` } : { background: i.color }} />
          {i.label}
        </li>
      ))}
    </ul>
  )
}
