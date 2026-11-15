'use client'

import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Crosshair } from '@/components/feed/post-media'
import { skyHref } from '@/components/feed/spot-sheet'
import { IconCrosshair, IconPause, IconPlay, IconStepBack, IconStepForward, IconWarning } from '@/components/icons'
import { dotPositions, FrameTimeline } from '@/components/classify/photo-viewer'
import { SkyLocator } from '@/components/sky/sky-locator'
import { BandTile } from '@/components/ui/band-tile'
import { CatalogLinks } from '@/components/ui/catalog-links'
import { Button, Chip, EmptyState, IconButton, Notice, ObjectAvatar, Segmented, Skeleton, useLoopRestart } from '@/components/ui/primitives'
import { QrWarning } from '@/components/charts/charts'
import type { SkyResult } from '@/lib/api/client'
import { useObject, useSky } from '@/lib/api/hooks'
import { BAND_HUE, BANDS, cssColor, formatBytes, formatShortDate, cx } from '@/lib/format'
import { parseFitsImage, percentile, propagate, referenceGrid, skyMovie, stretch, type IndexRow } from '@/lib/sky'
import { pointHits, askServer } from '@/lib/explore/lookup'
import { differenceGrey, differenceImages, differenceScale } from '@/lib/explore/sky-card'
import { tileFetch } from '@/lib/explore/tiles'
import { useUi } from '@/lib/state/ui'

export const FOVS = [0.05, 0.1, 0.25, 0.5] as const
export const INDEX_BASE = '/kit/index/'
const CUTOUTS = 6
const BASE_FPS = 4

type ViewFrame = { key: string; img: Float32Array; w: number; h: number; mjd: number; band: string; release: string; lo: number; hi: number }
type Colormap = 'grey' | 'band'
type View = 'photos' | 'changes'
type Status = 'idle' | 'building' | 'ready' | 'error'

export type SkyParams = { ra: number; dec: number; fov: number; band: string | null; name: string | null; obj: string | null }

export type SkyTarget = { ra: number; dec: number; epoch: number; pmra: number; pmdec: number }

const mjdToMs = (mjd: number) => (mjd - 40587) * 86400000

function maxEpochsFor(fov: number) {
  return fov <= 0.1 ? 48 : 24
}

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function toFrame(key: string, img: Float32Array, w: number, h: number, mjd: number, band: string, release: string): ViewFrame {
  const lo = percentile(img, 1)
  const top = percentile(img, 99.5)
  return { key, img, w, h, mjd, band, release, lo, hi: top > lo ? top : lo + 1 }
}

function spread<T>(list: T[], n: number): T[] {
  if (list.length <= n) return list
  return Array.from({ length: n }, (_, i) => list[Math.round((i * (list.length - 1)) / (n - 1))] as T)
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

function FrameCanvas({ frame, colormap, label, diff }: { frame: ViewFrame; colormap: Colormap; label: string; diff: { img: Float32Array; scale: number } | null }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    c.width = frame.w
    c.height = frame.h
    const ctx = c.getContext('2d')
    if (!ctx) return
    const grey = diff ? Uint8ClampedArray.from(diff.img, (d) => differenceGrey(d, diff.scale)) : stretch(frame.img, frame.lo, frame.hi)
    const out = ctx.createImageData(frame.w, frame.h)
    const [r, g, b] = colormap === 'band' && !diff ? hexRgb(cssColor(`--color-band-${frame.band.toLowerCase()}`)) : [255, 255, 255]
    for (let y = 0; y < frame.h; y++) {
      for (let x = 0; x < frame.w; x++) {
        const v = grey[(frame.h - 1 - y) * frame.w + x] ?? 0
        const o = (y * frame.w + x) * 4
        out.data[o] = (v * r) / 255
        out.data[o + 1] = (v * g) / 255
        out.data[o + 2] = (v * b) / 255
        out.data[o + 3] = 255
      }
    }
    ctx.putImageData(out, 0, 0)
  }, [frame, colormap, diff])
  return <canvas ref={ref} role="img" aria-label={label} className="pixelated absolute inset-0 size-full object-contain" />
}

