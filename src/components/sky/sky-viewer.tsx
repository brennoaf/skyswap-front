'use client'

import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Crosshair } from '@/components/feed/post-media'
import { skyHref } from '@/components/feed/spot-sheet'
import { IconChevronRight, IconCrosshair, IconFlask, IconMap, IconPause, IconPlay, IconSearch, IconSliders, IconStepBack, IconStepForward, IconWarning } from '@/components/icons'
import { dotPositions, FrameTimeline } from '@/components/classify/photo-viewer'
import { SkyLocator, skyRegion } from '@/components/sky/sky-locator'
import { SkyMapSheet } from '@/components/sky/sky-map-sheet'
import { BandTile } from '@/components/ui/band-tile'
import { CatalogLinks } from '@/components/ui/catalog-links'
import { Button, Chip, EmptyState, IconButton, ObjectAvatar, Segmented, Sheet, Skeleton, useLoopRestart } from '@/components/ui/primitives'
import { QrWarning } from '@/components/charts/charts'
import type { SkyResult } from '@/lib/api/client'
import { useObject, useSky } from '@/lib/api/hooks'
import { BAND_HUE, BANDS, cssColor, formatBytes, formatShortDate, cx } from '@/lib/format'
import { parseFitsImage, percentile, propagate, referenceGrid, skyMovie, stretch, type IndexRow } from '@/lib/sky'
import { pointHits, askServer } from '@/lib/explore/lookup'
import { differenceGrey, differenceImages, differenceScale, SKY_CROP } from '@/lib/explore/sky-card'
import { tileFetch } from '@/lib/explore/tiles'
import { isControl, isTyping, ownsArrows, plainKey } from '@/lib/keys'
import { modalCount } from '@/lib/modal-history'
import { useUi } from '@/lib/state/ui'
import { useBandName } from '@/lib/use-band'

export const FOVS = [0.05, 0.1, 0.25, 0.5] as const
export const INDEX_BASE = '/kit/index/'
const CUTOUTS = 6
const BASE_FPS = 4
const PIXEL_ARCSEC = 6.15
const ROW_BYTES = 2040 * 4
const READ_FACTOR = 2.4

type ViewFrame = { key: string; img: Float32Array; w: number; h: number; mjd: number; band: string; release: string; lo: number; hi: number }
type Colormap = 'grey' | 'band'
type View = 'photos' | 'changes'
type Status = 'idle' | 'building' | 'ready' | 'error'
type Diffs = { d: Float32Array[]; scale: number }

const KNOWN_SOURCES = ['fragment', 'sia', 'none']

export function couldNotCheck(sky: SkyResult): boolean {
  return (sky.incomplete === true && sky.images.length === 0) || !KNOWN_SOURCES.includes(sky.source)
}

const canBuildFrom = (sky: SkyResult) => !couldNotCheck(sky) && (sky.source === 'fragment' || (sky.source === 'sia' && sky.images.length > 0))

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
  const abort = useRef<AbortController | null>(null)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      abort.current?.abort()
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
    abort.current?.abort()
    const ctrl = new AbortController()
    abort.current = ctrl
    const live = () => alive.current && abort.current === ctrl
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
        while (next < picks.length && live()) {
          const im = picks[next++]
          if (!im) continue
          try {
            const q = new URLSearchParams({ key: im.key, ra: String(p.ra), dec: String(p.dec), size: String(size) })
            const r = await fetch(`/api/cutout?${q}`, { signal: ctrl.signal })
            if (!r.ok) throw new Error(String(r.status))
            const buf = await r.arrayBuffer()
            read += buf.byteLength
            const fits = parseFitsImage(buf, 'IMAGE')
            if (!live()) return
            count++
            add(toFrame(im.key, fits.data, fits.nx, fits.ny, im.mjd, im.band, im.release))
          } catch {
            if (live()) setDone((d) => d + 1)
          }
        }
      }
      await Promise.all([worker(), worker()])
      if (!live()) return
      setBytes(read)
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
          if (live()) setTile({ loaded, total: size ?? sky.tile_bytes })
        }).catch(() => null)
        hits = r?.hits ?? null
        if (!live()) return
        setTile(null)
        setScanning(true)
      }
      const result = await skyMovie({
        hits,
        fetchImpl: ((input: RequestInfo | URL, init?: RequestInit) => tileFetch(input, { ...init, signal: ctrl.signal })) as typeof fetch,
        ra: p.ra,
        dec: p.dec,
        target,
        fovDeg: p.fov,
        indexBase: INDEX_BASE,
        maxEpochs,
        mode: 'bilinear',
        cropBase: SKY_CROP,
        signal: ctrl.signal,
        bands: p.band ? [p.band] : null,
        onFrame: (_i, f) => {
          if (!live()) return
          const n = Math.round(Math.sqrt(f.img.length))
          count++
          add(toFrame(f.h.key, f.img, n, n, f.h.mjd, f.h.band, f.h.release))
        },
      })
      if (!live()) return
      setBytes(result.bytes)
      finish(count, t0, 'noFrames')
    } catch {
      if (!live()) return
      if (count) finish(count, t0, 'noFrames')
      else {
        setErrorKey('failed')
        setStatus('error')
      }
    }
  }, [sky, p.ra, p.dec, p.fov, p.band, maxEpochs, add, finish, target])

  return { frames, status, errorKey, done, total, latest, ms, bytes, tile, scanning, firstMs, start }
}

