'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations, useLocale } from 'next-intl'
import { useState, type ReactNode } from 'react'
import { BAND_EDGES, formatMonthYear, gappedPaths, robustTop, logTicks, monthTicks, nearestIndex, residualExtent, skyOffset } from '@/components/charts/chart-math'
import { Frame, linear, PLOT } from '@/components/charts/plot'
import { Button, Chip, IconButton, Notice, Segmented, Sheet, Skeleton } from '@/components/ui/primitives'
import { IconInfo, IconWarning } from '@/components/icons'
import { BAND_HUE, bandOf, BANDS, cx, formatShortDate } from '@/lib/format'
import { motionVerdictText } from '@/lib/post-text'
import { useBandName } from '@/lib/use-band'

export interface SpectraData {
  passes: { pass: number; t: string; points: { wavelength_um: number; flux_mjy: number; err: number; saturated: boolean }[] }[]
}
export interface LightcurveData {
  bands: Record<string, { t: string; mag_ab: number; err: number; saturated: boolean; n?: number }[]>
  colour_corrected: boolean
  zp_note?: string
  variability?: Record<string, { verdict?: string; spread_mag?: number; weakness?: string } | undefined>
}
export interface MotionData {
  predicted: { pass: number; t: string; ra: number; dec: number }[]
  measured: { pass: number; t: string; ra: number; dec: number; err_mas: number }[]
  verdict: string
  verdict_text?: string
  comparison?: { offset_arcsec?: number; uncertainty_arcsec?: number; systematic_floor_arcsec?: number; offset_ra_arcsec?: number; offset_dec_arcsec?: number } | null
  note?: string
}

const MEASURED_VS = ['consistent', 'marginal', 'deviates', 'inconsistent']
const POSSIBLE_CHANGE = ['varied', 'hint', 'indicative']

const PASS_COLORS = [1, 2, 3, 4, 5, 6].map((i) => `var(--color-series-${i})`)
const passColor = (i: number) => PASS_COLORS[i % PASS_COLORS.length] as string
const SQUARE = PLOT.t + PLOT.b + (PLOT.w - PLOT.l - PLOT.r)

export function useKitJson<T>(url: string | null | undefined) {
  return useQuery({
    queryKey: ['kit-json', url],
    enabled: !!url,
    staleTime: Infinity,
    queryFn: async () => {
      const r = await fetch(url as string)
      if (!r.ok) throw new Error(String(r.status))
      return (await r.json()) as T
    },
  })
}

export function ChartSkeleton() {
  return <Skeleton className="h-[220px] w-full" />
}

function ChartHead({ title, onInfo, children }: { title?: string; onInfo: () => void; children?: ReactNode }) {
  const t = useTranslations('charts')
  const info = (
    <IconButton label={t('info.open')} onClick={onInfo} className="-my-1 -mr-2 text-text-secondary">
      <IconInfo size={22} />
    </IconButton>
  )
  if (!title)
    return (
      <div className="mb-1 flex items-start gap-1">
        <div className="min-w-0 flex-1">{children}</div>
        {info}
      </div>
    )
  return (
    <div className="mb-1">
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 text-ui font-semibold">{title}</h3>
        {info}
      </div>
      {children}
    </div>
  )
}

function InfoSheet({ open, onClose, lines, children }: { open: boolean; onClose: () => void; lines: string[]; children?: ReactNode }) {
  const t = useTranslations('charts')
  return (
    <Sheet open={open} onClose={onClose} title={t('info.open')}>
      <ul className="space-y-3 px-4 py-4 text-body leading-snug">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      {children && <div className="space-y-2 px-4 pb-4 text-note leading-snug text-text-secondary">{children}</div>}
    </Sheet>
  )
}

function Readout({ head, when, body, flag }: { head?: string; when?: string; body?: string; flag?: string | false }) {
  const t = useTranslations('charts')
  return (
    <div aria-live="polite" className="mt-1 flex min-h-[52px] flex-col justify-center rounded-xl border-[0.5px] border-divider px-3 py-2 text-note leading-snug">
      {head ? (
        <>
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-semibold">{head}</span>
            {when && <span className="text-text-secondary">{when}</span>}
          </p>
          <p className="flex flex-wrap items-center gap-x-2">
            <span className="tabular-nums">{body}</span>
            {flag && (
              <span className="inline-flex items-center gap-1 text-warning">
                <IconWarning size={14} />
                {flag}
              </span>
            )}
          </p>
        </>
      ) : (
        <p className="text-text-secondary">{t('tapHint')}</p>
      )}
    </div>
  )
}

function Picked({ x, y }: { x: number; y: number }) {
  return <circle cx={x} cy={y} r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" pointerEvents="none" />
}

function TooBrightKey() {
  const t = useTranslations('charts')
  return (
    <span className="inline-flex min-h-9 items-center gap-1.5 text-meta text-text-secondary">
      <span className="inline-block size-2.5 rounded-full border-[1.5px] border-text-secondary" aria-hidden="true" />
      {t('saturated')}
    </span>
  )
}

