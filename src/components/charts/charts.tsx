'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations, useLocale } from 'next-intl'
import { useState } from 'react'
import { Frame, Legend, linear, PLOT } from '@/components/charts/plot'
import { Chip, Notice, Skeleton } from '@/components/ui/primitives'
import { IconWarning } from '@/components/icons'
import { BAND_HUE, BANDS, formatShortDate } from '@/lib/format'

export interface SpectraData {
  passes: { pass: number; t: string; points: { wavelength_um: number; flux_mjy: number; err: number; saturated: boolean }[] }[]
}
export interface LightcurveData {
  bands: Record<string, { t: string; mag_ab: number; err: number; saturated: boolean; n?: number }[]>
  colour_corrected: boolean
  zp_note?: string
}
export interface MotionData {
  predicted: { pass: number; t: string; ra: number; dec: number }[]
  measured: { pass: number; t: string; ra: number; dec: number; err_mas: number }[]
  verdict: string
  note?: string
}

const PASS_COLORS = [1, 2, 3, 4, 5, 6].map((i) => `var(--color-series-${i})`)

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

export function SpectrumChart({ data }: { data: SpectraData }) {
  const locale = useLocale()
  const t = useTranslations('charts')
  const pts = data.passes.flatMap((p) => p.points.filter((q) => Number.isFinite(q.flux_mjy) && q.flux_mjy > 0))
  if (!pts.length) return <p className="text-text-secondary">{t('noData')}</p>
  const fmin = Math.min(...pts.map((p) => p.flux_mjy))
  const fmax = Math.max(...pts.map((p) => p.flux_mjy))
  const log = fmax / fmin > 30
  const tf = (v: number) => (log ? Math.log10(v) : v)
  const x = linear([Math.min(...pts.map((p) => p.wavelength_um)), Math.max(...pts.map((p) => p.wavelength_um))], [PLOT.l, PLOT.w - PLOT.r], 6)
  const y = linear([tf(fmin), tf(fmax)], [PLOT.h - PLOT.b, PLOT.t], 5)
  return (
    <figure>
      <Frame title={t('spectrumTitle')} x={x} y={y} xLabel={t('wavelength')} yLabel={t('flux')} xFormat={(v) => v.toFixed(1)} yFormat={(v) => (log ? (10 ** v).toPrecision(2) : v.toPrecision(3))}>
        {data.passes.map((p, i) => {
          const c = PASS_COLORS[i % PASS_COLORS.length] as string
          return (
            <g key={p.pass}>
              {p.points
                .filter((q) => Number.isFinite(q.flux_mjy) && q.flux_mjy > 0)
                .map((q, j) => {
                  const cy = y(tf(q.flux_mjy))
                  const hi = y(tf(q.flux_mjy + q.err))
                  const lo = y(tf(Math.max(q.flux_mjy - q.err, fmin * 0.5)))
                  return (
                    <g key={j}>
                      <line x1={x(q.wavelength_um)} x2={x(q.wavelength_um)} y1={lo} y2={hi} stroke={c} strokeOpacity="0.6" strokeWidth="1" />
                      <circle cx={x(q.wavelength_um)} cy={cy} r="2.2" fill={q.saturated ? 'none' : c} stroke={c} strokeWidth="1" />
                    </g>
                  )
                })}
            </g>
          )
        })}
      </Frame>
      <Legend items={[...data.passes.map((p, i) => ({ color: PASS_COLORS[i % PASS_COLORS.length] as string, label: `${t('pass', { n: i + 1 })}, ${formatShortDate(p.t, locale)}` })), { color: 'var(--color-text-secondary)', label: t('saturated'), hollow: true }]} />
      <figcaption className="mt-2 text-meta text-text-secondary">{t('spectrumHint')}</figcaption>
    </figure>
  )
}