function useBuilder(sky: SkyResult, p: SkyParams, target: SkyTarget | null) {
  const [frames, setFrames] = useState<ViewFrame[]>([])
  const [status, setStatus] = useState<Status>('idle')
  const [errorKey, setErrorKey] = useState<'failed' | 'noFrames' | 'cutoutsFailed'>('failed')
  const [done, setDone] = useState(0)
  const [latest, setLatest] = useState<string | null>(null)
  const [ms, setMs] = useState<number | null>(null)
  const [bytes, setBytes] = useState<number | null>(null)
  const [tile, setTile] = useState<{ loaded: number; total: number | null } | null>(null)
  const [scanning, setScanning] = useState(false)
  const [firstMs, setFirstMs] = useState<number | null>(null)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const maxEpochs = maxEpochsFor(p.fov)
  const total = sky.source === 'sia' ? Math.min(CUTOUTS, sky.images.length) : Math.min(maxEpochs, sky.total)

  const t0Ref = useRef(0)
  const add = useCallback((f: ViewFrame) => {
    if (!alive.current) return
    setFirstMs((v) => v ?? Math.round(performance.now() - t0Ref.current))
    setScanning(false)
    setFrames((prev) => [...prev, f].sort((a, b) => a.mjd - b.mjd))
    setLatest(f.key)
    setDone((d) => d + 1)
  }, [])

  const finish = useCallback((count: number, t0: number, failKey: 'noFrames' | 'cutoutsFailed') => {
    if (!alive.current) return
    setScanning(false)
    setMs(Math.round(performance.now() - t0))
    if (count) setStatus('ready')
    else {
      setErrorKey(failKey)
      setStatus('error')
    }
  }, [])

  const start = useCallback(async () => {
    setFrames([])
    setDone(0)
    setLatest(null)
    setMs(null)
    setBytes(null)
    setTile(null)
    setFirstMs(null)
    setStatus('building')
    const t0 = performance.now()
    t0Ref.current = t0
    let count = 0
    if (sky.source === 'sia') {
      const picks = spread([...sky.images].sort((a, b) => a.mjd - b.mjd), CUTOUTS)
      const size = Math.min(0.25, p.fov)
      let next = 0
      let read = 0
      const worker = async () => {
        while (next < picks.length && alive.current) {
          const im = picks[next++]
          if (!im) continue
          try {
            const q = new URLSearchParams({ key: im.key, ra: String(p.ra), dec: String(p.dec), size: String(size) })
            const r = await fetch(`/api/cutout?${q}`)
            if (!r.ok) throw new Error(String(r.status))
            const buf = await r.arrayBuffer()
            read += buf.byteLength
            const fits = parseFitsImage(buf, 'IMAGE')
            count++
            add(toFrame(im.key, fits.data, fits.nx, fits.ny, im.mjd, im.band, im.release))
          } catch {
            if (alive.current) setDone((d) => d + 1)
          }
        }
      }
      await Promise.all([worker(), worker()])
      if (alive.current) setBytes(read)
      finish(count, t0, 'cutoutsFailed')
      return
    }
    try {
      let hits: IndexRow[] | null = null
      if (sky.cell !== null) {
        let last = 0
        if (askServer(sky.cell, sky.tile_bytes)) setScanning(true)
        const r = await pointHits(p.ra, p.dec, sky.tile_bytes, (loaded, size) => {
          const now = performance.now()
          if (now - last < 120 && loaded !== size) return
          last = now
          if (alive.current) setTile({ loaded, total: size ?? sky.tile_bytes })
        }).catch(() => null)
        hits = r?.hits ?? null
        if (alive.current) {
          setTile(null)
          setScanning(true)
        }
      }
      const result = await skyMovie({
        hits,
        fetchImpl: tileFetch,
        ra: p.ra,
        dec: p.dec,
        target,
        fovDeg: p.fov,
        indexBase: INDEX_BASE,
        maxEpochs,
        mode: 'bilinear',
        bands: p.band ? [p.band] : null,
        onFrame: (_i, f) => {
          const n = Math.round(Math.sqrt(f.img.length))
          count++
          add(toFrame(f.h.key, f.img, n, n, f.h.mjd, f.h.band, f.h.release))
        },
      })
      if (alive.current) setBytes(result.bytes)
      finish(count, t0, 'noFrames')
    } catch {
      if (!alive.current) return
      if (count) finish(count, t0, 'noFrames')
      else {
        setErrorKey('failed')
        setStatus('error')
      }
    }
  }, [sky, p.ra, p.dec, p.fov, p.band, maxEpochs, add, finish, target])

  return { frames, status, errorKey, done, total, latest, ms, bytes, tile, scanning, firstMs, start }
}

