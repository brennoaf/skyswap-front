'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { useEffect, useMemo, useRef, useState } from 'react'
import { KitChart, QrWarning, SpectrumChart, useKitJson, type SpectraData } from '@/components/charts/charts'
import { IconDownload, IconFlask, IconLayers } from '@/components/icons'
import { ShiftAddPanel } from '@/components/lab/shift-add-panel'
import { CatalogLinks } from '@/components/ui/catalog-links'
import { Button, Chip, EmptyState, Notice, ObjectAvatar, Skeleton, TopBar } from '@/components/ui/primitives'
import { useObject, useObjectPosts } from '@/lib/api/hooks'
import { yearsSpanned } from '@/lib/long-baseline'
import { BAND_HUE, BANDS, formatBytes, formatDec, formatRa, formatShortDate } from '@/lib/format'
import { download, labNotes, saveLabNote, type LabNote } from '@/lib/notes'
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

function draw(canvas: HTMLCanvasElement, d: Decoded, nx: number, ny: number) {
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
    img.data[k * 4] = g
    img.data[k * 4 + 1] = g
    img.data[k * 4 + 2] = g
    img.data[k * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
}

export function LabView({ id }: { id: string }) {
  const locale = useLocale()
  const t = useTranslations('lab')
  const tl = useTranslations('lab.layerItems')
  const tcom = useTranslations('common')
  const { data: profile } = useObject(id)
  const { data: objectPosts } = useObjectPosts(id)
  const flipbook = objectPosts?.find((p) => p.type === 'long_baseline')
  const pack = useKitJson<Pack>(profile?.pack)
  const gaia = useKitJson<GaiaStar[]>(profile?.overlays.gaia)
  const wise = useKitJson<WiseSource[]>(profile?.overlays.wise)
  const spectra = useKitJson<SpectraData>(profile?.measurements.spectra)
  const dir = profile?.pack ? profile.pack.replace(/pack\.json$/, '') : null

  const [band, setBand] = useState<string>('')
  const [epochIdx, setEpochIdx] = useState(0)
  const [decoded, setDecoded] = useState<Decoded | null>(null)
  const [zoom, setZoom] = useState(1)
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({ target: true, gaia: true, wise: false, saturation: false, cosmic: false, persistence: false, satellite: false })
  const [pixel, setPixel] = useState<{ x: number; y: number } | null>(null)
  const [live, setLive] = useState<{ done: number; total: number; points: { iso: string; lam: number; flux: number; err: number; release: string }[] } | null>(null)
  const [notes, setNotes] = useState<LabNote[]>([])
  const [hypothesis, setHypothesis] = useState<(typeof HYPOTHESES)[number]>('moving_object')
  const [noteText, setNoteText] = useState('')
  const canvas = useRef<HTMLCanvasElement>(null)

  const epochs = useMemo(() => (pack.data?.epochs ?? []).filter((e) => e.band === band).sort((a, b) => a.mjd - b.mjd), [pack.data, band])
  const ep: PackEpoch | undefined = epochs[Math.min(epochIdx, epochs.length - 1)]
  const parts = useBand(pack.data, dir, band)
  const wcs = useMemo(() => (ep ? makeWcs({ wcs: ep.wcs, sip: ep.sip }) : null), [ep])

  useEffect(() => {
    if (!pack.data || (band && pack.data.bands[band])) return
    const best = profile?.best_bands.find((b) => pack.data?.bands[b])
    setBand(best ?? BANDS.find((b) => pack.data?.bands[b]) ?? 'D1')
  }, [pack.data, band, profile])

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
    if (decoded && ep && canvas.current) draw(canvas.current, decoded, ep.nx, ep.ny)
  }, [decoded, ep])

  useEffect(() => {
    void labNotes(id).then(setNotes)
  }, [id])

  const toPct = (x: number, y: number) => (ep ? { left: `${((x + 0.5) / ep.nx) * 100}%`, top: `${((y + 0.5) / ep.ny) * 100}%` } : {})
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

  const flagPixels = useMemo(() => {
    if (!decoded || !ep) return [] as { k: LayerKey; x: number; y: number }[]
    const out: { k: LayerKey; x: number; y: number }[] = []
    for (const k of ['saturation', 'cosmic', 'persistence', 'satellite'] as const) {
      if (!layers[k]) continue
      for (let i = 0; i < ep.nx * ep.ny; i++) if (((decoded.flags[i] as number) & FLAG_LAYERS[k]) !== 0) out.push({ k, x: i % ep.nx, y: Math.floor(i / ep.nx) })
    }
    return out
  }, [decoded, ep, layers])

  const readout = useMemo(() => {
    if (!pixel || !decoded || !ep || !wcs) return null
    const k = pixel.y * ep.nx + pixel.x
    const [ra, dec] = wcs.pix2world(pixel.x, pixel.y)
    return {
      v: decoded.image[k] as number,
      e: Math.sqrt(decoded.variance[k] as number),
      flags: flagNames(decoded.flags[k] as number),
      lam: lambdaAt(ep.wave, pixel.x, pixel.y),
      ra,
      dec,
    }
  }, [pixel, decoded, ep, wcs])

  const measureLive = async () => {
    if (!pack.data || !dir) return
    const list = pack.data.epochs.filter((e) => e.inside)
    setLive({ done: 0, total: list.length, points: [] })
    const points: { iso: string; lam: number; flux: number; err: number; release: string }[] = []
    const cache = new Map<string, Uint8Array[]>()
    let done = 0
    for (const e of list) {
      let p = cache.get(e.band)
      if (!p) {
        const info = pack.data.bands[e.band]
        if (!info) continue
        p = unpack(await (await fetch(`${dir}${info.file}`)).arrayBuffer())
        cache.set(e.band, p)
      }
      const part = p[e.index]
      if (part) {
        const d = await decodeSxq(part)
        const m = measureStar(d.image, d.variance, d.flags, e.nx, e.ny, makeWcs({ wcs: e.wcs, sip: e.sip }), e.target_radec[0], e.target_radec[1], e.wave)
        if (m && !m.rejected && Number.isFinite(m.flux_mjy)) points.push({ iso: e.iso, lam: m.wavelength_um, flux: m.flux_mjy, err: m.err_mjy, release: e.release })
      }
      done++
      if (done % 10 === 0 || done === list.length) setLive({ done, total: list.length, points: [...points] })
    }
  }

  const csv = () => {
    const rows = ['source,pass_or_date,release,wavelength_um,flux_mjy,err_mjy,saturated']
    for (const p of spectra.data?.passes ?? []) for (const q of p.points) rows.push(['kit', p.t, '', q.wavelength_um, q.flux_mjy, q.err, q.saturated].join(','))
    for (const q of live?.points ?? []) rows.push(['browser', q.iso, q.release, q.lam, q.flux, q.err, ''].join(','))
    download(`${id}-spectrum.csv`, rows.join('\n'), 'text/csv')
  }

  if (!profile) {
    return (
      <main>
        <TopBar title={t('title')} />
        <Skeleton className="m-4 h-64" />
      </main>
    )
  }

  return (
    <main className="pb-8">
      <TopBar
        title={t('title')}
      />
      <Link href={`/o/${profile.id}`} className="flex items-center gap-3 px-4 pb-3">
        <ObjectAvatar src={profile.avatar} alt="" size={44} />
        <span className="min-w-0">
          <span className="block truncate font-semibold">{profile.name}</span>
          <span className="block text-note text-text-secondary">{t('subtitle', { name: profile.handle })}</span>
        </span>
        <IconFlask size={28} className="ml-auto text-text-secondary" />
      </Link>

      {!profile.pack ? (
        <EmptyState title={t('noPack')} />
      ) : pack.isLoading ? (
        <p className="px-4 text-text-secondary">{t('loading')}</p>
      ) : pack.data ? (
        <div className="space-y-4">
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-4" role="group" aria-label={t('band')}>
            {BANDS.filter((b) => pack.data?.bands[b]).map((b) => (
              <Chip
                key={b}
                active={band === b}
                onClick={() => {
                  setBand(b)
                  setEpochIdx(0)
                  setDecoded(null)
                }}
              >
                <span className="size-2 rounded-full" style={{ background: BAND_HUE[b] }} />
                {b}
              </Chip>
            ))}
          </div>

          <div className="relative mx-auto w-full overflow-hidden bg-media-bg" style={{ aspectRatio: ep ? `${ep.nx} / ${ep.ny}` : '1 / 1' }}>
            <div className="absolute inset-0 origin-center transition-transform" style={{ transform: `scale(${zoom})` }}>
              <canvas
                ref={canvas}
                className="pixelated size-full"
                onPointerMove={(e) => {
                  if (!ep || e.pointerType !== 'mouse') return
                  const r = e.currentTarget.getBoundingClientRect()
                  setPixel({ x: Math.floor(((e.clientX - r.left) / r.width) * ep.nx), y: Math.floor(((e.clientY - r.top) / r.height) * ep.ny) })
                }}
                onClick={(e) => {
                  if (!ep) return
                  const r = e.currentTarget.getBoundingClientRect()
                  setPixel({ x: Math.floor(((e.clientX - r.left) / r.width) * ep.nx), y: Math.floor(((e.clientY - r.top) / r.height) * ep.ny) })
                }}
                onWheel={(e) => setZoom((z) => Math.min(8, Math.max(1, z * (e.deltaY < 0 ? 1.2 : 1 / 1.2))))}
                aria-label={t('pixelHint')}
              />
              {flagPixels.map((p, i) => (
                <span key={i} className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 opacity-60" style={{ ...toPct(p.x, p.y), width: `${100 / (ep?.nx ?? 1)}%`, height: `${100 / (ep?.ny ?? 1)}%`, background: LAYER_COLOR[p.k] }} />
              ))}
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
            {!decoded && <span className="absolute inset-0 flex items-center justify-center text-note text-white/70">{t('loading')}</span>}
            <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-meta text-white">{tcom('falseColour')}</span>
          </div>

          {ep && (
            <div className="px-4">
              <label className="block text-note text-text-secondary">
                {t('epoch')}, {t('epochInfo', { date: formatShortDate(ep.iso, locale), release: ep.release.toUpperCase(), lam: ep.lam_um.toFixed(3) })}
                <input type="range" min={0} max={Math.max(0, epochs.length - 1)} value={Math.min(epochIdx, epochs.length - 1)} onChange={(e) => setEpochIdx(Number(e.target.value))} className="mt-1 h-11 w-full" />
              </label>
              <p className="text-meta text-text-secondary">{t('pack', { n: epochs.length, bytes: formatBytes(pack.data.bands[band]?.bytes ?? 0) })}</p>
            </div>
          )}

          <div className="space-y-3 px-4">
                          <section className="rounded-2xl bg-surface p-3">
                <h3 className="text-ui font-semibold">{t('zoom')}</h3>
                <div className="mt-2 flex items-center gap-2">
                  {[1, 2, 4, 8].map((z) => (
                    <Chip key={z} active={Math.abs(zoom - z) < 0.01} onClick={() => setZoom(z)}>
                      {z}x
                    </Chip>
                  ))}
                  <span className="ml-auto text-meta text-text-secondary">{tcom('arcmin', { n: (((pack.data.field.fov_deg ?? 0.1) * 60) / zoom).toFixed(1) })}</span>
                </div>
                <p className="mt-2 text-meta text-text-secondary">{t('zoomHint', { size: formatBytes(pack.data.bands[band]?.bytes ?? 0) })}</p>
              </section>
            

            <section className="rounded-2xl bg-surface p-3">
              <h3 className="flex items-center gap-2 text-ui font-semibold">
                <IconLayers size={22} />
                {t('layers')}
              </h3>
              <ul className="mt-2 space-y-1">
                {(Object.keys(layers) as LayerKey[]).map((k) => {
                  return (
                    <li key={k}>
                      <label className="flex min-h-11 items-center gap-3">
                        <input type="checkbox" checked={layers[k]} onChange={(e) => setLayers((l) => ({ ...l, [k]: e.target.checked }))} className="size-5 accent-[var(--color-accent)]" />
                        <span className="size-3 rounded-full" style={{ background: LAYER_COLOR[k] }} />
                        <span className="flex-1 text-body">
                          {tl(k)}
                          {k === 'satellite' && <span className="block text-meta text-text-secondary">{t('satelliteNA')}</span>}
                          {k === 'gaia' && gaia.data && <span className="text-meta text-text-secondary">, {gaiaMarks.length}</span>}
                          {k === 'wise' && wise.data && <span className="text-meta text-text-secondary">, {wiseMarks.length}</span>}
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            </section>

            {ep && (
              <ShiftAddPanel
                key={band}
                epochs={epochs}
                parts={parts.data}
                refEpoch={ep}
                catalog={profile.pm_ra_cosdec !== null && profile.pm_dec !== null ? { pmra: profile.pm_ra_cosdec, pmdec: profile.pm_dec } : null}
              />
            )}

                          <section className="rounded-2xl bg-surface p-3" aria-live="polite">
                <h3 className="text-ui font-semibold">{t('pixel')}</h3>
                {readout ? (
                  <dl className="mt-1 space-y-0.5 font-mono text-note">
                    <dt className="sr-only">{t('pixel')}</dt>
                    <dd>
                      x {pixel?.x}, y {pixel?.y}
                    </dd>
                    <dd>{t('pixelValue', { v: Number.isFinite(readout.v) ? readout.v.toPrecision(4) : 'NaN', e: Number.isFinite(readout.e) ? readout.e.toPrecision(2) : 'NaN' })}</dd>
                    {readout.lam !== null && <dd>{t('pixelWave', { lam: readout.lam.toFixed(4) })}</dd>}
                    <dd>{t('pixelPos', { ra: formatRa(readout.ra), dec: formatDec(readout.dec) })}</dd>
                    <dd>{t('pixelFlags', { flags: readout.flags.length ? readout.flags.join(', ') : t('noFlags') })}</dd>
                  </dl>
                ) : (
                  <p className="mt-1 text-note text-text-secondary">{t('pixelHint')}</p>
                )}
              </section>
            

            <QrWarning />

                          <section className="rounded-2xl bg-surface p-3">
                <h3 className="text-ui font-semibold">{t('spectrum')}</h3>
                {spectra.data && <SpectrumChart data={spectra.data} />}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button onClick={() => void measureLive()} disabled={!!live && live.done < live.total}>
                    {live && live.done < live.total ? t('spectrumMeasuring', { done: live.done, total: live.total }) : t('spectrumLive')}
                  </Button>
                </div>
                {live && live.points.length > 0 && (
                  <SpectrumChart data={{ passes: [{ pass: 0, t: live.points[0]?.iso ?? '', points: live.points.map((p) => ({ wavelength_um: p.lam, flux_mjy: p.flux, err: p.err, saturated: false })) }] }} />
                )}
              </section>
            

            {profile.measurements.lightcurve && (
                <section className="rounded-2xl bg-surface p-3">
                  <h3 className="text-ui font-semibold">{t('lightcurve')}</h3>
                  <KitChart kind="lightcurve" url={profile.measurements.lightcurve} />
                </section>
              )}
            

                          <section className="rounded-2xl bg-surface p-3">
                <h3 className="text-ui font-semibold">{t('notes')}</h3>
                <p className="mt-1 text-meta text-text-secondary">
                  {t('noteFields', {
                    ra: readout ? formatRa(readout.ra) : '-',
                    dec: readout ? formatDec(readout.dec) : '-',
                    date: ep ? formatShortDate(ep.iso, locale) : '-',
                    band,
                  })}
                </p>
                <label className="mt-2 block text-note">
                  {t('noteHypothesis')}
                  <select value={hypothesis} onChange={(e) => setHypothesis(e.target.value as (typeof HYPOTHESES)[number])} className="mt-1 h-11 w-full rounded-[var(--radius-input)] border-[0.5px] border-divider bg-bg px-2">
                    {HYPOTHESES.map((h) => (
                      <option key={h} value={h}>
                        {t(`hypotheses.${h}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="mt-2 block text-note">
                  {t('noteText')}
                  <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={3} className="mt-1 w-full rounded-[var(--radius-input)] border-[0.5px] border-divider bg-bg px-3 py-2" />
                </label>
                <Button
                  variant="primary"
                  className="mt-2"
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
                <ul className="mt-3 space-y-2">
                  {notes.length === 0 && <li className="text-note text-text-secondary">{t('noNotes')}</li>}
                  {notes.map((n) => (
                    <li key={n.id} className="rounded-lg bg-bg p-2 text-note">
                      <p className="font-semibold">{t(`hypotheses.${n.hypothesis}`)}</p>
                      <p>{n.text}</p>
                      <p className="text-meta text-text-secondary">
                        {n.band}, {n.date ? formatShortDate(n.date, locale) : '-'}, {n.ra !== null && n.dec !== null ? `${n.ra.toFixed(5)}, ${n.dec.toFixed(5)}` : '-'}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            

                          <section className="rounded-2xl bg-surface p-3">
                <h3 className="text-ui font-semibold">{t('export')}</h3>
                <div className="mt-2 flex gap-2">
                  <Button onClick={csv} disabled={!spectra.data && !live?.points.length}>
                    <IconDownload size={20} />
                    {t('exportCsv')}
                  </Button>
                  <Button onClick={() => download(`${id}-lab-notes.json`, JSON.stringify(notes, null, 2), 'application/json')} disabled={!notes.length}>
                    <IconDownload size={20} />
                    {t('exportJson')}
                  </Button>
                </div>
              </section>
            

            <section className="rounded-2xl bg-surface p-3">
              <CatalogLinks ra={profile.ra} dec={profile.dec} />
            </section>

            <Notice>
              <p>{t('sources')}</p>
              {flipbook && (
                <Link href={`/p/${flipbook.id}`} className="mt-1 inline-block text-link">
                  {t('longBaseline', { n: yearsSpanned(flipbook), title: flipbook.title })}
                </Link>
              )}
            </Notice>
          </div>
        </div>
      ) : (
        <EmptyState title={t('noPack')} />
      )}
    </main>
  )
}