export function LightCurveChart({ data }: { data: LightcurveData }) {
  const t = useTranslations('charts')
  const tp = useTranslations('profile')
  const bands = BANDS.filter((b) => data.bands[b]?.length)
  const [only, setOnly] = useState<string | null>(null)
  const shown = only ? [only] : bands
  const pts = shown.flatMap((b) => (data.bands[b] ?? []).map((p) => ({ ...p, band: b })))
  if (!pts.length) return <p className="text-text-secondary">{t('noData')}</p>
  const times = pts.map((p) => Date.parse(p.t))
  const x = linear([Math.min(...times), Math.max(...times)], [PLOT.l, PLOT.w - PLOT.r], 4)
  const mags = pts.flatMap((p) => [p.mag_ab - p.err, p.mag_ab + p.err])
  const y = linear([Math.max(...mags), Math.min(...mags)], [PLOT.h - PLOT.b, PLOT.t], 5)
  return (
    <figure>
      <div className="no-scrollbar -mt-1 mb-1 flex gap-1.5 overflow-x-auto py-1">
        <Chip active={!only} onClick={() => setOnly(null)} className="hit-44">
          {tp('filterAll')}
        </Chip>
        {bands.map((b) => (
          <Chip key={b} active={only === b} onClick={() => setOnly(b)} className="hit-44">
            <span className="size-2 rounded-full" style={{ background: BAND_HUE[b] }} />
            {b}
          </Chip>
        ))}
      </div>
      <Frame title={t('lightcurveTitle')} x={x} y={y} xLabel={t('date')} yLabel={t('magnitude')} xFormat={(v) => new Date(v).toISOString().slice(2, 7)} yFormat={(v) => v.toFixed(1)}>
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
      </Frame>
      <figcaption className="mt-2 space-y-2 text-meta text-text-secondary">
        <p>{t('lightcurveHint')}</p>
        {data.zp_note && <p>{data.zp_note}</p>}
      </figcaption>
    </figure>
  )
}

function offsets(ra: number, dec: number, ra0: number, dec0: number): [number, number] {
  return [(ra - ra0) * Math.cos((dec0 * Math.PI) / 180) * 3600, (dec - dec0) * 3600]
}