function Player({
  sky,
  params,
  compact,
  target,
  onLocate,
  marker,
  autoStart = false,
  choices,
}: {
  sky: SkyResult
  params: SkyParams
  compact: boolean
  target: SkyTarget | null
  onLocate?: (frame: number, x: number, y: number) => void
  marker?: ReactNode
  autoStart?: boolean
  choices?: ReactNode
}) {
  const locale = useLocale()
  const t = useTranslations('sky')
  const tc = useTranslations('common')
  const crosshair = useUi((s) => s.crosshair)
  const setCrosshair = useUi((s) => s.setCrosshair)
  const speed = useUi((s) => s.speed)
  const b = useBuilder(sky, params, target)
  const bandName = useBandName()
  const diffCache = useRef(new WeakMap<ViewFrame[], Diffs>())
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
    const hit = diffCache.current.get(shown)
    if (hit) return hit
    const d = differenceImages(shown.map((f) => f.img))
    const made = { d, scale: differenceScale(d) }
    diffCache.current.set(shown, made)
    return made
  }, [view, sameGrid, b.status, shown])
  const restart = useLoopRestart(cur, playing)
  const kicked = useRef(false)
  const start = b.start

  useEffect(() => {
    if (!autoStart || kicked.current) return
    kicked.current = true
    void start()
  }, [autoStart, start])

  useEffect(
    () => () => {
      kicked.current = false
    },
    [],
  )

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

  useEffect(() => {
    if (!ready) return
    const onKey = (e: KeyboardEvent) => {
      if (!plainKey(e) || isTyping(e.target) || modalCount()) return
      if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && !ownsArrows(e.target)) {
        e.preventDefault()
        setPlaying(false)
        setCur((c) => (c + (e.key === 'ArrowRight' ? 1 : -1) + n) % n)
      } else if (e.key === ' ' && !isControl(e.target)) {
        e.preventDefault()
        setPlaying((v) => !v)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [ready, n])
  const date = frame ? formatShortDate(mjdToMs(frame.mjd), locale) : ''
  const frameLabel = frame ? t('frameDate', { date, band: bandName(frame.band) }) : ''
  const canBuild = canBuildFrom(sky)

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
      data-build-ms={b.ms ?? undefined}
      data-first-frame-ms={b.firstMs ?? undefined}
      data-frames={n}
    >
      {frame && <FrameCanvas frame={frame} colormap={colormap} diff={diff} label={diff ? t('changesAlt', { date }) : t('frameAlt', { band: bandName(frame.band), date })} />}
      {frame && crosshair && <TargetCrosshair frame={frame} target={target} grid={grid} />}
      {marker}
      {b.status === 'idle' && compact && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-reels-bg px-6 text-center text-spot-star">
          <SkyLocator ra={params.ra} dec={params.dec} name={params.name ?? t('thisSpot')} className="w-full" />
          {canBuild ? (
            <>
              <Button variant="primary" className="h-11 px-5" onClick={() => void b.start()}>
                <IconPlay size={22} />
                {t('start')}
              </Button>
              <p className="max-w-72 text-meta text-on-media-muted">{t('liveNote')}</p>
            </>
          ) : (
            <p className="text-body text-on-media-muted">{couldNotCheck(sky) ? t('unchecked') : t('none')}</p>
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
      {choices}
      {media}
      {ready && frame && (
        <>
          <div className="flex items-center gap-0.5 px-1 pt-2" data-testid="sky-player-bar">
            <IconButton label={t('prev')} onClick={() => step(-1)} disabled={n < 2}>
              <IconStepBack size={28} />
            </IconButton>
            {playButton}
            <IconButton label={t('next')} onClick={() => step(1)} disabled={n < 2}>
              <IconStepForward size={28} />
            </IconButton>
            <div className="min-w-0 flex-1 px-1 leading-tight">
              <p className="truncate text-body font-semibold">{frameLabel}</p>
              <p className="truncate text-meta text-text-secondary">{t('photoOf', { n: Math.min(cur, n - 1) + 1, total: n })}</p>
            </div>
            <IconButton label={t('crosshair')} aria-pressed={crosshair} onClick={() => setCrosshair(!crosshair)} className={crosshair ? 'text-warning' : 'text-icon-muted'}>
              <IconCrosshair size={26} />
            </IconButton>
          </div>
        </>
      )}
      {ready && n > 1 && (
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
      {crosshair && ready && <p className="px-4 pt-2 text-meta text-text-secondary">{target ? t('crosshairMoving') : t('crosshairCentre')}</p>}
      {ready && (
        <section className="mx-4 mt-4 space-y-2 border-t-[0.5px] border-divider pt-3" aria-label={t('viewSettings')} data-testid="sky-view-settings">
          {view === 'photos' && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-note text-text-secondary">{t('colormap')}</span>
              <Chip active={colormap === 'grey'} onClick={() => setColormap('grey')}>
                {t('grey')}
              </Chip>
              <Chip active={colormap === 'band'} onClick={() => setColormap('band')}>
                {t('bandHue')}
              </Chip>
            </div>
          )}
          <p className="text-meta text-text-secondary">
            {t('images', { n: sky.total })}
            {b.bytes !== null && <span className="block">{t('downloaded', { size: formatBytes(b.bytes) })}</span>}
          </p>
          {new Set(b.frames.map((f) => f.release)).size > 1 && <QrWarning />}
        </section>
      )}
      {b.status === 'ready' && <p className="sr-only" role="status">{t('built', { n })}</p>}
    </div>
  )
}

function photosFor(sky: SkyResult, fov: number, band: string | null) {
  if (sky.source === 'sia') return Math.min(CUTOUTS, sky.images.length)
  const all = band ? (sky.bands[band] ?? 0) : Object.values(sky.bands).reduce((s, v) => s + v, 0)
  return Math.min(maxEpochsFor(fov), all)
}

export function estimateBytes(fov: number, photos: number) {
  const rows = Math.round((fov * 3600) / PIXEL_ARCSEC) * 1.27 + 21
  return Math.round(photos * rows * ROW_BYTES * READ_FACTOR)
}

function TargetCrosshair({ frame, target, grid }: { frame: ViewFrame; target: SkyTarget | null; grid: ReturnType<typeof referenceGrid> }) {
  if (!target) return <Crosshair x={0.5} y={0.5} />
  const [tra, tdec] = propagate(target, frame.mjd)
  const [gx, gy] = grid.wcs.world2pix(tra, tdec)
  return <Crosshair x={(gx + 0.5) / grid.n} y={1 - (gy + 0.5) / grid.n} />
}

type Stage = 'intro' | 'band' | 'fov' | 'player'
type Choice = { band: string | null; fov: number }

const arcmin = (fov: number) => +(fov * 60).toFixed(1)

function monthYear(mjd: number, locale: string) {
  const parts = new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' }).formatToParts(new Date(mjdToMs(mjd)))
  const month = parts.find((p) => p.type === 'month')?.value.replace('.', '') ?? ''
  const year = parts.find((p) => p.type === 'year')?.value ?? ''
  return `${month} ${year}`
}

function DayStrip({ images }: { images: { mjd: number }[] }) {
  const t = useTranslations('sky')
  const locale = useLocale()
  const days = useMemo(() => {
    const count = new Map<number, number>()
    for (const i of images) count.set(Math.floor(i.mjd), (count.get(Math.floor(i.mjd)) ?? 0) + 1)
    return [...count.entries()].sort((a, b) => a[0] - b[0])
  }, [images])
  const first = days[0]
  const last = days[days.length - 1]
  if (!first || !last) return null
  const lo = first[0]
  const hi = last[0]
  const max = Math.max(...days.map((d) => d[1]))
  const at = (d: number) => (hi > lo ? (d - lo) / (hi - lo) : 0.5)
  return (
    <div className="mt-5" data-testid="sky-days">
      <div className="relative mx-1 h-12 border-b-2 border-divider" aria-hidden="true">
        {days.map(([d, n]) => (
          <span key={d} className="absolute bottom-0 w-1 -translate-x-1/2 rounded-full bg-accent" style={{ left: `${at(d) * 100}%`, height: `${12 + (n / max) * 80}%` }} />
        ))}
      </div>
      <p className="mt-2 flex justify-between gap-2 text-note tabular-nums text-text-secondary">
        <span>{monthYear(lo, locale)}</span>
        <span>{t('heroDays', { n: days.length })}</span>
        {hi > lo && <span>{monthYear(hi, locale)}</span>}
      </p>
    </div>
  )
}

function Intro({ sky, images, total, profileCount, onStart, onRetry }: { sky: SkyResult; images: { mjd: number }[]; total: number; profileCount: number | null; onStart: () => void; onRetry: () => void }) {
  const t = useTranslations('sky')
  const tc = useTranslations('common')
  if (couldNotCheck(sky))
    return (
      <section className="px-4 pt-4" data-testid="sky-intro">
        <p className="text-body text-text-secondary">{t('unchecked')}</p>
        <Button full className="mt-4 h-11" onClick={onRetry}>
          {tc('retry')}
        </Button>
      </section>
    )
  if (!canBuildFrom(sky))
    return (
      <section className="px-4 pt-4" data-testid="sky-intro">
        <p className="text-body text-text-secondary">{t('none')}</p>
      </section>
    )
  return (
    <section className="pt-2" data-testid="sky-intro">
      <div className="mx-4 rounded-[20px] bg-surface px-5 pb-5 pt-5">
        <p className="text-note text-text-secondary">{t('heroEyebrow')}</p>
        <p className="mt-1 flex items-baseline gap-2">
          <span className="text-[44px] font-bold leading-none tracking-[-0.02em] tabular-nums">{total}</span>
          <span className="text-[17px] font-semibold">{t('heroTimes', { n: total })}</span>
        </p>
        <p className="mt-1 text-meta leading-snug text-text-secondary" data-testid="sky-count-note">
          {profileCount !== null && profileCount !== total ? t('heroProfile', { n: profileCount }) : t('heroAll')}
        </p>
        <DayStrip images={images} />
      </div>
      <div className="px-4 pt-5">
        <Button variant="primary" full className="h-12 font-semibold" onClick={onStart}>
          {t('start')}
        </Button>
      </div>
    </section>
  )
}

function StepDots({ at }: { at: 1 | 2 }) {
  const t = useTranslations('sky')
  return (
    <p className="flex items-center gap-1.5" role="img" aria-label={t('stepOf', { n: at, total: 2 })}>
      {[1, 2].map((i) => (
        <span key={i} className={cx('h-1.5 rounded-full transition-all', i === at ? 'w-5 bg-text' : 'w-1.5 bg-divider')} />
      ))}
    </p>
  )
}

function Steps({
  stage,
  sky,
  draft,
  onDraft,
  onNext,
  onBuild,
}: {
  stage: 'band' | 'fov'
  sky: SkyResult
  draft: Choice
  onDraft: (c: Choice) => void
  onNext: () => void
  onBuild: () => void
}) {
  const t = useTranslations('sky')
  const tb = useTranslations('bands')
  const bandName = useBandName()
  const all = Object.values(sky.bands).reduce((s, v) => s + v, 0)
  const photos = photosFor(sky, draft.fov, draft.band)
  const total = sky.source === 'sia' ? sky.images.length : draft.band ? (sky.bands[draft.band] ?? 0) : all
  const big = draft.fov >= 0.25
  return (
    <div className="flex min-h-[calc(100dvh-var(--height-topbar)-var(--height-bottomnav)-env(safe-area-inset-bottom))] flex-col" data-testid={`sky-step-${stage}`}>
      <div className="flex-1 px-4 pb-4 pt-3">
        <StepDots at={stage === 'band' ? 1 : 2} />
        <h2 className="pt-3 text-title-lg font-bold leading-tight tracking-[-0.01em]">{stage === 'band' ? t('band') : t('fov')}</h2>
        <p className="pt-1 text-note text-text-secondary">{stage === 'band' ? `${t('bandLine')} ${tb('explain')}` : t('fovHint')}</p>
        {stage === 'band' ? (
          <div className="grid grid-cols-3 gap-2 pt-4" role="group" aria-label={t('band')}>
            <BandTile label={t('allBands')} hue="var(--gradient-bands)" detail={String(all)} on={!draft.band} onClick={() => onDraft({ ...draft, band: null })} />
            {BANDS.map((k) => (
              <BandTile key={k} label={bandName(k)} hue={BAND_HUE[k] ?? ''} detail={String(sky.bands[k] ?? 0)} on={draft.band === k} onClick={() => onDraft({ ...draft, band: k })} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 pt-4" role="group" aria-label={t('fov')}>
            {FOVS.map((f) => {
              const n = photosFor(sky, f, draft.band)
              return (
                <Chip key={f} active={f === draft.fov} onClick={() => onDraft({ ...draft, fov: f })} className="min-h-16 w-full flex-col justify-center gap-0.5 px-2 text-center">
                  <span>{t('fovValue', { arcmin: arcmin(f) })}</span>
                  {sky.source === 'fragment' && n > 0 && <span className="text-meta font-normal tabular-nums opacity-70">{t('fovSize', { size: formatBytes(estimateBytes(f, n)) })}</span>}
                </Chip>
              )
            })}
          </div>
        )}
      </div>
      <div className="sticky bottom-[calc(var(--height-bottomnav)+env(safe-area-inset-bottom))] z-20 bg-bg px-4 pb-3 pt-2">
        {stage === 'band' ? (
          <Button variant="primary" full className="h-11 font-semibold" onClick={onNext}>
            {t('nextStep')}
          </Button>
        ) : (
          <>
            {photos > 0 && (
              <p className={cx('flex items-start gap-1.5 pb-2 text-meta', big ? 'text-warning' : 'text-text-secondary')}>
                <IconWarning size={16} className="mt-0.5 shrink-0" />
                {photos < total ? t('readLine', { n: photos, total }) : t('readLineAll', { n: photos })}
              </p>
            )}
            <Button variant="primary" full className="h-11 font-semibold" onClick={onBuild}>
              <IconPlay size={20} />
              {t('seeSequence')}
            </Button>
            <p className="pt-2 text-micro leading-snug text-text-secondary">{t('liveNote')}</p>
          </>
        )}
      </div>
    </div>
  )
}

function ChoiceLine({ band, fov, onOpen }: { band: string | null; fov: number; onOpen: () => void }) {
  const t = useTranslations('sky')
  const nameOf = useBandName()
  const bandName = band ? nameOf(band) : t('allBands')
  const fovName = t('fovValue', { arcmin: arcmin(fov) })
  return (
    <button type="button" onClick={onOpen} aria-label={t('choices', { band: bandName, fov: fovName })} className="flex min-h-11 w-full items-center gap-2 px-4 text-left active:bg-surface" data-testid="sky-choices">
      <span className="flex min-w-0 flex-1 items-center gap-2 text-note font-semibold">
        {band && <span className="size-2.5 shrink-0 rounded-full" style={{ background: BAND_HUE[band] }} aria-hidden="true" />}
        <span>{bandName}</span>
        <span className="size-1 shrink-0 rounded-full bg-text-secondary" aria-hidden="true" />
        <span>{fovName}</span>
      </span>
      <IconSliders size={20} className="shrink-0 text-text-secondary" />
    </button>
  )
}

const MOVING_MAS_YR = 500

function Tail({ sky, params }: { sky: SkyResult; params: SkyParams }) {
  const t = useTranslations('sky')
  const tm = useTranslations('sky.map')
  const [sheet, setSheet] = useState<'map' | 'catalogs' | null>(null)
  const typed = !params.name && !params.obj
  const here = typed ? (sky.nearby.find((o) => (o.separation_deg ?? Infinity) <= params.fov / 2) ?? null) : null
  const { data: hereObj } = useObject(here?.id ?? '')
  const moves = !!hereObj && hereObj.pm_ra_cosdec !== null && hereObj.pm_dec !== null && Math.hypot(hereObj.pm_ra_cosdec, hereObj.pm_dec) >= MOVING_MAS_YR
  const others = sky.nearby.filter((o) => o.id !== here?.id && o.id !== params.obj)
  const row = 'flex min-h-14 w-full items-center gap-3.5 border-b-[0.5px] border-divider text-left text-body active:bg-surface'
  return (
    <>
      {here && (
        <Link
          href={skyHref({ ra: hereObj?.ra ?? params.ra, dec: hereObj?.dec ?? params.dec, fov: params.fov, band: params.band, name: here.name, obj: here.id })}
          className="mx-4 mt-4 flex items-center gap-3 rounded-2xl bg-surface py-3 pl-3 pr-2 active:bg-surface-pressed"
          data-testid="sky-here"
        >
          <ObjectAvatar src={here.avatar} alt="" size={44} />
          <span className="min-w-0 flex-1">
            <span className="block text-ui font-semibold leading-snug">{t('hereTitle', { name: here.name })}</span>
            <span className="mt-0.5 block text-note leading-snug text-text-secondary">{moves ? t('hereMoves') : t('hereStill')}</span>
          </span>
          <IconChevronRight size={20} className="shrink-0 text-icon-muted" />
        </Link>
      )}
      {typed && !here && <p className="px-4 pt-3 text-center text-note text-text-secondary">{t('typedFixed')}</p>}
      <nav className="mx-4 mt-7 border-t-[0.5px] border-divider" aria-label={t('more')}>
        {params.obj && (
          <Link href={`/lab/${params.obj}`} className={row} data-testid="sky-lab">
            <IconFlask size={22} className="shrink-0 text-text-secondary" />
            <span className="min-w-0 flex-1">{t('openLab')}</span>
            <IconChevronRight size={18} className="shrink-0 text-icon-muted" />
          </Link>
        )}
        {others.map((o) => (
          <Link key={o.id} href={`/o/${o.id}`} className={row} aria-label={`${t('openProfile')}: ${o.name}`}>
            <ObjectAvatar src={o.avatar} alt="" size={32} ring={o.has_new_data ? 'new' : 'none'} />
            <span className="min-w-0 flex-1 truncate">{o.name}</span>
            <IconChevronRight size={18} className="shrink-0 text-icon-muted" />
          </Link>
        ))}
        <button type="button" className={row} onClick={() => setSheet('map')}>
          <IconMap size={22} className="shrink-0 text-text-secondary" />
          <span className="shrink-0">{t('whereInSky')}</span>
          <span className="min-w-0 flex-1 truncate text-right text-note text-text-secondary">{tm(skyRegion(params.dec))}</span>
          <IconChevronRight size={18} className="shrink-0 text-icon-muted" />
        </button>
        <button type="button" className={row} onClick={() => setSheet('catalogs')}>
          <IconSearch size={22} className="shrink-0 text-text-secondary" />
          <span className="min-w-0 flex-1">{t('catalogs')}</span>
          <IconChevronRight size={18} className="shrink-0 text-icon-muted" />
        </button>
      </nav>
      <SkyMapSheet open={sheet === 'map'} onClose={() => setSheet(null)} object={{ id: params.obj ?? '', name: params.name ?? t('title'), ra: params.ra, dec: params.dec }} watch={false} />
      <Sheet open={sheet === 'catalogs'} onClose={() => setSheet(null)} title={t('catalogs')}>
        <CatalogLinks ra={params.ra} dec={params.dec} skyLink={false} bare className="px-4 pb-2 pt-1" />
      </Sheet>
    </>
  )
}

export function SkyViewer({
  params,
  compact = false,
  onChange,
  onLocate,
  marker,
  header,
}: {
  params: SkyParams
  compact?: boolean
  onChange?: (next: Partial<SkyParams>) => void
  onLocate?: (frame: number, x: number, y: number) => void
  marker?: ReactNode
  header?: (onBack: (() => void) | undefined) => ReactNode
}) {
  const t = useTranslations('sky')
  const tc = useTranslations('common')
  const { ra, dec, fov, band, obj } = params
  const sky = useSky(ra, dec, fov, band)
  const { data: object } = useObject(obj ?? '')
  const target = useMemo<SkyTarget | null>(() => {
    if (!object || object.pm_ra_cosdec === null || object.pm_dec === null) return null
    const epoch = Number(/([0-9]{4}(?:\.[0-9]+)?)/.exec(object.epoch)?.[1] ?? 2016)
    return { ra: object.ra, dec: object.dec, epoch, pmra: object.pm_ra_cosdec, pmdec: object.pm_dec }
  }, [object])
  const lastChoice = useUi((s) => s.skyChoice)
  const keepChoice = useUi((s) => s.setSkyChoice)
  const all = useSky(ra, dec, fov, null)
  const [stage, setStage] = useState<Stage>('intro')
  const [from, setFrom] = useState<'intro' | 'player'>('intro')
  const [draft, setDraft] = useState<Choice>({ band, fov })
  const [want, setWant] = useState<Choice | null>(null)
  const [run, setRun] = useState(0)
  const playerKey = `${ra}|${dec}|${fov}|${band ?? 'all'}|${run}`

  useEffect(() => {
    if (!compact) window.scrollTo({ top: 0 })
  }, [stage, compact])

  const openSteps = (origin: 'intro' | 'player') => {
    setDraft(origin === 'intro' && lastChoice ? lastChoice : { band, fov })
    setFrom(origin)
    setStage('band')
  }
  const build = (next: Choice) => {
    keepChoice(next)
    setWant(next)
    if (next.band !== band || next.fov !== fov) onChange?.(next)
    setRun((r) => r + 1)
    setStage('player')
  }
  const stepBack = stage === 'band' ? () => setStage(from) : stage === 'fov' ? () => setStage('band') : undefined
  const top = header?.(stepBack)

  if (sky.isLoading || (stage === 'player' && want && (want.band !== band || want.fov !== fov)))
    return (
      <div aria-busy="true">
        {top}
        <Skeleton className="aspect-square w-full rounded-none" />
        <p className="px-4 py-3 text-note text-text-secondary" role="status">
          {t('loadingIndex')}
        </p>
      </div>
    )

  if (sky.isError || !sky.data)
    return (
      <div>
        {top}
        <EmptyState title={t('lookupFailed')} action={<Button onClick={() => sky.refetch()}>{tc('retry')}</Button>} />
      </div>
    )

  const d = sky.data
  const playerFor = (extra: { compact: boolean; choices?: ReactNode; autoStart?: boolean }) => <Player key={`${playerKey}|${target ? 'pm' : 'fixed'}`} sky={d} params={params} target={target} onLocate={onLocate} marker={marker} {...extra} />

  if (compact) {
    if (couldNotCheck(d)) return <EmptyState title={t('unchecked')} action={<Button onClick={() => sky.refetch()}>{tc('retry')}</Button>} />
    if (d.source === 'none') return <EmptyState title={t('none')} />
    return playerFor({ compact: true })
  }

  const steps = stage === 'band' || stage === 'fov'
  const built = run > 0 && canBuildFrom(d) && (stage === 'player' || from === 'player')

  return (
    <div>
      {top}
      {steps && <Steps stage={stage} sky={d} draft={draft} onDraft={setDraft} onNext={() => setStage('fov')} onBuild={() => build(draft)} />}
      <div className={cx('pb-6', steps && 'hidden')}>
        {built ? (
          playerFor({ compact: false, autoStart: true, choices: <ChoiceLine band={band} fov={fov} onOpen={() => openSteps('player')} /> })
        ) : (
          <Intro sky={d} images={band ? (all.data?.images ?? []) : d.images} total={Object.values(d.bands).reduce((s, v) => s + v, 0)} profileCount={object?.n_images ?? null} onStart={() => openSteps('intro')} onRetry={() => void sky.refetch()} />
        )}
        <Tail sky={d} params={params} />
      </div>
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