export function SpectrumChart({ data, title, mixedBatches = false, highlight = null }: { data: SpectraData; title?: string; mixedBatches?: boolean; highlight?: [number, number] | null }) {
  const locale = useLocale()
  const t = useTranslations('charts')
  const bandName = useBandName()
  const [hidden, setHidden] = useState<number[]>([])
  const [sel, setSel] = useState<{ pass: number; i: number } | null>(null)
  const [info, setInfo] = useState(false)
  const passes = data.passes.map((p, pi) => ({ pi, t: p.t, color: passColor(pi), points: p.points.filter((q) => Number.isFinite(q.flux_mjy) && q.flux_mjy > 0) }))
  const pts = passes.flatMap((p) => p.points)
  if (!pts.length) return <p className="text-text-secondary">{t('noData')}</p>
  const fmin = Math.min(...pts.map((p) => p.flux_mjy))
  const fmax = Math.max(...pts.map((p) => p.flux_mjy))
  const log = fmax / fmin > 30
  const tf = (v: number) => (log ? Math.log10(v) : v)
  const x = linear([Math.min(...pts.map((p) => p.wavelength_um)), Math.max(...pts.map((p) => p.wavelength_um))], [PLOT.l, PLOT.w - PLOT.r], 6)
  const y = linear([tf(fmin), tf(fmax)], [PLOT.h - PLOT.b, PLOT.t], 5)
  if (log) y.ticks = logTicks(10 ** y.domain[0], 10 ** y.domain[1]).map(Math.log10)
  const shown = passes.filter((p) => !hidden.includes(p.pi))
  const marks = shown.flatMap((p) => p.points.map((q, i) => ({ x: x(q.wavelength_um), y: y(tf(q.flux_mjy)), pass: p.pi, i, q, t: p.t, color: p.color })))
  const picked = sel ? marks.find((m) => m.pass === sel.pass && m.i === sel.i) : undefined
  const sig = (v: number, digits: number) => v.toLocaleString(locale, { maximumSignificantDigits: digits })
  const toggle = (pi: number) => {
    const next = hidden.includes(pi) ? hidden.filter((h) => h !== pi) : [...hidden, pi]
    if (next.length >= passes.length) return
    setHidden(next)
    if (sel && next.includes(sel.pass)) setSel(null)
  }
  const anyHollow = marks.some((m) => m.q.saturated)
  const pickedBand = picked ? bandOf(picked.q.wavelength_um, BAND_EDGES) : null
  return (
    <figure>
      <ChartHead title={title} onInfo={() => setInfo(true)}>
        {(passes.length > 1 || anyHollow) && (
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 py-1">
            {passes.length > 1 &&
              passes.map((p) => {
                const on = !hidden.includes(p.pi)
                const date = formatShortDate(p.t, locale).replace(/ de /g, ' ')
                return (
                  <button
                    key={p.pi}
                    type="button"
                    aria-pressed={on}
                    aria-label={date ? `${t('pass', { n: p.pi + 1 })}, ${date}` : undefined}
                    onClick={() => toggle(p.pi)}
                    className={cx('hit-44 inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-[var(--radius-button)] border-[0.5px] border-divider px-2.5 text-meta font-medium', on ? 'bg-surface text-text' : 'text-text-secondary')}
                  >
                    <span className="size-2.5 rounded-full border-[1.5px]" style={{ borderColor: p.color, background: on ? p.color : 'transparent' }} aria-hidden="true" />
                    <span className={cx(!on && 'line-through')}>{date || t('pass', { n: p.pi + 1 })}</span>
                  </button>
                )
              })}
            {anyHollow && <TooBrightKey />}
          </div>
        )}
      </ChartHead>
      <Frame
        title={t('spectrumTitle')}
        x={x}
        y={y}
        xLabel={t('wavelength')}
        yLabel={t('flux')}
        xEnds={[t('xNear'), t('xFar')]}
        xFormat={(v) => v.toLocaleString(locale, { maximumFractionDigits: 1 })}
        yFormat={(v) => sig(log ? 10 ** v : v, 3)}
        onPick={(px, py) => {
          const hit = marks[nearestIndex(marks, px, py)]
          setSel(hit ? { pass: hit.pass, i: hit.i } : null)
        }}
      >
        {highlight && <rect data-testid="spectrum-highlight" x={x(highlight[0])} y={PLOT.t} width={Math.max(2, x(highlight[1]) - x(highlight[0]))} height={PLOT.h - PLOT.b - PLOT.t} fill="var(--color-warning)" fillOpacity="0.22" pointerEvents="none" />}
        {marks.map((m) => (
          <g key={`${m.pass}-${m.i}`}>
            <line x1={m.x} x2={m.x} y1={y(tf(Math.max(m.q.flux_mjy - m.q.err, fmin * 0.5)))} y2={y(tf(m.q.flux_mjy + m.q.err))} stroke={m.color} strokeOpacity="0.6" strokeWidth="1" />
            <circle cx={m.x} cy={m.y} r="2.2" fill={m.q.saturated ? 'none' : m.color} stroke={m.color} strokeWidth="1" />
          </g>
        ))}
        {picked && <Picked x={picked.x} y={picked.y} />}
      </Frame>
      <Readout
        head={picked ? `${pickedBand ? `${bandName(pickedBand)}, ` : ''}${picked.q.wavelength_um.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} µm` : undefined}
        when={picked ? formatShortDate(picked.t, locale) : undefined}
        body={picked ? t('readFlux', { value: sig(picked.q.flux_mjy, 3), err: sig(picked.q.err, 2) }) : undefined}
        flag={picked?.q.saturated && t('saturated')}
      />
      <InfoSheet open={info} onClose={() => setInfo(false)} lines={[t('info.spectrumDot'), t('info.hollow'), t('info.spectrumAxes'), ...(log ? [t('info.logScale')] : []), ...(mixedBatches ? [t('batchNote')] : [])]} />
    </figure>
  )
}

