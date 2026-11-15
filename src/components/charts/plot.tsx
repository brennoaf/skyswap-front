import { useId, type ReactNode } from 'react'
import type { Scale } from '@/components/charts/chart-math'

export { linear, niceTicks, type Scale } from '@/components/charts/chart-math'

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
  xEnds,
  yEnds,
  onPick,
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
  xEnds?: [string, string]
  yEnds?: [string, string]
  onPick?: (x: number, y: number) => void
}) {
  const clip = useId()
  const midY = (PLOT.t + height - PLOT.b) / 2
  return (
    <svg
      viewBox={`0 0 ${PLOT.w} ${height}`}
      className="w-full touch-manipulation select-none text-text"
      role="img"
      aria-label={title}
      onClick={
        onPick
          ? (e) => {
              const r = e.currentTarget.getBoundingClientRect()
              if (r.width && r.height) onPick(((e.clientX - r.left) * PLOT.w) / r.width, ((e.clientY - r.top) * height) / r.height)
            }
          : undefined
      }
    >
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
        {xEnds && (
          <g fillOpacity="0.75">
            <text x={PLOT.l} y={height - 4} textAnchor="start">
              {xEnds[0]}
            </text>
            <text x={PLOT.w - PLOT.r} y={height - 4} textAnchor="end">
              {xEnds[1]}
            </text>
          </g>
        )}
        <text x={10} y={midY} textAnchor="middle" transform={`rotate(-90 10 ${midY})`}>
          {yLabel}
        </text>
        {yEnds && (
          <g fillOpacity="0.75">
            <text x={10} y={height - PLOT.b} textAnchor="start" transform={`rotate(-90 10 ${height - PLOT.b})`}>
              {yEnds[0]}
            </text>
            <text x={10} y={PLOT.t} textAnchor="end" transform={`rotate(-90 10 ${PLOT.t})`}>
              {yEnds[1]}
            </text>
          </g>
        )}
      </g>
      <line x1={PLOT.l} x2={PLOT.w - PLOT.r} y1={height - PLOT.b} y2={height - PLOT.b} stroke="currentColor" strokeOpacity="0.4" strokeWidth="0.75" />
      <defs>
        <clipPath id={clip}>
          <rect x={PLOT.l} y={PLOT.t - 4} width={PLOT.w - PLOT.l - PLOT.r} height={height - PLOT.t - PLOT.b + 8} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>{children}</g>
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
