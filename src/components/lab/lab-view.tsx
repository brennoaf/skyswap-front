'use client'

import { useQuery } from '@tanstack/react-query'
import { useReducedMotion } from 'framer-motion'
import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { KitChart, SpectrumChart, useKitJson, type SpectraData } from '@/components/charts/charts'
import { mixesBatches } from '@/components/charts/chart-math'
import { IconChevronLeft, IconChevronRight, IconClock, IconCrosshair, IconDownload, IconExpand, IconEye, IconEyeOff, IconLink, IconQuestion, IconShrink, IconStepBack, IconStepForward, IconWarning } from '@/components/icons'
import { LabTour, PanelLine, TOOLS, type Tool } from '@/components/lab/lab-intro'
import { ShiftAddPanel } from '@/components/lab/shift-add-panel'
import { BandTile } from '@/components/ui/band-tile'
import { CatalogLinks } from '@/components/ui/catalog-links'
import { Button, Chip, EmptyState, IconButton, ObjectAvatar, Sheet, Skeleton, Switch, TopBar } from '@/components/ui/primitives'
import { useObject, useObjectPosts, useSky } from '@/lib/api/hooks'
import { buildLightPack, LIGHT_FOV_DEG, LIGHT_MAX_PHOTOS } from '@/lib/lab/coord-pack'
import { yearsSpanned } from '@/lib/long-baseline'
import { BAND_HUE, BANDS, cssColor, cx, formatDate, formatDateTime, formatDec, formatRa, formatShortDate } from '@/lib/format'
import { download, labNotes, saveLabNote, type LabNote } from '@/lib/notes'
import { postTitle } from '@/lib/post-text'
import { useUi } from '@/lib/state/ui'
import { useBandName } from '@/lib/use-band'
import { decodeSxq, FLAG_LAYERS, flagNames, lambdaAt, makeWcs, measureStar, percentileOf, unpack, type Decoded, type Pack, type PackEpoch } from '@/lib/sky/lab'

type LayerKey = 'target' | 'gaia' | 'wise' | 'saturation' | 'cosmic' | 'persistence' | 'satellite'

const LAYER_COLOR: Record<LayerKey, string> = {
  target: 'var(--color-crosshair)',
  gaia: 'var(--color-layer-gaia)',
  wise: 'var(--color-layer-wise)',
  saturation: 'var(--color-layer-saturation)',
  cosmic: 'var(--color-layer-cosmic)',
  persistence: 'var(--color-layer-persistence)',
  satellite: 'var(--color-layer-satellite)',
}
const HYPOTHESES = ['moving_object', 'variable', 'artifact', 'saturation', 'unknown'] as const

interface GaiaStar {
  source_id: string
  ra: number
  dec: number
  ref_epoch: number
  pm_ra: number | null
  pm_dec: number | null
  g_mag: number
}
interface WiseSource {
  ra: number
  dec: number
  epoch: string
  w1: number | null
  w2: number | null
  source: string
}

function useBand(pack: Pack | undefined, dir: string | null, band: string) {
  return useQuery({
    queryKey: ['pack-band', dir, band],
    enabled: !!pack && !!dir && !!pack.bands[band],
    staleTime: Infinity,
    queryFn: async () => {
      const info = (pack as Pack).bands[band] as { file: string }
      const r = await fetch(`${dir}${info.file}`)
      if (!r.ok) throw new Error(String(r.status))
      return unpack(await r.arrayBuffer())
    },
  })
}

export type LabPoint = { ra: number; dec: number; band: string | null }

