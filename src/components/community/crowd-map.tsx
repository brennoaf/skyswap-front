'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Segmented, Switch } from '@/components/ui/primitives'
import type { FindingDetail } from '@/lib/api/client'
import { buildSpotCard } from '@/lib/explore/sky-card'
import { cssColor } from '@/lib/format'
import { referenceGrid } from '@/lib/sky'
import { useFmt } from '@/lib/use-fmt'

type Tracks = NonNullable<FindingDetail['tracks']>
type Point = { u: number; v: number }

const PIXEL_ARCSEC = 6.15
const BLOB = 0.08
const MIN_SIDE = 0.3
const HEAT_ALPHA = 0.1

function useSpriteImage(finding: FindingDetail, tracks: Tracks) {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const spot = tracks.spot
  const sprite = finding.sprite
  useEffect(() => {
    let live = true
    const load = (src: string) => {
      const el = new Image()
      el.onload = () => live && setImg(el)
      el.src = src
    }
    if (sprite) load(sprite)
    else if (spot)
      void buildSpotCard(spot, null, () => live).then((draft) => {
        if (!draft || !live) return
        const c = document.createElement('canvas')
        c.width = draft.pixels.width
        c.height = draft.pixels.height
        const ctx = c.getContext('2d')
        if (!ctx) return
        ctx.putImageData(new ImageData(new Uint8ClampedArray(draft.pixels.data), draft.pixels.width, draft.pixels.height), 0, 0)
        load(c.toDataURL('image/png'))
      })
    return () => {
      live = false
    }
  }, [sprite, spot])
  return img
}

const mean = (pts: Point[]): Point | null => (pts.length ? { u: pts.reduce((s, p) => s + p.u, 0) / pts.length, v: pts.reduce((s, p) => s + p.v, 0) / pts.length } : null)

export function crowdStats(tracks: Tracks, arcsecPerPx: number) {
  const size = tracks.size_px
  const frames = tracks.frames.map((f) => {
    const m = mean(f.points)
    const spread = m && f.points.length > 1 ? Math.sqrt(f.points.reduce((s, p) => s + (p.u - m.u) ** 2 + (p.v - m.v) ** 2, 0) / f.points.length) : 0
    return { mjd: f.mjd, mean: m, n: f.points.length, margin: m ? ((spread * size) / Math.sqrt(Math.max(1, f.points.length))) * arcsecPerPx : null }
  })
  const used = frames.filter((f): f is (typeof frames)[number] & { mean: Point } => !!f.mean)
  let speed: number | null = null
  let direction: string | null = null
  if (used.length >= 2) {
    const hours = used.map((f) => f.mjd * 24)
    const th = hours.reduce((s, h) => s + h, 0) / hours.length
    const vt = hours.reduce((s, h) => s + (h - th) ** 2, 0)
    if (vt > 0) {
      const slope = (pick: (p: Point) => number) => {
        const m = used.reduce((s, f) => s + pick(f.mean), 0) / used.length
        return used.reduce((s, f, i) => s + ((hours[i] as number) - th) * (pick(f.mean) - m), 0) / vt
      }
      speed = Math.hypot(slope((p) => p.u), slope((p) => p.v)) * size * arcsecPerPx
    }
    const first = (used[0] as (typeof used)[number]).mean
    const last = (used[used.length - 1] as (typeof used)[number]).mean
    const dx = last.u - first.u
    const dy = last.v - first.v
    const big = Math.max(Math.abs(dx), Math.abs(dy))
    if (big > 0) {
      const vert = Math.abs(dy) >= MIN_SIDE * big ? (dy < 0 ? 'up' : 'down') : ''
      const horiz = Math.abs(dx) >= MIN_SIDE * big ? (dx < 0 ? 'Left' : 'Right') : ''
      direction = vert ? `${vert}${horiz}` : horiz.toLowerCase()
    }
  }
  const margins = frames.flatMap((f) => (f.margin !== null ? [f.margin] : []))
  return { frames, speed, direction, margin: margins.length ? margins.reduce((s, m) => s + m, 0) / margins.length : null }
}