export interface PointSpectrumData {
  channels: { band: string; wavelength_um: number; value: number | null; state: string; bright: boolean }[]
}

const POINT_X: [number, number] = [0.7, 5.05]
const STRIPES_UM = [1.88, 3.3, 4.05]
const STRIPE_NEAR_UM = 0.06

export function PointSpectrumChart({ data, notes = [], extra }: { data: PointSpectrumData; notes?: string[]; extra?: ReactNode }) {
  const locale = useLocale()
  const t = useTranslations('charts')
  const [sel, setSel] = useState<number | null>(null)
  const [info, setInfo] = useState(false)
  const values = data.channels.flatMap((c) => (c.value === null ? [] : [c.value]))
  const x = linear(POINT_X, [PLOT.l, PLOT.w - PLOT.r], 6, 0)
  const top = Math.max(0, robustTop(values))
  const y = linear([Math.min(0, ...values), top], [PLOT.h - PLOT.b, PLOT.t], 5)
  const sig = (v: number, digits: number) => v.toLocaleString(locale, { maximumSignificantDigits: digits })
  const pts = data.channels.map((c) => ({ c, x: x(c.wavelength_um), y: c.value === null ? null : y(c.value) }))
  const lines = gappedPaths(pts.map((p) => ({ group: p.c.band, x: p.x, y: p.y })))
  const picked = sel === null ? undefined : pts[sel]
  const nearStripe = picked ? STRIPES_UM.some((w) => Math.abs(w - picked.c.wavelength_um) <= STRIPE_NEAR_UM) : false
  const above = (v: number | null) => v !== null && y(v) < PLOT.t
  const flag = picked ? [picked.c.bright && t('tooBright'), nearStripe && t('stripe'), above(picked.c.value) && t('offScale')].filter(Boolean).join('. ') : ''
  return (
    <figure data-testid="point-spectrum">
      <ChartHead onInfo={() => setInfo(true)}>
        <p aria-live="polite" className="text-note leading-snug" data-testid="point-reading">
          {picked && (
            <>
              <span className="font-semibold">{`${picked.c.band}, ${picked.c.wavelength_um.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} µm`}</span>{' '}
              <span className="tabular-nums">{picked.c.value === null ? t('noValue') : t('readSurface', { value: sig(picked.c.value, 3) })}</span>
              {flag && (
                <span className="flex items-center gap-1 text-warning">
                  <IconWarning size={14} className="shrink-0" />
                  {flag}
                </span>
              )}
            </>
          )}
        </p>
      </ChartHead>
      {values.length ? (
        <Frame
          title={t('pointTitle')}
          x={x}
          y={y}
          xLabel={t('wavelength')}
          yLabel={t('brightness')}
          xEnds={[t('xNear'), t('xFar')]}
          xFormat={(v) => v.toLocaleString(locale, { maximumFractionDigits: 1 })}
          yFormat={(v) => sig(v, 3)}
          onPick={(px) => {
            let best = -1
            let dist = Infinity
            pts.forEach((p, i) => {
              const d = Math.abs(p.x - px)
              if (d < dist) {
                dist = d
                best = i
              }
            })
            setSel(best < 0 ? null : best)
          }}
        >
          {lines.map((l) => (
            <path key={l.group} d={l.d} fill="none" stroke={BAND_HUE[l.group]} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {pts.map((p, i) => (p.y === null ? null : <circle key={i} cx={p.x} cy={p.y} r="1.4" fill={BAND_HUE[p.c.band]} />))}
          {pts.map((p, i) => (above(p.c.value) ? <path key={`up${i}`} d={`M${p.x - 3.5} ${PLOT.t + 4}L${p.x} ${PLOT.t - 2}L${p.x + 3.5} ${PLOT.t + 4}Z`} fill={BAND_HUE[p.c.band]} pointerEvents="none" /> : null))}
          {picked && <line x1={picked.x} x2={picked.x} y1={PLOT.t} y2={PLOT.h - PLOT.b} stroke="currentColor" strokeOpacity="0.35" strokeWidth="1" pointerEvents="none" />}
          {picked && picked.y !== null && !above(picked.c.value) && <Picked x={picked.x} y={picked.y} />}
        </Frame>
      ) : (
        <p className="py-10 text-center text-note text-text-secondary">{t('noData')}</p>
      )}
      <div className="relative h-6" aria-hidden="true">
        {BANDS.map((b) => {
          const [a, z] = BAND_EDGES[b] as [number, number]
          return (
            <span key={b} className="absolute top-0 flex flex-col items-center gap-0.5" style={{ left: `${(x(a) / PLOT.w) * 100}%`, width: `${((x(z) - x(a)) / PLOT.w) * 100}%` }}>
              <span className="h-1.5 w-full rounded-full" style={{ background: BAND_HUE[b] }} />
              <span className="text-meta leading-none text-text-secondary">{b}</span>
            </span>
          )
        })}
      </div>
      <InfoSheet open={info} onClose={() => setInfo(false)} lines={[t('info.pointPeek'), ...notes, t('info.pointGaps'), t('info.pointStripes'), ...(pts.some((p) => above(p.c.value)) ? [t('info.pointOffScale')] : []), t('info.pointUnits')]}>
        {extra}
      </InfoSheet>
    </figure>
  )
}

const CHANGE_RANK: Record<string, number> = { varied: 0, hint: 1, indicative: 2 }

export function LightCurveChart({ data, technical = false, title, mixedBatches = false }: { data: LightcurveData; technical?: boolean; title?: string; mixedBatches?: boolean }) {
  const locale = useLocale()
  const t = useTranslations('charts')
  const tp = useTranslations('profile')
  const bandName = useBandName()
  const bands = BANDS.filter((b) => data.bands[b]?.length)
  const [only, setOnly] = useState<string | null>(null)
  const [sel, setSel] = useState<{ band: string; i: number } | null>(null)
  const [info, setInfo] = useState(false)
  const shown = only ? [only] : bands
  const pts = shown.flatMap((b) => (data.bands[b] ?? []).map((p, i) => ({ ...p, band: b, i })))
  if (!pts.length) return <p className="text-text-secondary">{t('noData')}</p>
  const times = pts.map((p) => Date.parse(p.t))
  const x = linear([Math.min(...times), Math.max(...times)], [PLOT.l, PLOT.w - PLOT.r], 4, 0.08)
  const months = monthTicks(x.domain[0], x.domain[1], 4)
  x.ticks = months.length ? months : [Math.min(...times)]
  const mags = pts.flatMap((p) => [p.mag_ab - p.err, p.mag_ab + p.err])
  const y = linear([Math.max(...mags), Math.min(...mags)], [PLOT.h - PLOT.b, PLOT.t], 5)
  const fixed = (v: number, digits: number) => v.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })
  const marks = pts.map((p) => ({ x: x(Date.parse(p.t)), y: y(p.mag_ab), p }))
  const picked = sel ? marks.find((m) => m.p.band === sel.band && m.p.i === sel.i) : undefined
  const notes = shown
    .flatMap((b) => {
      const v = data.variability?.[b]
      return v?.verdict && POSSIBLE_CHANGE.includes(v.verdict) && typeof v.spread_mag === 'number' ? [{ band: b, verdict: v.verdict, spread: v.spread_mag }] : []
    })
    .sort((a, b) => (CHANGE_RANK[a.verdict] ?? 9) - (CHANGE_RANK[b.verdict] ?? 9) || b.spread - a.spread)
  const top = notes[0]
  const tested = shown.some((b) => data.variability?.[b]?.verdict === 'no_change')
  const pick = (band: string | null) => {
    setOnly(band)
    setSel(null)
  }
  return (
    <figure>
      <ChartHead title={title} onInfo={() => setInfo(true)}>
        <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto py-1">
          <Chip active={!only} onClick={() => pick(null)}>
            {tp('filterAll')}
          </Chip>
          {bands.map((b) => (
            <Chip key={b} active={only === b} onClick={() => pick(b)}>
              <span className="size-2 rounded-full" style={{ background: BAND_HUE[b] }} />
              {bandName(b)}
            </Chip>
          ))}
        </div>
      </ChartHead>
      <Frame
        title={t('lightcurveTitle')}
        x={x}
        y={y}
        xLabel=""
        yLabel={t('magnitude')}
        yEnds={[t('fainter'), t('brighter')]}
        xFormat={(v) => (months.length ? formatMonthYear(v, locale) : formatShortDate(v, locale))}
        yFormat={(v) => fixed(v, 1)}
        onPick={(px, py) => {
          const hit = marks[nearestIndex(marks, px, py)]
          setSel(hit ? { band: hit.p.band, i: hit.p.i } : null)
        }}
      >
        {shown.map((b) => {
          const list = data.bands[b] ?? []
          const c = BAND_HUE[b] ?? 'var(--color-text)'
          return (
            <g key={b}>
              <polyline points={list.map((p) => `${x(Date.parse(p.t))},${y(p.mag_ab)}`).join(' ')} fill="none" stroke={c} strokeOpacity="0.5" strokeWidth="1" />
              {list.map((p, i) => (
                <g key={i}>
                  <line x1={x(Date.parse(p.t))} x2={x(Date.parse(p.t))} y1={y(p.mag_ab - p.err)} y2={y(p.mag_ab + p.err)} stroke={c} strokeWidth="1" />
                  <circle cx={x(Date.parse(p.t))} cy={y(p.mag_ab)} r="2.6" fill={p.saturated ? 'none' : c} stroke={c} />
                </g>
              ))}
            </g>
          )
        })}
        {picked && <Picked x={picked.x} y={picked.y} />}
      </Frame>
      <Readout
        head={picked ? bandName(picked.p.band) : undefined}
        when={picked ? formatShortDate(picked.p.t, locale) : undefined}
        body={picked ? t('readMag', { value: fixed(picked.p.mag_ab, 2), err: fixed(picked.p.err, 2) }) : undefined}
        flag={picked?.p.saturated && t('saturated')}
      />
      <figcaption className="mt-2 text-note leading-snug">
        {top && (
          <p>
            {t(`variability.${top.verdict}`, { band: bandName(top.band), spread: fixed(top.spread, 2) })}
            {notes.length > 1 && ` ${t('variability.more', { n: notes.length - 1 })}`}
          </p>
        )}
        {!top && tested && <p>{t('variability.none')}</p>}
      </figcaption>
      <InfoSheet open={info} onClose={() => setInfo(false)} lines={[t('info.lightcurveDot'), t('info.magnitudeScale'), ...(pts.some((p) => p.saturated) ? [t('info.hollow')] : []), ...(mixedBatches ? [t('batchNote')] : [])]}>
        {technical && data.zp_note && <p>{data.zp_note}</p>}
      </InfoSheet>
    </figure>
  )
}

function MotionKey({ ring, pixel }: { ring: boolean; pixel: boolean }) {
  const t = useTranslations('charts')
  const item = 'inline-flex items-center gap-1.5'
  return (
    <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-meta text-text-secondary">
      <li className={item}>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M6 1V11M1 6H11" stroke="var(--color-warning)" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        {t('predicted')}
      </li>
      <li className={item}>
        <span className="inline-block size-2.5 rounded-full" style={{ background: passColor(0) }} aria-hidden="true" />
        {t('measured')}
      </li>
      {ring && (
        <li className={item}>
          <span className="inline-block size-3 rounded-full border-[1.5px] border-warning bg-warning/15" aria-hidden="true" />
          {t('margin')}
        </li>
      )}
      {pixel && (
        <li className={item}>
          <span className="inline-block size-3 rounded-full border-[1.5px] border-dashed border-text-secondary" aria-hidden="true" />
          {t('pixel')}
        </li>
      )}
    </ul>
  )
}

export function MotionChart({ data, pixelArcsec = 6.15, technical = false, title }: { data: MotionData; pixelArcsec?: number; technical?: boolean; title?: string }) {
  const locale = useLocale()
  const t = useTranslations('charts')
  const [view, setView] = useState<'residuals' | 'path'>('residuals')
  const [sel, setSel] = useState<number | null>(null)
  const [info, setInfo] = useState(false)
  const fixed = (v: number) => v.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  const near = (v: number) => v.toLocaleString(locale, Math.abs(v) < 10 ? { maximumSignificantDigits: 2 } : { maximumFractionDigits: 0 })
  const c = data.comparison
  const margin = c && typeof c.uncertainty_arcsec === 'number' && c.uncertainty_arcsec > 0 ? c.uncertainty_arcsec : null
  const hasNumbers = MEASURED_VS.includes(data.verdict) && !!c && typeof c.offset_arcsec === 'number' && margin !== null
  const floor = hasNumbers && c && typeof c.systematic_floor_arcsec === 'number' && c.systematic_floor_arcsec > 0 ? c.systematic_floor_arcsec : null
  const verdictText = motionVerdictText(data.verdict_text, locale)
  const p0 = data.predicted[0]
  if (!p0 || !data.measured.length) return <p className="text-text-secondary">{t('noData')}</p>
  const residuals = data.measured.map((m) => {
    const pred = data.predicted.reduce((best, p) => (Math.abs(Date.parse(p.t) - Date.parse(m.t)) < Math.abs(Date.parse(best.t) - Date.parse(m.t)) ? p : best), p0)
    const [dx, dy] = skyOffset(m.ra, m.dec, pred.ra, pred.dec)
    return { dx, dy, err: m.err_mas / 1000, pass: m.pass, t: m.t }
  })
  const path = {
    pred: data.predicted.map((p) => skyOffset(p.ra, p.dec, p0.ra, p0.dec)),
    meas: data.measured.map((m) => ({ xy: skyOffset(m.ra, m.dec, p0.ra, p0.dec), err: m.err_mas / 1000, pass: m.pass })),
  }
  const xr: [number, number] = [PLOT.l, PLOT.w - PLOT.r]
  const yr: [number, number] = [SQUARE - PLOT.b, PLOT.t]
  const frame = residualExtent(residuals, margin)
  let x, y, half
  if (view === 'residuals') {
    half = frame.half
    x = linear([half, -half], xr, 4, 0)
    y = linear([-half, half], yr, 4, 0)
  } else {
    const xs = [...path.pred.map((p) => p[0]), ...path.meas.map((m) => m.xy[0])]
    const ys = [...path.pred.map((p) => p[1]), ...path.meas.map((m) => m.xy[1])]
    const reach = Math.max(...path.meas.map((m) => m.err), 0)
    half = (Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1) / 2 + reach) * 1.12
    const cxm = (Math.max(...xs) + Math.min(...xs)) / 2
    const cym = (Math.max(...ys) + Math.min(...ys)) / 2
    x = linear([cxm + half, cxm - half], xr, 4, 0)
    y = linear([cym - half, cym + half], yr, 4, 0)
  }
  const scale = Math.abs(x(1) - x(0))
  const pixelFits = view === 'residuals' && pixelArcsec / 2 <= half
  const many = residuals.length > 12
  const r = many ? 1.6 : 2.6
  const marks = view === 'residuals' ? residuals.map((d) => ({ x: x(d.dx), y: y(d.dy) })) : path.meas.map((m) => ({ x: x(m.xy[0]), y: y(m.xy[1]) }))
  const picked = sel !== null ? marks[sel] : undefined
  const pickedData = sel !== null ? residuals[sel] : undefined
  const compared = view === 'residuals' && hasNumbers && c && typeof c.offset_ra_arcsec === 'number' && typeof c.offset_dec_arcsec === 'number' ? { x: x(c.offset_ra_arcsec), y: y(c.offset_dec_arcsec) } : null
  const tick = (v: number) => v.toLocaleString(locale, { maximumFractionDigits: half < 2 ? 1 : 0 })
  const pixelSize = pixelArcsec.toLocaleString(locale, { maximumFractionDigits: 2 })
  const notes = view === 'residuals' && frame.outside > 0 ? [t('outside', { n: frame.outside })] : []
  return (
    <figure>
      <ChartHead title={title} onInfo={() => setInfo(true)}>
        <p className="mb-2 text-body leading-snug" data-testid="motion-lead">
          {hasNumbers ? t(`motionLead.${data.verdict}`) : t.has(`verdict.${data.verdict}`) ? t(`verdict.${data.verdict}`) : t('verdict.unknown')}
        </p>
        <Segmented
          label={t('motionTitle')}
          value={view}
          onChange={(v) => {
            setView(v)
            setSel(null)
          }}
          options={[
            { value: 'residuals', label: t('residuals') },
            { value: 'path', label: t('path') },
          ]}
          className="my-1"
        />
      </ChartHead>
      <Frame
        title={t('motionTitle')}
        x={x}
        y={y}
        xLabel={t('east')}
        yLabel={t('north')}
        height={SQUARE}
        xFormat={tick}
        yFormat={tick}
        onPick={(px, py) => {
          const i = nearestIndex(marks, px, py)
          setSel(i < 0 ? null : i)
        }}
      >
        {view === 'residuals' ? (
          <>
            {pixelFits && <circle cx={x(0)} cy={y(0)} r={(pixelArcsec / 2) * scale} fill="none" stroke="var(--color-text-secondary)" strokeDasharray="3 3" />}
            {margin !== null && <circle cx={x(0)} cy={y(0)} r={margin * scale} fill="var(--color-warning)" fillOpacity="0.1" stroke="var(--color-warning)" strokeWidth="1.5" />}
            <path d={`M${x(0) - 6} ${y(0)}H${x(0) + 6}M${x(0)} ${y(0) - 6}V${y(0) + 6}`} stroke="var(--color-warning)" strokeWidth="1.8" strokeLinecap="round" />
            {compared && <line x1={x(0)} y1={y(0)} x2={compared.x} y2={compared.y} stroke="currentColor" strokeWidth="1" />}
            {residuals.map((d, i) => (
              <g key={i}>
                {d.err * scale > r + 1 && <circle cx={x(d.dx)} cy={y(d.dy)} r={d.err * scale} fill={passColor(d.pass)} fillOpacity="0.12" stroke={passColor(d.pass)} strokeOpacity="0.5" />}
                <circle cx={x(d.dx)} cy={y(d.dy)} r={r} fill={passColor(d.pass)} fillOpacity={many ? 0.7 : 1} />
              </g>
            ))}
            {compared && <circle cx={compared.x} cy={compared.y} r="4" fill="var(--color-bg)" stroke="currentColor" strokeWidth="1.5" />}
          </>
        ) : (
          <>
            <polyline points={path.pred.map(([a, b]) => `${x(a)},${y(b)}`).join(' ')} fill="none" stroke="var(--color-warning)" strokeDasharray="4 3" />
            {!many && path.pred.map(([a, b], i) => <path key={`p${i}`} d={`M${x(a) - 5} ${y(b)}H${x(a) + 5}M${x(a)} ${y(b) - 5}V${y(b) + 5}`} stroke="var(--color-warning)" strokeWidth="1.5" strokeLinecap="round" />)}
            {path.meas.map((m, i) => (
              <g key={`m${i}`}>
                {m.err * scale > r + 1 && <circle cx={x(m.xy[0])} cy={y(m.xy[1])} r={m.err * scale} fill="none" stroke={passColor(m.pass)} strokeOpacity="0.5" />}
                <circle cx={x(m.xy[0])} cy={y(m.xy[1])} r={r} fill={passColor(m.pass)} fillOpacity={many ? 0.7 : 1} />
              </g>
            ))}
          </>
        )}
        {picked && <Picked x={picked.x} y={picked.y} />}
        {notes.map((n, i) => (
          <text key={n} x={PLOT.w - PLOT.r - 4} y={PLOT.t + 10 + i * 12} textAnchor="end" className="fill-text-secondary text-chart">
            {n}
          </text>
        ))}
      </Frame>
      <MotionKey ring={view === 'residuals' && margin !== null} pixel={pixelFits} />
      <Readout head={pickedData ? formatShortDate(pickedData.t, locale) : undefined} body={pickedData ? t('readOffset', { dist: near(Math.hypot(pickedData.dx, pickedData.dy)) }) : undefined} />
      <InfoSheet
        open={info}
        onClose={() => setInfo(false)}
        lines={[...(hasNumbers && c && margin !== null ? [t('motionDetail', { offset: fixed(c.offset_arcsec as number), margin: fixed(margin) })] : []), t('info.motionMarks'), ...(margin !== null ? [t('info.motionRing')] : []), ...(floor !== null ? [t('info.motionAssumed', { floor: fixed(floor) })] : []), ...(compared ? [t('info.motionLine')] : []), t('info.arcsec', { size: pixelSize }), t('info.pathView')]}
      >
        {verdictText && <p>{verdictText}</p>}
        {technical && data.note && <p>{data.note}</p>}
      </InfoSheet>
    </figure>
  )
}