function useLightPack(point: LabPoint | undefined, band: string, name: string) {
  const sky = useSky(point ? point.ra : null, point ? point.dec : null, LIGHT_FOV_DEG, null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const counts = sky.data?.bands
  const pointBytes = sky.data?.point_bytes ?? null
  const q = useQuery({
    queryKey: ['light-pack', point?.ra, point?.dec, band],
    enabled: !!point && !!band && !!counts && (counts[band] ?? 0) > 0,
    staleTime: Infinity,
    retry: false,
    queryFn: ({ signal }) => {
      setProgress(null)
      return buildLightPack({ ra: (point as LabPoint).ra, dec: (point as LabPoint).dec, band, name, bandCounts: counts ?? {}, pointBytes, signal, onProgress: (done, total) => setProgress({ done, total }) })
    },
  })
  return { sky, q, progress }
}

const FLAG_KEYS = ['saturation', 'cosmic', 'persistence', 'satellite'] as const
const FLAG_ALPHA = 153

function tokenRgb(token: string): [number, number, number] {
  const n = parseInt(cssColor(token).slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const bandRgb = (band: string) => tokenRgb(`--color-band-${band.toLowerCase()}`)

const clampCentre = (v: number, zoom: number) => Math.min(1 - 0.5 / zoom, Math.max(0.5 / zoom, v))

type LivePoint = { iso: string; lam: number; flux: number; err: number; release: string }
type Live = { done: number; total: number; points: LivePoint[]; failed: boolean }

function draw(canvas: HTMLCanvasElement, d: Decoded, nx: number, ny: number, hue: [number, number, number]) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  canvas.width = nx
  canvas.height = ny
  const lo = percentileOf(d.image, 1)
  const hi = percentileOf(d.image, 99.5)
  const img = ctx.createImageData(nx, ny)
  for (let k = 0; k < nx * ny; k++) {
    const v = d.image[k] as number
    const g = Number.isFinite(v) ? Math.max(0, Math.min(255, Math.round(Math.sqrt(Math.max(0, (v - lo) / (hi - lo || 1))) * 255))) : 0
    const t = g / 255
    const dark = Math.min(1, t / 0.6)
    const light = Math.max(0, (t - 0.6) / 0.4)
    img.data[k * 4] = hue[0] * dark * (1 - light) + 255 * light
    img.data[k * 4 + 1] = hue[1] * dark * (1 - light) + 255 * light
    img.data[k * 4 + 2] = hue[2] * dark * (1 - light) + 255 * light
    img.data[k * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
}

const PHOTO_HEIGHT = { large: '34dvh', small: '18dvh', hidden: '0px' } as const

type PhotoSize = keyof typeof PHOTO_HEIGHT

const CAVEAT_LAYERS: readonly LayerKey[] = ['wise', 'satellite']
const LONG_NAME = 13
const EDGE_FADE = 'pointer-events-none absolute inset-y-0 z-10 flex w-9 items-center from-bg from-40% to-transparent text-icon-muted transition-opacity motion-reduce:transition-none'

function Toolbar({ value, onChange }: { value: Tool; onChange: (t: Tool) => void }) {
  const t = useTranslations('lab.tools')
  const reduce = useReducedMotion()
  const box = useRef<HTMLDivElement>(null)
  const [edge, setEdge] = useState({ left: false, right: true })
  const readEdge = useCallback(() => {
    const b = box.current
    if (!b) return
    const left = b.scrollLeft > 4
    const right = b.scrollLeft + b.clientWidth < b.scrollWidth - 4
    setEdge((e) => (e.left === left && e.right === right ? e : { left, right }))
  }, [])
  useEffect(() => {
    const b = box.current
    const a = b?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (b && a) b.scrollTo({ left: a.offsetLeft - (b.clientWidth - a.offsetWidth) / 2, behavior: reduce ? 'auto' : 'smooth' })
  }, [value, reduce])
  useEffect(() => {
    readEdge()
    window.addEventListener('resize', readEdge)
    return () => window.removeEventListener('resize', readEdge)
  }, [readEdge])
  return (
    <div className="relative shrink-0 border-b-[0.5px] border-divider">
      <div ref={box} role="tablist" aria-label={t('label')} onScroll={readEdge} className="no-scrollbar relative flex overflow-x-auto">
        {TOOLS.map((tool) => {
          const on = tool.key === value
          return (
            <button
              key={tool.key}
              id={`lab-tab-${tool.key}`}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls="lab-panel"
              onClick={() => onChange(tool.key)}
              className={cx('relative flex min-h-14 w-[18.2%] min-w-16 shrink-0 flex-col items-center justify-center gap-0.5 px-0.5', on ? 'text-text' : 'text-icon-muted')}
            >
              <tool.icon size={24} />
              <span className="max-w-full truncate text-meta font-medium">{t(tool.key)}</span>
              {on && <span className="absolute bottom-0 h-[2px] w-10 rounded-full bg-text" />}
            </button>
          )
        })}
      </div>
      <span aria-hidden="true" className={cx(EDGE_FADE, 'left-0 bg-gradient-to-r', edge.left ? 'opacity-100' : 'opacity-0')}>
        <IconChevronLeft size={16} />
      </span>
      <span aria-hidden="true" className={cx(EDGE_FADE, 'right-0 justify-end bg-gradient-to-l', edge.right ? 'opacity-100' : 'opacity-0')}>
        <IconChevronRight size={16} />
      </span>
    </div>
  )
}

function PhotoButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="inline-flex size-11 items-center justify-center text-text active:scale-90">
      {children}
    </button>
  )
}

const ACTION_ROW = 'flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left active:bg-surface-pressed disabled:opacity-50'

function ActionRow({ icon, title, hint, disabled, onClick }: { icon: ReactNode; title: string; hint?: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={ACTION_ROW}>
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-body font-medium">{title}</span>
        {hint && <span className="block text-meta text-text-secondary">{hint}</span>}
      </span>
    </button>
  )
}

function Reading({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={wide ? 'col-span-2' : undefined}>
      <dt className="text-meta text-text-secondary">{label}</dt>
      <dd className="text-body tabular-nums">{children}</dd>
    </div>
  )
}

function EpochGrid({ epochs, value, onChange }: { epochs: PackEpoch[]; value: number; onChange: (i: number) => void }) {
  const locale = useLocale()
  const t = useTranslations('lab.tools')
  const active = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    active.current?.scrollIntoView({ block: 'nearest' })
  }, [value])
  return (
    <div role="group" aria-label={t('dates')} className="grid auto-rows-max grid-cols-3 gap-1.5">
      {epochs.map((e, i) => {
        const on = i === value
        return (
          <button
            key={`${e.iso}-${i}`}
            ref={on ? active : undefined}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(i)}
            className={cx('flex min-h-11 flex-col items-center justify-center rounded-lg border-[0.5px] px-1 py-1 leading-tight', on ? 'border-text bg-text text-bg' : 'border-divider bg-surface text-text')}
          >
            <span className="text-body font-medium">{formatDate(e.iso, locale, { day: 'numeric', month: 'short' })}</span>
            <span className={cx('text-micro', !on && 'text-text-secondary')}>
              {e.iso.slice(0, 4)}, {new Date(e.iso).toISOString().slice(11, 16)}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function LabView({ id, point }: { id: string; point?: LabPoint }) {
  const locale = useLocale()
  const num = (v: number, digits: number) => v.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })
  const t = useTranslations('lab')
  const tb = useTranslations('bands')
  const tl = useTranslations('lab.layerItems')
  const tcom = useTranslations('common')
  const tch = useTranslations('charts')
  const tcat = useTranslations('catalogs')
  const introDone = useUi((s) => s.labIntroDone)
  const language = useUi((s) => s.languageChosen)
  const finishIntro = useUi((s) => s.finishLabIntro)
  const [hydrated, setHydrated] = useState(false)
  const [replay, setReplay] = useState(false)
  const [catalogs, setCatalogs] = useState(false)
  useEffect(() => setHydrated(true), [])
  const touring = hydrated && language && (replay || !introDone)
  const { data: profile } = useObject(point ? '' : id)
  const { data: objectPosts } = useObjectPosts(point ? undefined : id)
  const flipbook = objectPosts?.find((p) => p.type === 'long_baseline')
  const kitPack = useKitJson<Pack>(point ? undefined : profile?.pack)
  const pointName = point ? `${formatRa(point.ra)} ${formatDec(point.dec)}` : ''
  const gaia = useKitJson<GaiaStar[]>(profile?.overlays.gaia)
  const wise = useKitJson<WiseSource[]>(profile?.overlays.wise)
  const spectra = useKitJson<SpectraData>(profile?.measurements.spectra)
  const dir = profile?.pack ? profile.pack.replace(/pack\.json$/, '') : null

  const [band, setBand] = useState<string>(point?.band ?? '')
  const light = useLightPack(point, band, pointName)
  const pack = point ? { data: light.q.data?.pack, isLoading: light.sky.isLoading || light.q.isLoading } : kitPack
  const subject = point
    ? { name: pointName, ra: point.ra, dec: point.dec, hasPack: true }
    : profile
      ? { name: profile.name, ra: profile.ra, dec: profile.dec, hasPack: !!profile.pack }
      : null
  const [epochIdx, setEpochIdx] = useState(0)
  const [photo, setPhoto] = useState<PhotoSize>('large')
  const [decoded, setDecoded] = useState<Decoded | null>(null)
  const [zoom, setZoom] = useState(1)
  const [centre, setCentre] = useState({ x: 0.5, y: 0.5 })
  const pan = useRef<{ x: number; y: number; cx: number; cy: number; w: number; h: number; moved: boolean } | null>(null)
  const panned = useRef(false)
  const bandName = useBandName()
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({ target: true, gaia: false, wise: false, saturation: false, cosmic: false, persistence: false, satellite: false })
  const [pixel, setPixel] = useState<{ x: number; y: number } | null>(null)
  const [live, setLive] = useState<Live | null>(null)
  const [notes, setNotes] = useState<LabNote[]>([])
  const [hypothesis, setHypothesis] = useState<(typeof HYPOTHESES)[number]>('moving_object')
  const [noteText, setNoteText] = useState('')
  const [tool, setTool] = useState<Tool>('date')
  const canvas = useRef<HTMLCanvasElement>(null)
  const flagCanvas = useRef<HTMLCanvasElement>(null)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const epochs = useMemo(() => (pack.data?.epochs ?? []).filter((e) => e.band === band).sort((a, b) => a.mjd - b.mjd), [pack.data, band])
  const ep: PackEpoch | undefined = epochs[Math.min(epochIdx, epochs.length - 1)]
  const kitParts = useBand(point ? undefined : pack.data, dir, band)
  const parts = point ? { data: light.q.data?.parts } : kitParts
  const bandInfo = useMemo(() => {
    const out: Record<string, { min: number; max: number; n: number }> = {}
    for (const e of pack.data?.epochs ?? []) {
      const o = out[e.band] ?? { min: e.lam_um, max: e.lam_um, n: 0 }
      out[e.band] = { min: Math.min(o.min, e.lam_um), max: Math.max(o.max, e.lam_um), n: o.n + 1 }
    }
    return out
  }, [pack.data])
  const pickBand = (b: string) => {
    const list = (pack.data?.epochs ?? []).filter((e) => e.band === b).sort((x, y) => x.mjd - y.mjd)
    const mjd = ep?.mjd ?? 0
    let best = 0
    list.forEach((e, i) => {
      if (Math.abs(e.mjd - mjd) < Math.abs((list[best]?.mjd ?? 0) - mjd)) best = i
    })
    setBand(b)
    setEpochIdx(best)
    setDecoded(null)
  }
  const wcs = useMemo(() => (ep ? makeWcs({ wcs: ep.wcs, sip: ep.sip }) : null), [ep])
  const mixed = useMemo(() => mixesBatches((pack.data?.epochs ?? []).map((e) => e.release)), [pack.data])

  const skyBands = light.sky.data?.bands
  useEffect(() => {
    if (!point || band || !skyBands) return
    const most = Object.entries(skyBands).sort((a, b) => b[1] - a[1])[0]
    if (most && most[1] > 0) setBand(most[0])
  }, [point, band, skyBands])

  useEffect(() => {
    if (point || !pack.data || (band && pack.data.bands[band])) return
    const best = profile?.best_bands.find((b) => pack.data?.bands[b])
    setBand(best ?? BANDS.find((b) => pack.data?.bands[b]) ?? 'D1')
  }, [point, pack.data, band, profile])

  useEffect(() => {
    let alive = true
    const part = ep && parts.data?.[ep.index]
    if (!part) return
    void decodeSxq(part).then((d) => {
      if (alive) setDecoded(d)
    })
    return () => {
      alive = false
    }
  }, [ep, parts.data])

  useEffect(() => {
    if (decoded && ep && canvas.current) draw(canvas.current, decoded, ep.nx, ep.ny, bandRgb(ep.band))
  }, [decoded, ep])

  useEffect(() => {
    void labNotes(id).then(setNotes)
  }, [id])

  const year = ep ? 2000 + (ep.mjd - 51544.5) / 365.25 : 2016

  const gaiaMarks = useMemo(() => {
    if (!wcs || !ep || !gaia.data) return []
    return gaia.data
      .map((s) => {
        const dt = year - s.ref_epoch
        const ra = s.ra + ((s.pm_ra ?? 0) / 3.6e6) * dt / Math.cos((s.dec * Math.PI) / 180)
        const dec = s.dec + ((s.pm_dec ?? 0) / 3.6e6) * dt
        const [x, y] = wcs.world2pix(ra, dec)
        const [x2, y2] = wcs.world2pix(ra + ((s.pm_ra ?? 0) / 3.6e6) * 10 / Math.cos((s.dec * Math.PI) / 180), dec + ((s.pm_dec ?? 0) / 3.6e6) * 10)
        return { id: s.source_id, x, y, x2, y2, g: s.g_mag }
      })
      .filter((s) => s.x > -1 && s.y > -1 && s.x < ep.nx && s.y < ep.ny)
  }, [wcs, ep, gaia.data, year])

  const wiseMarks = useMemo(() => {
    if (!wcs || !ep || !wise.data) return []
    return wise.data.map((s, i) => ({ i, xy: wcs.world2pix(s.ra, s.dec), epoch: s.epoch })).filter((s) => s.xy[0] > -1 && s.xy[1] > -1 && s.xy[0] < ep.nx && s.xy[1] < ep.ny)
  }, [wcs, ep, wise.data])

  const flagsOn = FLAG_KEYS.map((k) => layers[k]).join()
  useEffect(() => {
    const c = flagCanvas.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx || !ep) return
    c.width = ep.nx
    c.height = ep.ny
    if (!decoded) return
    const on = flagsOn.split(',')
    const img = ctx.createImageData(ep.nx, ep.ny)
    FLAG_KEYS.forEach((k, j) => {
      if (on[j] !== 'true') return
      const [r, g, b] = tokenRgb(`--color-layer-${k}`)
      const mask = FLAG_LAYERS[k]
      for (let i = 0; i < ep.nx * ep.ny; i++) {
        if (((decoded.flags[i] as number) & mask) === 0) continue
        img.data[i * 4] = r
        img.data[i * 4 + 1] = g
        img.data[i * 4 + 2] = b
        img.data[i * 4 + 3] = FLAG_ALPHA
      }
    })
    ctx.putImageData(img, 0, 0)
  }, [decoded, ep, flagsOn])

  const readout = useMemo(() => {
    if (!pixel || !decoded || !ep || !wcs) return null
    const k = pixel.y * ep.nx + pixel.x
    const [ra, dec] = wcs.pix2world(pixel.x, pixel.y)
    const v = decoded.image[k] as number
    let below = 0
    let total = 0
    if (Number.isFinite(v)) {
      for (let i = 0; i < decoded.image.length; i++) {
        const other = decoded.image[i] as number
        if (!Number.isFinite(other)) continue
        total++
        if (other < v) below++
      }
    }
    return {
      v,
      share: total ? below / total : null,
      e: Math.sqrt(decoded.variance[k] as number),
      flags: flagNames(decoded.flags[k] as number),
      lam: lambdaAt(ep.wave, pixel.x, pixel.y),
      ra,
      dec,
    }
  }, [pixel, decoded, ep, wcs])

  const measureLive = async () => {
    if (!pack.data || (!dir && !point)) return
    const list = pack.data.epochs.filter((e) => e.inside)
    const points: LivePoint[] = []
    setLive({ done: 0, total: list.length, points, failed: false })
    const cache = new Map<string, Uint8Array[]>()
    let done = 0
    try {
      for (const e of list) {
        if (!alive.current) return
        let p = cache.get(e.band)
        if (!p && point) p = parts.data
        if (!p) {
          const info = pack.data.bands[e.band]
          if (!info) continue
          const r = await fetch(`${dir}${info.file}`)
          if (!r.ok) throw new Error(String(r.status))
          p = unpack(await r.arrayBuffer())
          cache.set(e.band, p)
        }
        const part = p[e.index]
        if (part) {
          const d = await decodeSxq(part)
          const m = measureStar(d.image, d.variance, d.flags, e.nx, e.ny, makeWcs({ wcs: e.wcs, sip: e.sip }), e.target_radec[0], e.target_radec[1], e.wave)
          if (m && !m.rejected && Number.isFinite(m.flux_mjy)) points.push({ iso: e.iso, lam: m.wavelength_um, flux: m.flux_mjy, err: m.err_mjy, release: e.release })
        }
        done++
        if (alive.current && done % 10 === 0) setLive({ done, total: list.length, points: [...points], failed: false })
      }
      if (alive.current) setLive({ done: list.length, total: list.length, points: [...points], failed: false })
    } catch {
      if (alive.current) setLive({ done: list.length, total: list.length, points: [...points], failed: true })
    }
  }
  const measuring = !!live && !live.failed && live.done < live.total
  const pickZoom = (z: number) => {
    setZoom(z)
    setCentre((c) => ({ x: clampCentre(c.x, z), y: clampCentre(c.y, z) }))
  }
  const flagLabels = (names: string[]) => [...new Set(names.map((f) => (t.has(`flagNames.${f}`) ? t(`flagNames.${f}`) : t('flagNames.other'))))]

  const csv = () => {
    const rows = ['source,pass_or_date,release,wavelength_um,flux_mjy,err_mjy,saturated']
    for (const p of spectra.data?.passes ?? []) for (const q of p.points) rows.push(['kit', p.t, '', q.wavelength_um, q.flux_mjy, q.err, q.saturated].join(','))
    for (const q of live?.points ?? []) rows.push(['browser', q.iso, q.release, q.lam, q.flux, q.err, ''].join(','))
    download(`${id}-spectrum.csv`, rows.join('\n'), 'text/csv')
  }

  if (!subject) {
    return (
      <main>
        <TopBar title={t('title')} />
        <Skeleton className="m-4 h-64" />
      </main>
    )
  }

  const long = subject.name.length > LONG_NAME
  const startTour = () => {
    setPhoto('large')
    setReplay(true)
  }
  const endTour = () => {
    finishIntro()
    setReplay(false)
    setTool('date')
  }
  const share = readout?.share ?? null
  const percent = share === null ? null : Math.floor(share * 100)

  return (
    <main className="fixed inset-0 z-40 mx-auto flex w-full max-w-[var(--width-app)] flex-col overflow-hidden overscroll-none bg-bg pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <TopBar
        className="shrink-0"
        title={<span className={long ? 'line-clamp-2 whitespace-normal break-words text-title-sm leading-[1.15]' : 'block truncate'}>{subject.name}</span>}
        actions={
          <>
            {subject.hasPack && (
              <>
                <PhotoButton label={photo === 'large' ? t('tools.photoSmaller') : t('tools.photoBigger')} onClick={() => setPhoto(photo === 'large' ? 'small' : 'large')}>
                  {photo === 'large' ? <IconShrink size={22} /> : <IconExpand size={22} />}
                </PhotoButton>
                <PhotoButton label={photo === 'hidden' ? t('tools.photoShow') : t('tools.photoHide')} onClick={() => setPhoto(photo === 'hidden' ? 'large' : 'hidden')}>
                  {photo === 'hidden' ? <IconEye size={22} /> : <IconEyeOff size={22} />}
                </PhotoButton>
              </>
            )}
            {profile && (
              <Link href={`/o/${profile.id}`} aria-label={t('profile', { name: profile.name })} className="inline-flex size-11 items-center justify-center">
                <ObjectAvatar src={profile.avatar} alt="" size={32} />
              </Link>
            )}
          </>
        }
      />

      {!subject.hasPack ? (
        <EmptyState title={t('noPack')} />
      ) : point && light.sky.data && !Object.values(light.sky.data.bands).some((n) => n > 0) ? (
        <EmptyState title={t('light.none')} />
      ) : point && (light.q.isError || light.sky.isError) ? (
        <EmptyState title={t('light.failed')} action={<Button onClick={() => void (light.sky.isError ? light.sky.refetch() : light.q.refetch())}>{tcom('retry')}</Button>} />
      ) : pack.isLoading ? (
        <p className="px-4 text-text-secondary" role="status" data-testid="lab-light-progress">
          {point && light.progress ? t('light.building', { done: light.progress.done, total: light.progress.total }) : t('loading')}
        </p>
      ) : pack.data && pack.data.epochs.length === 0 ? (
        <EmptyState title={t('light.none')} />
      ) : pack.data ? (
        <>
          <div
            data-tour="lab-photo"
            className={cx('relative mx-auto shrink-0 overflow-hidden bg-media-bg motion-safe:transition-[width]', photo === 'hidden' && 'hidden', zoom > 1 && 'touch-none')}
            style={{ aspectRatio: ep ? `${ep.nx} / ${ep.ny}` : '1 / 1', width: ep ? `min(100%, calc(${PHOTO_HEIGHT[photo]} * ${ep.nx / ep.ny}))` : `min(100%, ${PHOTO_HEIGHT[photo]})` }}
            onPointerDown={(e) => {
              if (zoom <= 1) return
              const r = e.currentTarget.getBoundingClientRect()
              pan.current = { x: e.clientX, y: e.clientY, cx: centre.x, cy: centre.y, w: r.width, h: r.height, moved: false }
            }}
            onPointerMove={(e) => {
              const p = pan.current
              if (!p) return
              const dx = e.clientX - p.x
              const dy = e.clientY - p.y
              if (!p.moved && Math.hypot(dx, dy) < 6) return
              if (!p.moved) {
                p.moved = true
                panned.current = true
                e.currentTarget.setPointerCapture(e.pointerId)
              }
              setCentre({ x: clampCentre(p.cx - dx / (p.w * zoom), zoom), y: clampCentre(p.cy - dy / (p.h * zoom), zoom) })
            }}
            onPointerUp={() => {
              pan.current = null
            }}
            onPointerCancel={() => {
              pan.current = null
              panned.current = false
            }}
            onClickCapture={(e) => {
              if (!panned.current) return
              panned.current = false
              e.stopPropagation()
            }}
          >
            <div className="absolute inset-0 origin-center" style={{ transform: `translate(${(0.5 - centre.x) * 100 * zoom}%, ${(0.5 - centre.y) * 100 * zoom}%) scale(${zoom})` }}>
              <canvas
                ref={canvas}
                className="pixelated size-full"
                onClick={(e) => {
                  if (!ep) return
                  if (tool !== 'notes') setTool('pixel')
                  const r = e.currentTarget.getBoundingClientRect()
                  setPixel({ x: Math.floor(((e.clientX - r.left) / r.width) * ep.nx), y: Math.floor(((e.clientY - r.top) / r.height) * ep.ny) })
                }}
                aria-label={t('pixelHint')}
              />
              <canvas ref={flagCanvas} aria-hidden="true" className="pixelated pointer-events-none absolute inset-0 size-full" />
              <svg className="pointer-events-none absolute inset-0 size-full" viewBox={`0 0 ${ep?.nx ?? 1} ${ep?.ny ?? 1}`} preserveAspectRatio="none" aria-hidden="true">
                {layers.gaia &&
                  gaiaMarks.map((s) => (
                    <g key={s.id} stroke={LAYER_COLOR.gaia} strokeWidth={0.18} fill="none">
                      <circle cx={s.x + 0.5} cy={s.y + 0.5} r={Math.max(0.5, 2.2 - s.g / 10)} />
                      <line x1={s.x + 0.5} y1={s.y + 0.5} x2={s.x2 + 0.5} y2={s.y2 + 0.5} />
                    </g>
                  ))}
                {layers.wise &&
                  wiseMarks.map((s) => (
                    <path key={s.i} d={`M${s.xy[0]} ${s.xy[1]}l1 1M${s.xy[0] + 1} ${s.xy[1]}l-1 1`} stroke={LAYER_COLOR.wise} strokeWidth={0.18} />
                  ))}
                {layers.target && ep && (
                  <g stroke={LAYER_COLOR.target} strokeWidth={0.25} fill="none">
                    <circle cx={ep.target_xy[0] + 0.5} cy={ep.target_xy[1] + 0.5} r={2} />
                    <path d={`M${ep.target_xy[0] + 0.5} ${ep.target_xy[1] - 3}v1.5M${ep.target_xy[0] + 0.5} ${ep.target_xy[1] + 2.5}v1.5M${ep.target_xy[0] - 3} ${ep.target_xy[1] + 0.5}h1.5M${ep.target_xy[0] + 2.5} ${ep.target_xy[1] + 0.5}h1.5`} />
                  </g>
                )}
                {pixel && <rect x={pixel.x} y={pixel.y} width={1} height={1} fill="none" stroke="var(--color-mark-outline)" strokeWidth={0.15} />}
              </svg>
            </div>
            {!decoded && <span className="absolute inset-0 flex items-center justify-center text-note text-text-secondary">{t('loading')}</span>}
          </div>
          <p className="flex shrink-0 items-baseline justify-between gap-3 px-3 pt-1.5 text-meta text-text-secondary">
            <span className="min-w-0 truncate text-note font-medium text-text">{ep ? formatDate(ep.iso, locale) : ''}</span>
            <span className="shrink-0">{tcom('falseColour')}</span>
          </p>
          {point && (
            <p className="shrink-0 px-3 text-meta text-text-secondary" data-testid="lab-light-note">
              {t('light.note', { n: LIGHT_MAX_PHOTOS })}
            </p>
          )}
          {ep && (
            <div data-tour="lab-dates" className="flex shrink-0 items-center gap-1 px-2">
              <IconButton label={t('tools.prev')} onClick={() => setEpochIdx((i) => Math.max(0, i - 1))} disabled={epochIdx <= 0}>
                <IconStepBack size={22} />
              </IconButton>
              <label className="min-w-0 flex-1">
                <span className="sr-only">{t('epoch')}</span>
                <input type="range" min={0} max={Math.max(0, epochs.length - 1)} value={Math.min(epochIdx, epochs.length - 1)} onChange={(e) => setEpochIdx(Number(e.target.value))} className="h-11 w-full" />
              </label>
              <IconButton label={t('tools.next')} onClick={() => setEpochIdx((i) => Math.min(epochs.length - 1, i + 1))} disabled={epochIdx >= epochs.length - 1}>
                <IconStepForward size={22} />
              </IconButton>
            </div>
          )}

          <div data-tour="lab-tools" className="flex min-h-0 flex-1 flex-col">
            <Toolbar value={tool} onChange={setTool} />
            <div id="lab-panel" role="tabpanel" aria-labelledby={`lab-tab-${tool}`} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 pb-6 pt-2">
              {tool === 'date' && ep && (
                <>
                  <PanelLine
                    title={t('tools.date')}
                    info={
                      <>
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                          <Reading label={t('tools.time')} wide>
                            {formatDateTime(ep.iso, locale)}
                          </Reading>
                          <Reading label={t('pixelSky')}>{t('skyDegrees', { ra: num(ep.target_radec[0], 2), dec: num(ep.target_radec[1], 2) })}</Reading>
                          <Reading label={t('tools.release')}>{ep.release.toUpperCase()}</Reading>
                          <Reading label={t('tools.light')} wide>
                            {t('tools.lightValue', { band: bandName(band), lam: num(ep.lam_um, 2) })}
                          </Reading>
                        </dl>
                        <p className="text-note text-text-secondary">{t('tools.timeHint')}</p>
                      </>
                    }
                  >
                    {t('pack', { n: epochs.length })}
                  </PanelLine>
                  <EpochGrid epochs={epochs} value={Math.min(epochIdx, epochs.length - 1)} onChange={setEpochIdx} />
                </>
              )}

              {tool === 'colour' && (
                <>
                  <PanelLine
                    title={t('tools.colour')}
                    info={
                      <>
                        <p>{t('tools.colourAbout')}</p>
                        <p>{tb('explain')}</p>
                        <p>{t('tools.colourSwitch')}</p>
                      </>
                    }
                  >
                    {t('tools.colourCount', { band: bandName(band), n: bandInfo[band]?.n ?? 0 })}
                  </PanelLine>
                  <div className="grid grid-cols-3 gap-2" role="group" aria-label={t('band')}>
                    {BANDS.filter((b) => pack.data?.bands[b]).map((b) => {
                      const info = bandInfo[b]
                      return <BandTile key={b} label={bandName(b)} hue={BAND_HUE[b] ?? ''} detail={info ? t('tools.bandWave', { min: num(info.min, 1), max: num(info.max, 1) }) : undefined} on={band === b} onClick={() => pickBand(b)} />
                    })}
                  </div>
                  <div>
                    <div className="h-1.5 rounded-full" style={{ background: 'var(--gradient-bands)' }} />
                    <div className="mt-1 flex justify-between gap-4 text-meta text-text-secondary">
                      <span>{t('tools.colourShort')}</span>
                      <span className="text-right">{t('tools.colourLong')}</span>
                    </div>
                  </div>
                </>
              )}

              {tool === 'zoom' && (
                <>
                  <div className="grid grid-cols-4 gap-2 pt-1" role="group" aria-label={t('zoom')}>
                    {[1, 2, 4, 8].map((z) => (
                      <Chip key={z} active={zoom === z} onClick={() => pickZoom(z)} className="min-h-12 w-full justify-center text-ui">
                        {z}x
                      </Chip>
                    ))}
                  </div>
                  <p className="text-note leading-snug text-text-secondary">{t('zoomField', { n: num(((pack.data.field.fov_deg ?? 0.1) * 60) / zoom, 1) })}</p>
                </>
              )}

              {tool === 'layers' && (
                <>
                  <PanelLine
                    title={t('layers')}
                    info={
                      <ul className="space-y-3">
                        {(Object.keys(layers) as LayerKey[]).map((k) => (
                          <li key={k} className="flex gap-3">
                            <span className="mt-1.5 size-3 shrink-0 rounded-full" style={{ background: LAYER_COLOR[k] }} />
                            <span className="min-w-0 leading-snug">
                              <span className="block text-body font-medium">{tl(k)}</span>
                              <span className="block text-note text-text-secondary">{t(`layerHints.${k}`)}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    }
                  >
                    {t('layersLine')}
                  </PanelLine>
                  <ul className="divide-y-[0.5px] divide-divider overflow-hidden rounded-2xl bg-surface">
                    {(Object.keys(layers) as LayerKey[]).map((k) => (
                      <li key={k}>
                        <label className="flex min-h-12 items-center gap-3 px-3 py-1.5 active:bg-surface-pressed">
                          <span className="size-3 shrink-0 rounded-full" style={{ background: LAYER_COLOR[k] }} />
                          <span className="min-w-0 flex-1">
                            <span className="block text-body font-medium">
                              {tl(k)}
                              {k === 'gaia' && gaia.data && <span className="font-normal tabular-nums text-text-secondary"> {gaiaMarks.length}</span>}
                              {k === 'wise' && wise.data && <span className="font-normal tabular-nums text-text-secondary"> {wiseMarks.length}</span>}
                            </span>
                            {layers[k] && CAVEAT_LAYERS.includes(k) && <span className="block text-meta leading-snug text-text-secondary">{t(`layerHints.${k}`)}</span>}
                          </span>
                          <Switch checked={layers[k]} onChange={(e) => setLayers((l) => ({ ...l, [k]: e.target.checked }))} />
                        </label>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {tool === 'pixel' && (
                <div aria-live="polite" className="space-y-3">
                  {readout ? (
                    <>
                      <PanelLine title={t('pixel')} info={<p>{t('pixelUnitHint')}</p>}>
                        {t('pixelPlace')}: {t('pixelXY', { x: pixel?.x ?? 0, y: pixel?.y ?? 0 })}
                      </PanelLine>
                      <div className="rounded-xl bg-surface p-3">
                        <p className="font-[family-name:var(--font-display)] text-title-md font-bold leading-tight">
                          {percent === null ? t('pixelNone') : percent >= 50 ? t('pixelBrighter', { n: Math.min(99, percent) }) : t('pixelDarker', { n: Math.min(99, 100 - percent) })}
                        </p>
                        {percent !== null && <p className="mt-1 text-note tabular-nums text-text-secondary">{t('pixelUnit', { v: readout.v.toPrecision(4), e: Number.isFinite(readout.e) ? readout.e.toPrecision(2) : '-' })}</p>}
                        {readout.flags.length > 0 && (
                          <ul className="mt-2 flex flex-wrap gap-1" aria-label={t('pixelFlags')}>
                            {flagLabels(readout.flags).map((f) => (
                              <li key={f} className="rounded-full bg-bg px-2 py-0.5 text-meta font-medium text-warning">
                                {f}
                              </li>
                            ))}
                          </ul>
                        )}
                        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t-[0.5px] border-divider pt-3">
                          <Reading label={t('pixelSky')} wide={readout.lam === null}>
                            {t('pixelPos', { ra: formatRa(readout.ra), dec: formatDec(readout.dec) })}
                          </Reading>
                          {readout.lam !== null && <Reading label={t('pixelWave')}>{t('pixelWaveValue', { lam: num(readout.lam, 4) })}</Reading>}
                        </dl>
                      </div>
                    </>
                  ) : (
                    <p className="flex items-center gap-3 rounded-xl bg-surface p-3 text-note leading-snug">
                      <IconCrosshair size={24} className="shrink-0" />
                      {t('pixelHint')}
                    </p>
                  )}
                </div>
              )}

              {tool === 'motion' && ep && (
                <ShiftAddPanel
                  key={band}
                  epochs={epochs}
                  parts={parts.data}
                  refEpoch={ep}
                  catalog={profile && profile.pm_ra_cosdec !== null && profile.pm_dec !== null ? { pmra: profile.pm_ra_cosdec, pmdec: profile.pm_dec } : null}
                />
              )}

              {tool === 'spectrum' && (
                <>
                  {mixed && (
                    <PanelLine title={t('spectrum')} info={<p>{tch('qrWarning')}</p>}>
                      <span className="flex items-center gap-2 text-text">
                        <IconWarning size={18} className="shrink-0 text-warning" />
                        {t('batchWarning')}
                      </span>
                    </PanelLine>
                  )}
                  <section className="rounded-2xl bg-surface p-3">
                    <h3 className="text-ui font-semibold">{t('spectrum')}</h3>
                    {spectra.data && (
                      <div className="mt-2">
                        <SpectrumChart data={spectra.data} />
                      </div>
                    )}
                    <Button variant="ghost" className="mt-2 h-11 w-full bg-bg" onClick={() => void measureLive()} disabled={measuring}>
                      {measuring && live ? t('spectrumMeasuring', { done: live.done, total: live.total }) : t('spectrumLive')}
                    </Button>
                    {live?.failed && (
                      <p className="mt-2 text-note text-danger" role="alert">
                        {t('spectrumFailed')}
                      </p>
                    )}
                    {live && live.points.length > 0 && (
                      <div className="mt-2">
                        <p className="flex items-center gap-2 pb-1 text-note leading-snug">
                          <IconWarning size={18} className="shrink-0 text-warning" />
                          {point ? t('light.spectrumNote') : t('spectrumLiveNote')}
                        </p>
                        <SpectrumChart data={{ passes: [{ pass: 0, t: live.points[0]?.iso ?? '', points: live.points.map((p) => ({ wavelength_um: p.lam, flux_mjy: p.flux, err: p.err, saturated: false })) }] }} />
                      </div>
                    )}
                  </section>
                  {profile?.measurements.lightcurve && (
                    <section className="rounded-2xl bg-surface p-3">
                      <h3 className="text-ui font-semibold">{t('lightcurve')}</h3>
                      <KitChart kind="lightcurve" url={profile.measurements.lightcurve} technical />
                    </section>
                  )}
                </>
              )}

              {tool === 'notes' && (
                <>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-surface p-3">
                    <Reading label={t('tools.date')}>{ep ? formatShortDate(ep.iso, locale) : '-'}</Reading>
                    <Reading label={t('tools.colour')}>{bandName(band)}</Reading>
                    <Reading label={t('pixelSky')} wide>
                      {readout ? t('pixelPos', { ra: formatRa(readout.ra), dec: formatDec(readout.dec) }) : <span className="text-text-secondary">{t('notePickSpot')}</span>}
                    </Reading>
                  </dl>
                  <div>
                    <p className="pb-1.5 text-note font-medium">{t('noteHypothesis')}</p>
                    <div className="flex flex-wrap gap-2" role="group" aria-label={t('noteHypothesis')}>
                      {HYPOTHESES.map((h) => (
                        <Chip key={h} active={hypothesis === h} onClick={() => setHypothesis(h)}>
                          {t(`hypotheses.${h}`)}
                        </Chip>
                      ))}
                    </div>
                  </div>
                  <label className="block text-note font-medium">
                    {t('noteText')}
                    <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={3} className="mt-1.5 w-full rounded-[var(--radius-input)] border-[0.5px] border-divider bg-bg px-3 py-2 text-body font-normal" />
                  </label>
                  <Button
                    variant="primary"
                    className="h-11 w-full"
                    disabled={!noteText.trim()}
                    onClick={async () => {
                      const note: LabNote = {
                        id: `${id}-${Date.now()}`,
                        objectId: id,
                        ra: readout?.ra ?? null,
                        dec: readout?.dec ?? null,
                        date: ep?.iso ?? null,
                        band,
                        wavelength: readout?.lam ?? ep?.lam_um ?? null,
                        hypothesis,
                        text: noteText.trim(),
                        createdAt: Date.now(),
                      }
                      await saveLabNote(note)
                      setNoteText('')
                      setNotes(await labNotes(id))
                    }}
                  >
                    {t('noteAdd')}
                  </Button>
                  <p className="text-meta text-text-secondary">{t('noteLocal')}</p>
                  {notes.length > 0 && (
                    <ul className="space-y-2">
                      {notes.map((n) => (
                        <li key={n.id} className="rounded-xl bg-surface p-3 text-note">
                          <p className="font-semibold">{t(`hypotheses.${n.hypothesis}`)}</p>
                          <p className="mt-0.5">{n.text}</p>
                          <p className="mt-1 text-meta text-text-secondary">
                            {bandName(n.band)}, {n.date ? formatShortDate(n.date, locale) : '-'}
                            {n.ra !== null && n.dec !== null && `, ${t('skyDegrees', { ra: num(n.ra, 4), dec: num(n.dec, 4) })}`}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}

              {tool === 'more' && (
                <>
                  <ul className="mt-1 divide-y-[0.5px] divide-divider overflow-hidden rounded-2xl bg-surface">
                    <li>
                      <ActionRow icon={<IconQuestion size={22} />} title={t('tour.again')} onClick={startTour} />
                    </li>
                    <li>
                      <ActionRow icon={<IconLink size={22} />} title={tcat('title')} onClick={() => setCatalogs(true)} />
                    </li>
                    {flipbook && (
                      <li>
                        <Link href={`/p/${flipbook.id}`} className={ACTION_ROW}>
                          <IconClock size={22} className="shrink-0" />
                          <span className="min-w-0 flex-1 text-body font-medium">{t('longBaseline', { n: yearsSpanned(flipbook), title: postTitle(flipbook.title, locale) })}</span>
                        </Link>
                      </li>
                    )}
                  </ul>
                  <section aria-labelledby="lab-export">
                    <h3 id="lab-export" className="px-1 pb-1.5 text-meta font-semibold uppercase tracking-wide text-text-secondary">
                      {t('export')}
                    </h3>
                    <ul className="divide-y-[0.5px] divide-divider overflow-hidden rounded-2xl bg-surface">
                      <li>
                        <ActionRow icon={<IconDownload size={22} />} title={t('exportCsv')} disabled={!spectra.data && !live?.points.length} onClick={csv} />
                      </li>
                      <li>
                        <ActionRow icon={<IconDownload size={22} />} title={t('exportJson')} hint={notes.length ? undefined : t('exportJsonEmpty')} disabled={!notes.length} onClick={() => download(`${id}-lab-notes.json`, JSON.stringify(notes, null, 2), 'application/json')} />
                      </li>
                    </ul>
                  </section>
                  <p className="px-1 text-meta leading-snug text-text-secondary">{t('sources')}</p>
                  <Sheet open={catalogs} onClose={() => setCatalogs(false)} labelledBy="catalogs-title">
                    <CatalogLinks ra={subject.ra} dec={subject.dec} className="px-4 pt-2" />
                  </Sheet>
                </>
              )}
            </div>
          </div>
          {touring && !!ep && <LabTour onTool={setTool} onClose={endTour} />}
        </>
      ) : (
        <EmptyState title={t('noPack')} />
      )}
    </main>
  )
}