function positionsCsv(tracks: Tracks, stats: ReturnType<typeof crowdStats>): string | null {
  const spot = tracks.spot
  if (!spot) return null
  const grid = referenceGrid(spot.ra, spot.dec, spot.fov_deg)
  const rows = ['utc,ra_deg,dec_deg,margin_arcsec,marks']
  for (const f of stats.frames) {
    if (!f.mean) continue
    const [ra, dec] = grid.wcs.pix2world(f.mean.u * grid.n - 0.5, (1 - f.mean.v) * grid.n - 0.5) as [number, number]
    const utc = new Date((f.mjd - 40587) * 86400000).toISOString()
    rows.push([utc, ra.toFixed(6), dec.toFixed(6), (f.margin ?? 0).toFixed(2), f.n].join(','))
  }
  return rows.join('\n')
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

function knownLine(finding: FindingDetail): string | null {
  const asteroid = finding.checks.find((c) => c.service === 'asteroids' && c.result === 'found')?.names[0]
  if (asteroid) return asteroid
  return finding.checks.find((c) => c.result === 'found' && c.names.length)?.names[0] ?? null
}

export function CrowdMap({ finding }: { finding: FindingDetail }) {
  const tracks = finding.tracks
  if (!tracks) return null
  return <CrowdMapView finding={finding} tracks={tracks} />
}

function CrowdMapView({ finding, tracks }: { finding: FindingDetail; tracks: Tracks }) {
  const t = useTranslations('community.crowd')
  const fmt = useFmt()
  const img = useSpriteImage(finding, tracks)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [frame, setFrame] = useState(0)
  const [heat, setHeat] = useState(true)
  const arcsecPerPx = tracks.spot ? PIXEL_ARCSEC : (finding.fov_deg * 3600) / Math.max(1, tracks.size_px)
  const stats = useMemo(() => crowdStats(tracks, arcsecPerPx), [arcsecPerPx, tracks])
  const csv = useMemo(() => positionsCsv(tracks, stats), [stats, tracks])
  const known = knownLine(finding)

  useEffect(() => {
    const c = canvas.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx || !img) return
    const tile = Math.round(img.naturalHeight / 2)
    const W = 480
    c.width = W
    c.height = W
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, W, W)
    ctx.drawImage(img, frame * tile, 0, tile, tile, 0, 0, W, W)
    if (!heat) return
    const warm = cssColor('--color-warning', '#ffaa28')
    const ring = cssColor('--color-on-media', '#ffffff')
    const mine = cssColor('--color-accent', '#0098fe')
    const edge = cssColor('--color-mark-halo', '#000000')
    const here = tracks.frames[frame]
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = HEAT_ALPHA
    for (const p of here?.points ?? []) {
      const g = ctx.createRadialGradient(p.u * W, p.v * W, 0, p.u * W, p.v * W, BLOB * W)
      g.addColorStop(0, warm)
      g.addColorStop(1, 'transparent')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(p.u * W, p.v * W, BLOB * W, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    const means = stats.frames.flatMap((f) => (f.mean ? [f.mean] : []))
    if (means.length > 1) {
      ctx.setLineDash([8, 6])
      ctx.strokeStyle = ring
      ctx.globalAlpha = 0.7
      ctx.lineWidth = 2
      ctx.beginPath()
      means.forEach((m, i) => (i ? ctx.lineTo(m.u * W, m.v * W) : ctx.moveTo(m.u * W, m.v * W)))
      ctx.stroke()
      ctx.setLineDash([])
      ctx.globalAlpha = 1
    }
    const m = stats.frames[frame]?.mean
    if (m) {
      ctx.strokeStyle = ring
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.arc(m.u * W, m.v * W, 11, 0, Math.PI * 2)
      ctx.stroke()
    }
    if (here?.mine) {
      ctx.fillStyle = mine
      ctx.strokeStyle = edge
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(here.mine.u * W, here.mine.v * W, 6, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
  }, [frame, heat, img, stats, tracks])

  const rows: [string, string][] = [
    ...(stats.speed !== null ? [[t('speed'), t('speedValue', { v: fmt.fixed(stats.speed, stats.speed < 10 ? 1 : 0) })] as [string, string]] : []),
    ...(stats.direction ? [[t('direction'), t(`dir.${stats.direction}`)] as [string, string]] : []),
    ...(stats.margin !== null ? [[t('margin'), t('marginValue', { v: fmt.fixed(stats.margin, 1) })] as [string, string]] : []),
    [t('catalogs'), known ? t('known', { name: known }) : t('unknown')],
  ]

  return (
    <section className="px-4 pt-5" data-testid="crowd-map">
      <div className="relative aspect-square w-full overflow-hidden rounded-[20px] bg-reels-bg shadow-[0_0_0_1px_var(--color-divider)]">
        <canvas ref={canvas} role="img" aria-label={t('alt', { n: frame + 1 })} className="pixelated block size-full" />
      </div>
      {tracks.frames.length > 1 && (
        <Segmented
          label={t('photos')}
          value={String(frame)}
          options={tracks.frames.map((_, i) => ({ value: String(i), label: t('photo', { n: i + 1 }) }))}
          onChange={(v) => setFrame(Number(v))}
          className="mt-3"
        />
      )}
      <label className="mt-3 flex min-h-11 items-center gap-3">
        <span className="min-w-0 flex-1 text-body">{t('heat')}</span>
        <Switch checked={heat} onChange={(e) => setHeat(e.target.checked)} />
      </label>
      <p className="mt-3 inline-flex rounded-full bg-surface px-3 py-1.5 text-ui font-semibold text-link">{t('people', { n: tracks.people })}</p>
      {tracks.you && <h2 className="mt-3 text-title-lg font-bold leading-tight">{t('you')}</h2>}
      <p className="mt-2 text-body leading-snug text-text-secondary">{t('how')}</p>
      <dl className="mt-4 divide-y-[0.5px] divide-divider overflow-hidden rounded-2xl bg-surface">
        {rows.map(([k, v]) => (
          <div key={k} className="flex min-h-12 items-center justify-between gap-4 px-4 py-2">
            <dt className="text-body text-text-secondary">{k}</dt>
            <dd className="text-right text-body font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      {csv && (
        <Button full className="mt-4 h-11" onClick={() => download(`${finding.id}-positions.csv`, csv)}>
          {t('download')}
        </Button>
      )}
    </section>
  )
}