function Player({ sky, params, compact, target, onLocate, marker }: { sky: SkyResult; params: SkyParams; compact: boolean; target: SkyTarget | null; onLocate?: (frame: number, x: number, y: number) => void; marker?: ReactNode }) {
  const locale = useLocale()
  const t = useTranslations('sky')
  const tc = useTranslations('common')
  const crosshair = useUi((s) => s.crosshair)
  const setCrosshair = useUi((s) => s.setCrosshair)
  const speed = useUi((s) => s.speed)
  const b = useBuilder(sky, params, target)
  const grid = useMemo(() => referenceGrid(params.ra, params.dec, params.fov), [params.ra, params.dec, params.fov])
  const [cur, setCur] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [colormap, setColormap] = useState<Colormap>('grey')
  const [view, setView] = useState<View>('photos')
  const [ends, setEnds] = useState(false)
  const shown = useMemo(() => (ends && b.frames.length > 2 ? [b.frames[0], b.frames[b.frames.length - 1]].filter((f): f is ViewFrame => !!f) : b.frames), [ends, b.frames])
  const n = shown.length
  const sameGrid = n > 1 && shown.every((f) => f.w === shown[0]?.w && f.h === shown[0]?.h)
  const diffs = useMemo(() => {
    if (view !== 'changes' || !sameGrid || b.status !== 'ready') return null
    const d = differenceImages(shown.map((f) => f.img))
    return { d, scale: differenceScale(d) }
  }, [view, sameGrid, b.status, shown])
  const restart = useLoopRestart(cur, playing)

  useEffect(() => {
    if (b.status !== 'building' || !b.latest) return
    const i = shown.findIndex((f) => f.key === b.latest)
    if (i >= 0) setCur(i)
  }, [b.status, b.latest, shown])

  useEffect(() => {
    if (b.status === 'ready') {
      setCur(0)
      setPlaying(n > 1 && !prefersReducedMotion())
    }
  }, [b.status, n])

  useEffect(() => {
    if (!playing || n < 2) return
    const id = setInterval(() => setCur((c) => (c + 1) % n), 1000 / (BASE_FPS * speed))
    return () => clearInterval(id)
  }, [playing, n, speed])

  const frame = shown[Math.min(cur, n - 1)]
  const diff = diffs ? { img: diffs.d[Math.min(cur, n - 1)] as Float32Array, scale: diffs.scale } : null
  const step = (d: number) => {
    setPlaying(false)
    setCur((c) => (c + d + n) % n)
  }
  const ready = b.status === 'ready' && n > 0
  const date = frame ? formatShortDate(mjdToMs(frame.mjd), locale) : ''
  const frameLabel = frame ? t('frameDate', { date, band: frame.band }) : ''
  const canBuild = sky.source === 'fragment' || (sky.source === 'sia' && sky.images.length > 0)

  const media = (
    <div
      className={cx('relative aspect-square w-full overflow-hidden bg-media-bg text-on-media outline-none focus-visible:ring-2 focus-visible:ring-accent', onLocate && ready && 'cursor-crosshair')}
      role="group"
      aria-label={t('player')}
      onClick={
        onLocate && ready
          ? (e) => {
              const r = e.currentTarget.getBoundingClientRect()
              onLocate(cur, Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)))
            }
          : undefined
      }
      tabIndex={ready ? 0 : -1}
      onKeyDown={(e) => {
        if (!ready) return
        if (e.key === 'ArrowRight') step(1)
        else if (e.key === 'ArrowLeft') step(-1)
        else if (e.key === ' ') {
          e.preventDefault()
          setPlaying((v) => !v)
        }
      }}
      data-build-ms={b.ms ?? undefined}
      data-first-frame-ms={b.firstMs ?? undefined}
      data-frames={n}
    >
      {frame && <FrameCanvas frame={frame} colormap={colormap} diff={diff} label={diff ? t('changesAlt', { date }) : t('frameAlt', { band: frame.band, date })} />}
      {frame && crosshair && <TargetCrosshair frame={frame} target={target} grid={grid} />}
      {marker}
      {b.status === 'idle' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-reels-bg px-6 text-center text-spot-star">
          <SkyLocator ra={params.ra} dec={params.dec} name={params.name ?? t('thisSpot')} className="w-full" />
          {canBuild ? (
            <>
              <Button variant="primary" className="h-11 px-5" onClick={() => void b.start()}>
                <IconPlay size={22} />
                {sky.source === 'sia' ? t('fetchCutouts', { n: b.total }) : t('start')}
              </Button>
              {(sky.source === 'fragment' || compact) && <p className="max-w-72 text-meta text-on-media-muted">{sky.source === 'sia' ? t('siaList') : t('liveNote')}</p>}
            </>
          ) : (
            <p className="text-body text-on-media-muted">{t('none')}</p>
          )}
        </div>
      )}
      {b.status === 'building' && (
        <div className="absolute inset-x-0 bottom-0 bg-media-scrim px-3 py-2" role="status" aria-live="polite">
          <p className="text-note">
            {b.tile
              ? b.tile.total
                ? t('readingIndex', { loaded: formatBytes(b.tile.loaded), total: formatBytes(b.tile.total) })
                : t('readingIndexNoSize', { loaded: formatBytes(b.tile.loaded) })
              : b.scanning
                ? t('scanningIndex', { n: sky.total })
                : sky.source === 'sia'
                ? t('fetchingCutouts', { done: b.done, total: b.total })
                : t('building', { done: b.done, total: b.total })}
          </p>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-on-media/20">
            <div
              className="h-full bg-accent transition-[width]"
              style={{ width: `${b.tile ? (b.tile.total ? Math.min(100, (b.tile.loaded / b.tile.total) * 100) : 5) : b.total ? Math.min(100, (b.done / b.total) * 100) : 0}%` }}
            />
          </div>
        </div>
      )}
      {b.status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-media-scrim px-8 text-center" role="alert">
          <p className="text-body">{t(b.errorKey)}</p>
          <Button variant="primary" onClick={() => void b.start()}>
            {tc('retry')}
          </Button>
        </div>
      )}
    </div>
  )

  const playButton = (
    <IconButton label={playing ? t('pause') : t('play')} onClick={() => setPlaying((v) => !v)} disabled={!ready || n < 2}>
      {playing ? <IconPause size={28} /> : <IconPlay size={28} />}
    </IconButton>
  )

  if (compact) {
    return (
      <div>
        {media}
        <div className="flex items-center gap-1 px-1 py-1">
          {playButton}
          <p className="min-w-0 flex-1 truncate text-note" aria-live="off">
            {frame ? frameLabel : t('images', { n: sky.total })}
          </p>
          <a href={skyHref(params)} target="_blank" rel="noopener" className="inline-flex min-h-11 shrink-0 items-center px-2 text-note font-semibold text-link">
            {t('openInSkySwap')}
          </a>
        </div>
      </div>
    )
  }

  return (
    <div>
      {media}
      {frame && (
        <p className="px-3 pt-2 text-[15px] font-medium leading-5">
          {t('frameOf', { n: Math.min(cur, n - 1) + 1, total: n })}
          <span className="block text-note font-normal text-text-secondary">
            {date}, {t('frameTags', { band: frame.band, release: frame.release.toUpperCase(), colours: diff ? t('viewChanges') : colormap === 'band' ? tc('falseColour') : t('grey') })}
          </span>
        </p>
      )}
      <div className="flex items-center gap-0.5 px-1 pt-1">
        <IconButton label={t('prev')} onClick={() => step(-1)} disabled={!ready || n < 2}>
          <IconStepBack size={28} />
        </IconButton>
        {playButton}
        <IconButton label={t('next')} onClick={() => step(1)} disabled={!ready || n < 2}>
          <IconStepForward size={28} />
        </IconButton>
        <div className="min-w-0 flex-1 px-1 leading-tight">
          <p className="truncate text-body font-semibold">{frame ? frameLabel : t('player')}</p>
          <p className="truncate text-meta text-text-secondary">
            {frame ? t('releaseFrame', { release: frame.release.toUpperCase(), n: Math.min(cur, n - 1) + 1, total: n }) : b.status === 'ready' ? t('built', { n }) : ''}
          </p>
        </div>
        <IconButton label={t('crosshair')} aria-pressed={crosshair} onClick={() => setCrosshair(!crosshair)} className={crosshair ? 'text-warning' : 'text-icon-muted'}>
          <IconCrosshair size={26} />
        </IconButton>
      </div>
      {n > 1 && (
        <div className="px-4 pt-1">
          <FrameTimeline
            positions={dotPositions(shown.map((f) => (f.mjd - (shown[0]?.mjd ?? f.mjd)) * 86400))}
            current={Math.min(cur, n - 1)}
            restart={restart}
            label={t('timeline')}
            dotLabel={(i) => t('timelineDot', { n: i + 1, date: formatShortDate(mjdToMs(shown[i]?.mjd ?? 0), locale) })}
            onPick={(i) => {
              setPlaying(false)
              setCur(i)
            }}
          />
        </div>
      )}
      {b.status === 'ready' && b.frames.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 px-4 pt-2">
          <Segmented
            label={t('view')}
            value={view}
            onChange={setView}
            options={[
              { value: 'photos', label: t('viewPhotos') },
              { value: 'changes', label: t('viewChanges'), disabled: !sameGrid },
            ]}
          />
          {b.frames.length > 2 && (
            <Chip
              active={ends}
              onClick={() => {
                setEnds((v) => !v)
                setCur(0)
              }}
            >
              {t('firstLast')}
            </Chip>
          )}
        </div>
      )}
      {view === 'changes' && diff && <p className="px-4 pt-2 text-meta text-text-secondary">{ends ? t('changesEnds') : t('changesHint')}</p>}
      {n > 0 && view === 'photos' && (
        <div className="flex flex-wrap items-center gap-2 px-4 pb-1 pt-2">
          <span className="text-note text-text-secondary">{t('colormap')}</span>
          <Chip active={colormap === 'grey'} onClick={() => setColormap('grey')}>
            {t('grey')}
          </Chip>
          <Chip active={colormap === 'band'} onClick={() => setColormap('band')}>
            {t('bandHue')}
          </Chip>
        </div>
      )}
      {crosshair && n > 0 && <p className="px-4 pt-1 text-meta text-text-secondary">{target ? t('crosshairMoving') : t('crosshairCentre')}</p>}
      {b.status === 'ready' && (
        <div className="flex items-center justify-between gap-3 px-4">
          <p className="min-w-0 text-meta text-text-secondary">{b.bytes !== null && t('downloaded', { size: formatBytes(b.bytes) })}</p>
          <button type="button" onClick={() => void b.start()} className="inline-flex min-h-11 shrink-0 items-center text-note font-semibold text-link">
            {t('rebuild')}
          </button>
        </div>
      )}
      {new Set(b.frames.map((f) => f.release)).size > 1 && (
        <div className="px-4 pt-2">
          <QrWarning />
        </div>
      )}
      {b.status === 'ready' && <p className="sr-only" role="status">{t('built', { n })}</p>}
    </div>
  )
}

