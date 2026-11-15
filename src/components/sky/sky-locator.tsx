'use client'

import { useTranslations } from 'next-intl'
import { useMemo } from 'react'
import { hammer } from '@/lib/explore/healpix'

const W = 360
const H = 180
const D2R = Math.PI / 180
const NCP_RA = 192.85948
const NCP_DEC = 27.12825
const NCP_L = 122.93192

function project(ra: number, dec: number): [number, number] {
  const [x, y] = hammer(ra, dec)
  return [W / 2 + x * (W / 2 - 2), H / 2 - y * (H / 2 - 2)]
}

function line(points: [number, number][]): string {
  let d = ''
  let last: [number, number] | null = null
  for (const [ra, dec] of points) {
    const [x, y] = project(ra, dec)
    d += `${last && Math.abs(x - last[0]) < W / 4 ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`
    last = [x, y]
  }
  return d
}

function range(from: number, to: number, step: number): number[] {
  const out: number[] = []
  for (let v = from; v <= to; v += step) out.push(v)
  return out
}

function milkyWay(): string {
  return line(
    range(0, 360, 3).map((l) => {
      const a = (NCP_L - l) * D2R
      const dec = Math.asin(Math.cos(NCP_DEC * D2R) * Math.cos(a)) / D2R
      const ra = NCP_RA + Math.atan2(Math.sin(a), -Math.sin(NCP_DEC * D2R) * Math.cos(a)) / D2R
      return [ra, dec] as [number, number]
    }),
  )
}

function grid(): string {
  const parallels = [-60, -30, 0, 30, 60].map((dec) => line(range(-179.9, 179.9, 5).map((ra) => [ra, dec] as [number, number])))
  const meridians = [-120, -60, 0, 60, 120].map((ra) => line(range(-90, 90, 5).map((dec) => [ra, dec] as [number, number])))
  return [...parallels, ...meridians].join('')
}

export function SkyLocator({ ra, dec, name, className, bare = false }: { ra: number; dec: number; name: string; className?: string; bare?: boolean }) {
  const t = useTranslations('sky.map')
  const lines = useMemo(() => ({ grid: grid(), milky: milkyWay() }), [])
  const [x, y] = project(ra, dec)
  const region = dec > 10 ? 'regionNorth' : dec < -10 ? 'regionSouth' : 'regionEquator'
  return (
    <figure className={className}>
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={t('alt', { name, region: t(region) })}>
        <ellipse cx={W / 2} cy={H / 2} rx={W / 2 - 2} ry={H / 2 - 2} fill="var(--color-reels-bg)" stroke="var(--color-spot-star)" strokeOpacity="0.35" />
        <path d={lines.grid} fill="none" stroke="var(--color-spot-star)" strokeOpacity="0.14" strokeWidth="0.6" />
        <path d={lines.milky} fill="none" stroke="var(--color-spot-star)" strokeOpacity="0.22" strokeWidth="9" />
        {!bare && (
          <>
            <text x={W / 2} y={14} textAnchor="middle" fontSize="9" fill="var(--color-spot-star)" fillOpacity="0.75">
              {t('north')}
            </text>
            <text x={W / 2} y={H - 8} textAnchor="middle" fontSize="9" fill="var(--color-spot-star)" fillOpacity="0.75">
              {t('south')}
            </text>
          </>
        )}
        <circle cx={x} cy={y} r={bare ? 22 : 9} fill="none" stroke="var(--color-crosshair)" strokeWidth={bare ? 4 : 1.5} className="origin-center [transform-box:fill-box] motion-safe:animate-ping" />
        <circle cx={x} cy={y} r={bare ? 12 : 4.5} fill="var(--color-crosshair)" stroke="var(--color-reels-bg)" strokeWidth={bare ? 3 : 1.2} />
      </svg>
      {!bare && (
        <figcaption className="mt-1.5 flex flex-wrap items-center justify-center gap-x-4 gap-y-0.5 text-meta opacity-80">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-crosshair" aria-hidden="true" />
            {name}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-4 rounded-full bg-text-secondary opacity-50" aria-hidden="true" />
            {t('milkyWay')}
          </span>
        </figcaption>
      )}
    </figure>
  )
}