export interface HaloData {
  points: { mjd: number; band: string; pass_id: number; rel: number; rel_err: number }[]
  passes: { band: string; pass_id: number; mjd: number; n: number; rel: number; err: number }[]
  summary: { ratio: number; changes: boolean; brighter_mjd: number | null; fainter_mjd: number | null } | null
}

const mjdMs = (mjd: number) => (mjd - 40587) * 86_400_000
const haloPct = (rel: number) => (Math.exp(rel) - 1) * 100

export function haloBand(data: HaloData): string | null {
  const ranked = BANDS.map((b) => {
    const list = data.passes.filter((p) => p.band === b)
    return { b, n: list.length, err: list.reduce((s, p) => s + p.err, 0) / Math.max(1, list.length) }
  })
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n || a.err - b.err)
  return ranked[0]?.b ?? null
}

export function HaloChart({ data }: { data: HaloData }) {
  const locale = useLocale()
  const t = useTranslations('halo')
  const bandName = useBandName()
  const bands = BANDS.filter((b) => data.passes.some((p) => p.band === b))
  const [band, setBand] = useState<string | null>(() => haloBand(data))
  const [pass, setPass] = useState<number | null>(null)
  const [sel, setSel] = useState<number | null>(null)
  const [info, setInfo] = useState(false)
  const passes = data.passes.filter((p) => p.band === band).sort((a, b) => a.mjd - b.mjd)
  const rows =
    pass === null
      ? passes.map((p) => ({ ms: mjdMs(p.mjd), rel: p.rel, err: p.err, n: p.n, id: p.pass_id }))
      : data.points
          .filter((p) => p.band === band && p.pass_id === pass && Number.isFinite(p.rel))
          .sort((a, b) => a.mjd - b.mjd)
          .map((p) => ({ ms: mjdMs(p.mjd), rel: p.rel, err: p.rel_err, n: 1, id: p.pass_id }))
  const s = data.summary
  const dimmed = !!s && s.brighter_mjd !== null && s.fainter_mjd !== null && s.brighter_mjd < s.fainter_mjd
  const ends = s && s.brighter_mjd !== null && s.fainter_mjd !== null ? (dimmed ? [s.brighter_mjd, s.fainter_mjd] : [s.fainter_mjd, s.brighter_mjd]).map((m) => formatMonthYear(mjdMs(m), locale)) : null
  const summary = s?.changes && ends ? t(dimmed ? 'weakerBy' : 'strongerBy', { ratio: s.ratio.toLocaleString(locale, { maximumFractionDigits: 1 }), from: ends[0] as string, to: ends[1] as string }) : t('steady')
  const pick = (b: string) => {
    setBand(b)
    setPass(null)
    setSel(null)
  }
  const head = (
    <ChartHead title={t('title')} onInfo={() => setInfo(true)}>
      <p className="mb-2 text-body leading-snug" data-testid="halo-lead">
        {t('lead')} {summary}
      </p>
      <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto py-1">
        {pass !== null && (
          <Chip active onClick={() => setPass(null)}>
            {t('back')}
          </Chip>
        )}
        {bands.map((b) => (
          <Chip key={b} active={band === b} onClick={() => pick(b)}>
            <span className="size-2 rounded-full" style={{ background: BAND_HUE[b] }} />
            {bandName(b)}
          </Chip>
        ))}
      </div>
    </ChartHead>
  )
  const infoSheet = <InfoSheet open={info} onClose={() => setInfo(false)} lines={[t('info.relative'), t('info.photo'), t('info.rule'), t('info.days')]} />
  if (!rows.length)
    return (
      <figure data-testid="halo-chart">
        {head}
        {infoSheet}
      </figure>
    )
  const times = rows.map((r) => r.ms)
  const x = linear([Math.min(...times), Math.max(...times)], [PLOT.l, PLOT.w - PLOT.r], 4, 0.08)
  const months = pass === null ? monthTicks(x.domain[0], x.domain[1], 4) : []
  if (months.length) x.ticks = months
  const vals = rows.flatMap((r) => [haloPct(r.rel - r.err), haloPct(r.rel + r.err), 0])
  const y = linear([Math.min(...vals), Math.max(...vals)], [PLOT.h - PLOT.b, PLOT.t], 5)
  const marks = rows.map((r, i) => ({ x: x(r.ms), y: y(haloPct(r.rel)), r, i }))
  const picked = sel !== null ? marks[sel] : undefined
  const signed = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v).toLocaleString(locale)}%`
  const c = (band && BAND_HUE[band]) ?? 'var(--color-text)'
  return (
    <figure data-testid="halo-chart" data-view={pass === null ? 'passes' : 'photos'}>
      {head}
      <Frame
        title={t('title')}
        x={x}
        y={y}
        xLabel=""
        yLabel={t('axis')}
        yEnds={[t('weaker'), t('stronger')]}
        xFormat={(v) => (months.length ? formatMonthYear(v, locale) : formatShortDate(v, locale))}
        yFormat={signed}
        onPick={(px, py) => {
          const i = nearestIndex(marks, px, py)
          const hit = marks[i]
          if (!hit) return setSel(null)
          if (pass === null && hit.r.n > 1) {
            setPass(hit.r.id)
            setSel(null)
            return
          }
          setSel(i)
        }}
      >
        <line x1={PLOT.l} x2={PLOT.w - PLOT.r} y1={y(0)} y2={y(0)} stroke="currentColor" strokeOpacity="0.25" strokeDasharray="3 3" />
        {pass === null && <polyline points={marks.map((m) => `${m.x},${m.y}`).join(' ')} fill="none" stroke={c} strokeOpacity="0.5" strokeWidth="1" />}
        {marks.map((m) => (
          <g key={m.i}>
            <line x1={m.x} x2={m.x} y1={y(haloPct(m.r.rel - m.r.err))} y2={y(haloPct(m.r.rel + m.r.err))} stroke={c} strokeWidth="1" />
            <circle cx={m.x} cy={m.y} r={pass === null ? 3.4 : 2.2} fill={c} stroke={c} />
          </g>
        ))}
        {picked && <Picked x={picked.x} y={picked.y} />}
      </Frame>
      <Readout
        head={picked ? (pass === null ? t('pass', { date: formatShortDate(picked.r.ms, locale) }) : formatShortDate(picked.r.ms, locale)) : pass !== null ? t('pass', { date: formatShortDate(rows[0]?.ms ?? 0, locale) }) : undefined}
        when={picked ? (pass === null ? t('photos', { n: picked.r.n }) : bandName(band ?? '')) : pass !== null ? t('photos', { n: rows.length }) : undefined}
        body={picked ? t('read', { value: signed(haloPct(picked.r.rel)), err: `${Math.round(picked.r.err * 100).toLocaleString(locale)}%` }) : pass !== null ? ' ' : undefined}
      />
      {infoSheet}
    </figure>
  )
}

export function QrWarning() {
  const t = useTranslations('charts')
  return (
    <Notice tone="warning" icon={<IconWarning size={18} />}>
      {t('qrWarning')}
    </Notice>
  )
}

const TITLE_KEY = { spectrum: 'spectrumTitle', lightcurve: 'lightcurveTitle', motion: 'motionTitle' } as const

export function KitChart({ kind, url, technical = false, titled = false, mixedBatches = false, highlight = null }: { kind: 'spectrum' | 'lightcurve' | 'motion' | 'halo'; url: string; technical?: boolean; titled?: boolean; mixedBatches?: boolean; highlight?: [number, number] | null }) {
  const t = useTranslations('charts')
  const tc = useTranslations('common')
  const q = useKitJson<SpectraData & LightcurveData & MotionData & HaloData>(url)
  if (q.isLoading) return <ChartSkeleton />
  if (!q.data)
    return (
      <div role="alert" className="flex items-center gap-3 rounded-xl border-[0.5px] border-divider px-3 py-2 text-note">
        <span className="min-w-0 flex-1">{t('loadFailed')}</span>
        <Button className="h-9 shrink-0" onClick={() => void q.refetch()}>
          {tc('retry')}
        </Button>
      </div>
    )
  if (kind === 'halo') return <HaloChart data={q.data} />
  const title = titled ? t(TITLE_KEY[kind]) : undefined
  if (kind === 'spectrum') return <SpectrumChart data={q.data} title={title} mixedBatches={mixedBatches} highlight={highlight} />
  if (kind === 'lightcurve') return <LightCurveChart data={q.data} technical={technical} title={title} mixedBatches={mixedBatches} />
  return <MotionChart data={q.data} technical={technical} title={title} />
}
