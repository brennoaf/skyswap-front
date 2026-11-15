'use client'

import { useTranslations } from 'next-intl'
import { useMemo } from 'react'
import { hammer } from '@/lib/explore/healpix'
import { cx } from '@/lib/format'

const W = 360
const H = 180
const D2R = Math.PI / 180
const NCP_RA = 192.85948
const NCP_DEC = 27.12825
const NCP_L = 122.93192
const MILKY_LABEL_L = 75
const CUE_CLEARANCE = 30

const ASTERISMS: { key: 'orion' | 'crux'; stars: [number, number][] }[] = [
  {
    key: 'orion',
    stars: [
      [88.79, 7.41],
      [81.28, 6.35],
      [83.0, -0.3],
      [84.05, -1.2],
      [85.19, -1.94],
      [78.63, -8.2],
      [86.94, -9.67],
    ],
  },
  {
    key: 'crux',
    stars: [
      [186.65, -63.1],
      [191.93, -59.69],
      [187.79, -57.11],
      [183.79, -58.75],
    ],
  },
]

export function skyRegion(dec: number): 'regionNorth' | 'regionSouth' | 'regionEquator' {
  return dec > 10 ? 'regionNorth' : dec < -10 ? 'regionSouth' : 'regionEquator'
}

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

function galacticPlane(l: number): [number, number] {
  const a = (NCP_L - l) * D2R
  const dec = Math.asin(Math.cos(NCP_DEC * D2R) * Math.cos(a)) / D2R
  const ra = NCP_RA + Math.atan2(Math.sin(a), -Math.sin(NCP_DEC * D2R) * Math.cos(a)) / D2R
  return [ra, dec]
}

function grid(): string {
  const parallels = [-60, -30, 30, 60].map((dec) => line(range(-179.9, 179.9, 5).map((ra) => [ra, dec] as [number, number])))
  const meridians = [-120, -60, 0, 60, 120].map((ra) => line(range(-90, 90, 5).map((dec) => [ra, dec] as [number, number])))
  return [...parallels, ...meridians].join('')
}

function build() {
  return {
    grid: grid(),
    equator: line(range(-179.9, 179.9, 5).map((ra) => [ra, 0] as [number, number])),
    milky: line(range(0, 360, 3).map(galacticPlane)),
    milkyLabel: project(...galacticPlane(MILKY_LABEL_L)),
    cues: ASTERISMS.map((a) => {
      const stars = a.stars.map(([ra, dec]) => project(ra, dec))
      const cx0 = stars.reduce((s, p) => s + p[0], 0) / stars.length
      const top = Math.min(...stars.map((p) => p[1]))
      return { key: a.key, stars, x: cx0, y: top - 4 }
    }),
  }
}

export function SkyLocator({ ra, dec, name, className, bare = false }: { ra: number; dec: number; name: string; className?: string; bare?: boolean }) {
  const t = useTranslations('sky.map')
  const map = useMemo(build, [])
  const [x, y] = project(ra, dec)
  const region = skyRegion(dec)
  const star = 'var(--color-spot-star)'
  const side = x < W / 3 ? 'left' : x > (2 * W) / 3 ? 'right' : 'center'
  const below = y < H * 0.3
  return (
    <figure className={cx('relative', className)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={t('alt', { name, region: t(region) })}>
        <ellipse cx={W / 2} cy={H / 2} rx={W / 2 - 2} ry={H / 2 - 2} fill="var(--color-reels-bg)" stroke={star} strokeOpacity="0.35" />
        <path d={map.grid} fill="none" stroke={star} strokeOpacity="0.12" strokeWidth="0.6" />
        <path d={map.equator} fill="none" stroke={star} strokeOpacity="0.3" strokeWidth="0.6" strokeDasharray="2 3" />
        <path d={map.milky} fill="none" stroke={star} strokeOpacity="0.2" strokeWidth="10" />
        {!bare && (
          <g fill={star} fontSize="8.5">
            <text x={W / 2} y={13} textAnchor="middle" fillOpacity="0.8">
              {t('north')}
            </text>
            <text x={W / 2} y={H - 7} textAnchor="middle" fillOpacity="0.8">
              {t('south')}
            </text>
            <text x={map.milkyLabel[0]} y={map.milkyLabel[1] - 8} textAnchor="middle" fillOpacity="0.6">
              {t('milkyWay')}
            </text>
            {map.cues
              .filter((c) => Math.hypot(c.x - x, c.y - y) > CUE_CLEARANCE)
              .map((c) => (
                <g key={c.key} fillOpacity="0.8">
                  {c.stars.map(([sx, sy], i) => (
                    <circle key={i} cx={sx} cy={sy} r="0.9" />
                  ))}
                  <text x={c.x} y={c.y} textAnchor="middle">
                    {t(`cues.${c.key}`)}
                  </text>
                </g>
              ))}
          </g>
        )}
        <circle cx={x} cy={y} r={bare ? 22 : 10} fill="none" stroke="var(--color-crosshair)" strokeWidth={bare ? 4 : 1.5} className="origin-center [transform-box:fill-box] motion-safe:animate-ping" />
        {!bare && <circle cx={x} cy={y} r="10" fill="none" stroke="var(--color-crosshair)" strokeOpacity="0.6" strokeWidth="1.2" />}
        <circle cx={x} cy={y} r={bare ? 12 : 5.5} fill="var(--color-crosshair)" stroke="var(--color-reels-bg)" strokeWidth={bare ? 3 : 1.4} />
      </svg>
      {!bare && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute whitespace-nowrap rounded-full border-[0.5px] border-crosshair bg-reels-bg px-2 py-0.5 text-meta font-medium"
          style={{ color: star, left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%`, marginTop: below ? 14 : -36, transform: side === 'left' ? 'translateX(-12px)' : side === 'right' ? 'translateX(calc(-100% + 12px))' : 'translateX(-50%)' }}
        >
          {t(region)}
        </span>
      )}
    </figure>
  )
}
