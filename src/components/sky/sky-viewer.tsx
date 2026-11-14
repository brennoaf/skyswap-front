'use client'

import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Crosshair } from '@/components/feed/post-media'
import { skyHref } from '@/components/feed/spot-sheet'
import { IconCrosshair, IconPause, IconPlay, IconStepBack, IconStepForward, IconWarning } from '@/components/icons'
import { Button, Chip, EmptyState, IconButton, Notice, ObjectAvatar, Skeleton } from '@/components/ui/primitives'
import type { SkyResult } from '@/lib/api/client'
import { useSky } from '@/lib/api/hooks'
import { BAND_HUE, BANDS, cssColor, formatBytes, formatDec, formatRa, formatShortDate } from '@/lib/format'
import { parseFitsImage, percentile, skyMovie, stretch } from '@/lib/sky'
import { useUi } from '@/lib/state/ui'

export const FOVS = [0.05, 0.1, 0.25, 0.5] as const
export const INDEX_BASE = '/kit/index/'
const CUTOUTS = 6
const BASE_FPS = 4

type ViewFrame = { key: string; img: Float32Array; w: number; h: number; mjd: number; band: string; release: string; lo: number; hi: number }
type Colormap = 'grey' | 'band'
type Status = 'idle' | 'building' | 'ready' | 'error'

export type SkyParams = { ra: number; dec: number; fov: number; band: string | null; name: string | null }

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

function FrameCanvas({ frame, colormap, label }: { frame: ViewFrame; colormap: Colormap; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    c.width = frame.w
    c.height = frame.h
    const ctx = c.getContext('2d')
    if (!ctx) return
    const grey = stretch(frame.img, frame.lo, frame.hi)
    const out = ctx.createImageData(frame.w, frame.h)
    const [r, g, b] = colormap === 'band' ? hexRgb(cssColor(`--color-band-${frame.band.toLowerCase()}`)) : [255, 255, 255]
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
  }, [frame, colormap])
  return <canvas ref={ref} role="img" aria-label={label} className="pixelated absolute inset-0 size-full object-contain" />
}