export function MotionChart({ data, pixelArcsec = 6.15 }: { data: MotionData; pixelArcsec?: number }) {
  const t = useTranslations('charts')
  const [view, setView] = useState<'residuals' | 'path'>('residuals')
  const p0 = data.predicted[0]
  if (!p0 || !data.measured.length) return <p className="text-text-secondary">{t('noData')}</p>
  const residuals = data.measured.map((m) => {
    const pred = data.predicted.reduce((best, p) => (Math.abs(Date.parse(p.t) - Date.parse(m.t)) < Math.abs(Date.parse(best.t) - Date.parse(m.t)) ? p : best), p0)
    const [dx, dy] = offsets(m.ra, m.dec, pred.ra, pred.dec)
    return { dx, dy, err: m.err_mas / 1000, pass: m.pass }
  })
  const path = {
    pred: data.predicted.map((p) => offsets(p.ra, p.dec, p0.ra, p0.dec)),
    meas: data.measured.map((m) => ({ xy: offsets(m.ra, m.dec, p0.ra, p0.dec), err: m.err_mas / 1000, pass: m.pass })),
  }
  const square = (vals: number[]) => {
    const m = Math.max(pixelArcsec * 0.6, ...vals.map(Math.abs))
    return [-m, m] as [number, number]
  }
  const h = 300
  let x, y
  if (view === 'residuals') {
    const d = square(residuals.flatMap((r) => [r.dx + r.err, r.dx - r.err, r.dy + r.err, r.dy - r.err]))
    x = linear([d[1], d[0]], [PLOT.l, PLOT.w - PLOT.r], 5)
    y = linear(d, [h - PLOT.b, PLOT.t], 5)
  } else {
    const xs = [...path.pred.map((p) => p[0]), ...path.meas.map((m) => m.xy[0])]
    const ys = [...path.pred.map((p) => p[1]), ...path.meas.map((m) => m.xy[1])]
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), pixelArcsec) / 2
    const cxm = (Math.max(...xs) + Math.min(...xs)) / 2
    const cym = (Math.max(...ys) + Math.min(...ys)) / 2
    x = linear([cxm + span, cxm - span], [PLOT.l, PLOT.w - PLOT.r], 5)
    y = linear([cym - span, cym + span], [h - PLOT.b, PLOT.t], 5)
  }
  const scale = Math.abs(x(1) - x(0))
  return (
    <figure>
      <div className="mb-2 flex gap-1.5">
        <Chip active={view === 'residuals'} onClick={() => setView('residuals')}>
          {t('residuals')}
        </Chip>
        <Chip active={view === 'path'} onClick={() => setView('path')}>
          {t('path')}
        </Chip>
      </div>
      <Frame title={t('motionTitle')} x={x} y={y} xLabel={t('east')} yLabel={t('north')} height={h} xFormat={(v) => v.toFixed(Math.abs(v) < 10 ? 1 : 0)} yFormat={(v) => v.toFixed(Math.abs(v) < 10 ? 1 : 0)}>
        {view === 'residuals' ? (
          <>
            <circle cx={x(0)} cy={y(0)} r={(pixelArcsec / 2) * scale} fill="none" stroke="var(--color-warning)" strokeDasharray="3 3" />
            <circle cx={x(0)} cy={y(0)} r="3.5" fill="none" stroke="var(--color-warning)" strokeWidth="1.5" />
            {residuals.map((r, i) => (
              <g key={i}>
                <circle cx={x(r.dx)} cy={y(r.dy)} r={Math.max(1.5, r.err * scale)} fill={PASS_COLORS[r.pass % PASS_COLORS.length]} fillOpacity="0.12" stroke={PASS_COLORS[r.pass % PASS_COLORS.length]} strokeOpacity="0.5" />
                <circle cx={x(r.dx)} cy={y(r.dy)} r="2.2" fill={PASS_COLORS[r.pass % PASS_COLORS.length]} />
              </g>
            ))}
          </>
        ) : (
          <>
            <polyline points={path.pred.map(([a, b]) => `${x(a)},${y(b)}`).join(' ')} fill="none" stroke="var(--color-warning)" strokeDasharray="4 3" />
            {path.pred.map(([a, b], i) => (
              <circle key={`p${i}`} cx={x(a)} cy={y(b)} r="4" fill="none" stroke="var(--color-warning)" strokeWidth="1.5" />
            ))}
            {path.meas.map((m, i) => (
              <g key={`m${i}`}>
                <circle cx={x(m.xy[0])} cy={y(m.xy[1])} r={Math.max(1.5, m.err * scale)} fill="none" stroke={PASS_COLORS[m.pass % PASS_COLORS.length]} strokeOpacity="0.5" />
                <circle cx={x(m.xy[0])} cy={y(m.xy[1])} r="2.2" fill={PASS_COLORS[m.pass % PASS_COLORS.length]} />
              </g>
            ))}
          </>
        )}
      </Frame>
      <Legend items={[{ color: 'var(--color-warning)', label: t('predicted'), hollow: true }, { color: PASS_COLORS[0] as string, label: `${t('measured')}, ${t('points', { n: data.measured.length })}` }, { color: 'var(--color-warning)', label: `- - ${t('pixel')}`, hollow: true }]} />
      <figcaption className="mt-2 space-y-2 text-meta text-text-secondary">
        <p className="font-semibold text-text">{t.has(`verdict.${data.verdict}`) ? t(`verdict.${data.verdict}`) : data.verdict}</p>
        <p>{view === 'residuals' ? t('residualHint') : t('motionHint')}</p>
        {data.note && <p>{data.note}</p>}
      </figcaption>
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

export function KitChart({ kind, url }: { kind: 'spectrum' | 'lightcurve' | 'motion'; url: string }) {
  const q = useKitJson<SpectraData & LightcurveData & MotionData>(url)
  if (q.isLoading) return <ChartSkeleton />
  if (!q.data) return null
  if (kind === 'spectrum') return <SpectrumChart data={q.data} />
  if (kind === 'lightcurve') return <LightCurveChart data={q.data} />
  return <MotionChart data={q.data} />
}