function SiaList({ sky }: { sky: SkyResult }) {
  const locale = useLocale()
  const t = useTranslations('sky')
  const shown = sky.images.slice(0, 12)
  return (
    <section className="px-4 pt-4">
      <p className="text-note text-text-secondary">{t('siaList')}</p>
      <ul className="mt-2 divide-y-[0.5px] divide-divider">
        {shown.map((im) => (
          <li key={im.key} className="flex min-h-10 items-center gap-2 text-body">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: BAND_HUE[im.band] }} aria-hidden="true" />
            <span className="w-8 font-medium">{im.band}</span>
            <span className="flex-1">{formatShortDate(im.iso, locale)}</span>
            <span className="text-text-secondary">{im.release.toUpperCase()}</span>
          </li>
        ))}
      </ul>
      {sky.images.length > shown.length && <p className="pt-2 text-note text-text-secondary">{t('moreImages', { n: sky.images.length - shown.length })}</p>}
    </section>
  )
}

function DataSize({ sky, fov }: { sky: SkyResult; fov: number }) {
  const t = useTranslations('sky')
  const n = sky.source === 'sia' ? Math.min(CUTOUTS, sky.images.length) : Math.min(maxEpochsFor(fov), sky.total)
  if (!n) return null
  return fov >= 0.25 ? (
    <div className="px-4 pt-2">
      <Notice tone="warning" icon={<IconWarning size={20} />}>
        {t('bigField', { n })}
      </Notice>
    </div>
  ) : (
    <p className="px-4 pt-2 text-note text-text-secondary">{t('willRead', { n })}</p>
  )
}