function useBuilder(sky: SkyResult, p: SkyParams) {
  const [frames, setFrames] = useState<ViewFrame[]>([])
  const [status, setStatus] = useState<Status>('idle')
  const [errorKey, setErrorKey] = useState<'failed' | 'noFrames' | 'cutoutsFailed'>('failed')
  const [done, setDone] = useState(0)
  const [latest, setLatest] = useState<string | null>(null)
  const [ms, setMs] = useState<number | null>(null)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const maxEpochs = maxEpochsFor(p.fov)
  const total = sky.source === 'sia' ? Math.min(CUTOUTS, sky.images.length) : Math.min(maxEpochs, sky.total)

  const add = useCallback((f: ViewFrame) => {
    if (!alive.current) return
    setFrames((prev) => [...prev, f].sort((a, b) => a.mjd - b.mjd))
    setLatest(f.key)
    setDone((d) => d + 1)
  }, [])

  const finish = useCallback((count: number, t0: number, failKey: 'noFrames' | 'cutoutsFailed') => {
    if (!alive.current) return
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
    setStatus('building')
    const t0 = performance.now()
    let count = 0
    if (sky.source === 'sia') {
      const picks = spread([...sky.images].sort((a, b) => a.mjd - b.mjd), CUTOUTS)
      const size = Math.min(0.25, p.fov)
      let next = 0
      const worker = async () => {
        while (next < picks.length && alive.current) {
          const im = picks[next++]
          if (!im) continue
          try {
            const q = new URLSearchParams({ key: im.key, ra: String(p.ra), dec: String(p.dec), size: String(size) })
            const r = await fetch(`/api/cutout?${q}`)
            if (!r.ok) throw new Error(String(r.status))
            const fits = parseFitsImage(await r.arrayBuffer(), 'IMAGE')
            count++
            add(toFrame(im.key, fits.data, fits.nx, fits.ny, im.mjd, im.band, im.release))
          } catch {
            if (alive.current) setDone((d) => d + 1)
          }
        }
      }
      await Promise.all([worker(), worker()])
      finish(count, t0, 'cutoutsFailed')
      return
    }
    try {
      await skyMovie({
        ra: p.ra,
        dec: p.dec,
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
      finish(count, t0, 'noFrames')
    } catch {
      if (!alive.current) return
      if (count) finish(count, t0, 'noFrames')
      else {
        setErrorKey('failed')
        setStatus('error')
      }
    }
  }, [sky, p.ra, p.dec, p.fov, p.band, maxEpochs, add, finish])

  return { frames, status, errorKey, done, total, latest, ms, start }
}

function Player({ sky, params, compact }: { sky: SkyResult; params: SkyParams; compact: boolean }) {
  const locale = useLocale()
  const t = useTranslations('sky')
  const tc = useTranslations('common')
  const crosshair = useUi((s) => s.crosshair)
  const setCrosshair = useUi((s) => s.setCrosshair)
  const speed = useUi((s) => s.speed)
  const b = useBuilder(sky, params)
  const [cur, setCur] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [colormap, setColormap] = useState<Colormap>('grey')
  const n = b.frames.length

  useEffect(() => {
    if (b.status !== 'building' || !b.latest) return
    const i = b.frames.findIndex((f) => f.key === b.latest)
    if (i >= 0) setCur(i)
  }, [b.status, b.latest, b.frames])

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

  const frame = b.frames[Math.min(cur, n - 1)]
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
      className="relative aspect-square w-full overflow-hidden bg-media-bg text-white outline-none focus-visible:ring-2 focus-visible:ring-accent"
      role="group"
      aria-label={t('player')}
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
      data-frames={n}
    >
      {frame && <FrameCanvas frame={frame} colormap={colormap} label={t('frameAlt', { band: frame.band, date })} />}
      {frame && crosshair && <Crosshair x={0.5} y={0.5} />}
      {frame && (
        <>
          <span className="absolute left-2 top-2 rounded-md bg-black/60 px-2 py-1 text-meta font-medium">{date}</span>
          <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-1 text-meta">
            {frame.band} · {frame.release.toUpperCase()} · {tc('falseColour')}
          </span>
          {n > 1 && <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-meta font-medium">{t('frameOf', { n: cur + 1, total: n })}</span>}
        </>
      )}
      {b.status === 'idle' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
          {canBuild ? (
            <>
              <Button variant="primary" className="h-11 px-5" onClick={() => void b.start()}>
                <IconPlay size={22} />
                {sky.source === 'sia' ? t('fetchCutouts', { n: b.total }) : t('start')}
              </Button>
              {(sky.source === 'fragment' || compact) && <p className="max-w-[280px] text-meta text-white/70">{sky.source === 'sia' ? t('siaList') : t('liveNote')}</p>}
            </>
          ) : (
            <p className="text-body text-white/80">{t('none')}</p>
          )}
        </div>
      )}
      {b.status === 'building' && (
        <div className="absolute inset-x-0 bottom-0 bg-black/70 px-3 py-2" role="status" aria-live="polite">
          <p className="text-note">{sky.source === 'sia' ? t('fetchingCutouts', { done: b.done, total: b.total }) : t('building', { done: b.done, total: b.total })}</p>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/20">
            <div className="h-full bg-accent transition-[width]" style={{ width: `${b.total ? Math.min(100, (b.done / b.total) * 100) : 0}%` }} />
          </div>
        </div>
      )}
      {b.status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 px-8 text-center" role="alert">
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
            {frame ? `${frame.release.toUpperCase()} · ${t('frameOf', { n: cur + 1, total: n })}` : b.status === 'ready' ? t('built', { n }) : ''}
          </p>
        </div>
        <IconButton label={t('crosshair')} aria-pressed={crosshair} onClick={() => setCrosshair(!crosshair)} className={crosshair ? 'text-warning' : 'text-icon-muted'}>
          <IconCrosshair size={26} />
        </IconButton>
      </div>
      {n > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-4 pb-1 pt-1">
          <span className="text-note text-text-secondary">{t('colormap')}</span>
          <Chip active={colormap === 'grey'} onClick={() => setColormap('grey')}>
            {t('grey')}
          </Chip>
          <Chip active={colormap === 'band'} onClick={() => setColormap('band')}>
            {t('bandHue')}
          </Chip>
          {b.status === 'ready' && (
            <Button variant="ghost" className="ml-auto h-9 text-link" onClick={() => void b.start()}>
              {t('rebuild')}
            </Button>
          )}
        </div>
      )}
      {crosshair && n > 0 && <p className="px-4 pt-1 text-meta text-text-secondary">{t('crosshairCentre')}</p>}
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
  const used = Math.min(48, sky.total)
  if (sky.source !== 'fragment' || !used) return null
  const bytes = (sky.estimated_bytes / used) * Math.min(maxEpochsFor(fov), sky.total)
  const size = formatBytes(bytes)
  return fov >= 0.25 ? (
    <div className="px-4 pt-2">
      <Notice tone="warning" icon={<IconWarning size={20} />}>
        {t('dataSizeWarning', { size })}
      </Notice>
    </div>
  ) : (
    <p className="px-4 pt-2 text-note text-text-secondary">{t('dataSize', { size })}</p>
  )
}

export function SkyViewer({ params, compact = false, onChange }: { params: SkyParams; compact?: boolean; onChange?: (next: Partial<SkyParams>) => void }) {
  const t = useTranslations('sky')
  const tc = useTranslations('common')
  const { ra, dec, fov, band, name } = params
  const sky = useSky(ra, dec, fov, band)
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
    return <Player key={playerKey} sky={d} params={params} compact />
  }

  return (
    <div className="pb-6">
      <section className="px-4 pb-3 pt-1">
        <p className="text-note text-text-secondary">
          {t('coordinates', { ra: formatRa(ra), dec: formatDec(dec) })}
        </p>
        <p className="mt-0.5 text-body">
          {d.source === 'none' ? t('none') : t('images', { n: d.total })} <span className="text-text-secondary">· {t(`source.${d.source === 'sia' || d.source === 'fragment' ? d.source : 'none'}`)}</span>
        </p>
        {d.releases.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label={t('releases')}>
            {d.releases.map((r) => (
              <span key={r} className="rounded-full border-[0.5px] border-divider bg-surface px-2.5 py-0.5 text-meta font-medium">
                {r.toUpperCase()}
              </span>
            ))}
          </div>
        )}
      </section>

      {!name && (
        <div className="px-4 pb-3">
          <Notice icon={<IconWarning size={20} />}>{t('staleTyped')}</Notice>
        </div>
      )}

      {d.source === 'none' ? <EmptyState title={t('none')} /> : <Player key={playerKey} sky={d} params={params} compact={false} />}

      <section className="pt-4">
        <h2 className="px-4 text-ui font-semibold">{t('fov')}</h2>
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pt-2">
          {FOVS.map((f) => (
            <Chip key={f} active={f === fov} onClick={() => onChange?.({ fov: f })}>
              {t('fovValue', { arcmin: +(f * 60).toFixed(1) })}
            </Chip>
          ))}
        </div>
        <DataSize sky={d} fov={fov} />
      </section>

      <section className="pt-4">
        <h2 className="px-4 text-ui font-semibold">{t('band')}</h2>
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pt-2">
          <Chip active={!band} onClick={() => onChange?.({ band: null })}>
            {t('allBands')} <span className="opacity-70">{allCount}</span>
          </Chip>
          {BANDS.map((k) => (
            <Chip key={k} active={band === k} onClick={() => onChange?.({ band: k })}>
              <span className="size-2.5 rounded-full" style={{ background: BAND_HUE[k] }} aria-hidden="true" />
              {k} <span className="opacity-70">{d.bands[k] ?? 0}</span>
            </Chip>
          ))}
        </div>
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
                  <span className="w-full truncate text-center text-meta">{o.handle}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

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
  return { ra, dec, fov, band, name }
}

export function skyTitle(p: SkyParams) {
  return p.name ?? `${p.ra.toFixed(4)}, ${p.dec.toFixed(4)}`
}