function TargetCrosshair({ frame, target, grid }: { frame: ViewFrame; target: SkyTarget | null; grid: ReturnType<typeof referenceGrid> }) {
  if (!target) return <Crosshair x={0.5} y={0.5} />
  const [tra, tdec] = propagate(target, frame.mjd)
  const [gx, gy] = grid.wcs.world2pix(tra, tdec)
  return <Crosshair x={(gx + 0.5) / grid.n} y={1 - (gy + 0.5) / grid.n} />
}

export function SkyViewer({ params, compact = false, onChange, onLocate, marker }: { params: SkyParams; compact?: boolean; onChange?: (next: Partial<SkyParams>) => void; onLocate?: (frame: number, x: number, y: number) => void; marker?: ReactNode }) {
  const t = useTranslations('sky')
  const tc = useTranslations('common')
  const { ra, dec, fov, band, name, obj } = params
  const sky = useSky(ra, dec, fov, band)
  const { data: object } = useObject(obj ?? '')
  const target = useMemo<SkyTarget | null>(() => {
    if (!object || object.pm_ra_cosdec === null || object.pm_dec === null) return null
    const epoch = Number(/([0-9]{4}(?:\.[0-9]+)?)/.exec(object.epoch)?.[1] ?? 2016)
    return { ra: object.ra, dec: object.dec, epoch, pmra: object.pm_ra_cosdec, pmdec: object.pm_dec }
  }, [object])
  const playerKey = `${ra}|${dec}|${fov}|${band ?? 'all'}`
  const allCount = useMemo(() => Object.values(sky.data?.bands ?? {}).reduce((s, v) => s + v, 0), [sky.data?.bands])

  if (sky.isLoading)
    return (
      <div aria-busy="true">
        <Skeleton className="aspect-square w-full rounded-none" />
        <p className="px-4 py-3 text-note text-text-secondary" role="status">
          {t('loadingIndex')}
        </p>
      </div>
    )

  if (sky.isError || !sky.data)
    return <EmptyState title={t('lookupFailed')} action={<Button onClick={() => sky.refetch()}>{tc('retry')}</Button>} />

  const d = sky.data

  if (compact) {
    if (d.source === 'none') return <EmptyState title={t('none')} />
    return <Player key={`${playerKey}|${target ? 'pm' : 'fixed'}`} sky={d} params={params} target={target} compact onLocate={onLocate} marker={marker} />
  }

  return (
    <div className="pb-6">
      {d.source === 'none' ? <EmptyState title={t('none')} /> : <Player key={`${playerKey}|${target ? 'pm' : 'fixed'}`} sky={d} params={params} target={target} compact={false} />}

      <section className="flex items-center gap-3 px-4 pt-3">
        <div className="min-w-0 flex-1 leading-tight">
          <p className="text-body font-medium">{d.source === 'none' ? t('none') : t('images', { n: d.total })}</p>
          <p className="text-meta text-text-secondary">{t(`source.${d.source === 'sia' || d.source === 'fragment' ? d.source : 'none'}`)}</p>
        </div>
        {d.releases.length > 0 && (
          <div className="flex shrink-0 gap-1.5" aria-label={t('releases')}>
            {d.releases.map((r) => (
              <span key={r} className="rounded-full bg-surface px-2.5 py-0.5 text-meta font-medium">
                {t('batch', { release: r.toUpperCase() })}
              </span>
            ))}
          </div>
        )}
      </section>

      {!name && (
        <div className="px-4 pt-3">
          <Notice icon={<IconWarning size={20} />}>{t('staleTyped')}</Notice>
        </div>
      )}

      <section className="pt-5">
        <h2 className="px-4 text-ui font-semibold">{t('band')}</h2>
        <div className="grid grid-cols-4 gap-2 px-4 pt-2" role="group" aria-label={t('band')}>
          <BandTile label={t('allBands')} hue="var(--gradient-bands)" detail={String(allCount)} on={!band} onClick={() => onChange?.({ band: null })} />
          {BANDS.map((k) => (
            <BandTile key={k} label={k} hue={BAND_HUE[k] ?? ''} detail={String(d.bands[k] ?? 0)} on={band === k} onClick={() => onChange?.({ band: k })} />
          ))}
        </div>
        <p className="px-4 pt-2 text-meta text-text-secondary">{t('bandHint')}</p>
      </section>

      <section className="pt-5">
        <h2 className="px-4 text-ui font-semibold">{t('fov')}</h2>
        <div className="grid grid-cols-4 gap-2 px-4 pt-2" role="group" aria-label={t('fov')}>
          {FOVS.map((f) => (
            <Chip key={f} active={f === fov} onClick={() => onChange?.({ fov: f })} className="min-h-12 w-full justify-center px-1 text-center">
              {t('fovValue', { arcmin: +(f * 60).toFixed(1) })}
            </Chip>
          ))}
        </div>
        <p className="px-4 pt-2 text-meta text-text-secondary">{t('fovHint')}</p>
        <DataSize sky={d} fov={fov} />
      </section>

      {d.source === 'sia' && <SiaList sky={d} />}

      {d.nearby.length > 0 && (
        <section className="pt-5">
          <h2 className="px-4 text-ui font-semibold">{t('nearby')}</h2>
          <ul className="no-scrollbar flex gap-4 overflow-x-auto px-4 pt-3">
            {d.nearby.map((o) => (
              <li key={o.id}>
                <Link href={`/o/${o.id}`} className="flex w-[72px] flex-col items-center gap-1" aria-label={`${t('openProfile')}: ${o.name}`}>
                  <ObjectAvatar src={o.avatar} alt="" size={64} ring={o.has_new_data ? 'new' : 'none'} />
                  <span className="w-full truncate text-center text-meta">{o.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <CatalogLinks ra={ra} dec={dec} skyLink={false} className="mx-4 mt-5 rounded-2xl bg-surface p-3" />
    </div>
  )
}

export function parseSkyParams(sp: URLSearchParams): SkyParams | null {
  const ra = Number(sp.get('ra'))
  const dec = Number(sp.get('dec'))
  if (!sp.get('ra') || !sp.get('dec') || !Number.isFinite(ra) || !Number.isFinite(dec) || ra < 0 || ra > 360 || dec < -90 || dec > 90) return null
  const f = Number(sp.get('fov') ?? 0.1)
  const fov = Number.isFinite(f) ? Math.min(0.5, Math.max(0.05, f)) : 0.1
  const b = sp.get('band')
  const band = b && (BANDS as readonly string[]).includes(b) ? b : null
  const name = sp.get('name')?.trim() || null
  const obj = sp.get('obj')?.trim() || null
  return { ra, dec, fov, band, name, obj }
}

export function skyTitle(p: SkyParams) {
  return p.name ?? `${p.ra.toFixed(4)}, ${p.dec.toFixed(4)}`
}
