'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import type { FindingDetail, Story } from '@/lib/api/client'
import { cx, formatShortDate } from '@/lib/format'

export type StoryScreen = Story['screens'][number]
type Blink = Extract<StoryScreen, { kind: 'blink' }>
type Still = Extract<StoryScreen, { kind: 'still' }>
type Curve = Extract<StoryScreen, { kind: 'curve' }>
type Colours = Extract<StoryScreen, { kind: 'colours' }>
type End = Extract<StoryScreen, { kind: 'end' }>
type Finding = FindingDetail

const BLINK_MS = { years: 450, passes: 800, night: 650, brightness: 900 } as const
const BLINK_HOLD_MS = 1000
const CELL_STEP_MS = 380
const CELL_START_MS = 150

export function screenMs(s: StoryScreen | FindScreen): number {
  if (s.kind === 'blink') return Math.max(5200, s.frames.length * BLINK_MS[s.topic] + BLINK_HOLD_MS)
  if (s.kind === 'colours') return 6500
  if (s.kind === 'find-blink') return Math.max(5200, s.finding.passes * 800 + BLINK_HOLD_MS)
  return 6000
}

export function screenImages(s: StoryScreen | FindScreen): string[] {
  if (s.kind === 'blink') return s.frames.map((f) => f.src)
  if (s.kind === 'colours') return s.frames.map((f) => f.src)
  if (s.kind === 'still') return [s.src]
  if (s.kind === 'find-blink' && s.finding.sprite) return [s.finding.sprite]
  return []
}

export type FindScreen = { kind: 'find-blink'; finding: Finding } | { kind: 'find-checks'; finding: Finding } | { kind: 'find-end'; finding: Finding }

export function blinkIndex(elapsed: number, n: number, interval: number): number {
  if (n < 2) return 0
  const cycle = n * interval + BLINK_HOLD_MS
  return Math.min(n - 1, Math.floor((elapsed % cycle) / interval))
}

function Chip({ children, side, tone = 'scrim' }: { children: ReactNode; side: 'left' | 'right' | 'centre'; tone?: 'scrim' | 'warning' }) {
  return (
    <span
      className={cx(
        'story-chrome absolute top-2.5 rounded-full px-2.5 py-1 text-meta font-semibold tabular-nums',
        side === 'left' && 'left-2.5',
        side === 'right' && 'right-2.5',
        side === 'centre' && 'left-1/2 -translate-x-1/2',
        tone === 'warning' ? 'bg-warning text-on-warning' : 'bg-media-scrim text-on-media',
      )}
    >
      {children}
    </span>
  )
}

function Caption({ children }: { children: ReactNode }) {
  return <p className="story-chrome min-h-24 px-[18px] pb-2.5 pt-4 text-body font-medium leading-snug text-on-media">{children}</p>
}

function Was({ x, y }: { x: number; y: number }) {
  return <span aria-hidden="true" className="pointer-events-none absolute size-[34px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-on-media-muted" style={{ left: `${x * 100}%`, top: `${y * 100}%` }} />
}

function Now({ x, y }: { x: number; y: number }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 30 30" className="pointer-events-none absolute size-[30px] -translate-x-1/2 -translate-y-1/2 text-warning" style={{ left: `${x * 100}%`, top: `${y * 100}%` }}>
      <path d="M15 0v9M15 21v9M0 15h9M21 15h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function useBandChip() {
  const t = useTranslations('stories')
  const locale = useLocale()
  return (band: string | null, um: number | null) => (band ? t('bandChip', { band }) : um !== null ? t('wavelengthChip', { um: um.toLocaleString(locale) }) : null)
}

function monthsBetween(a: string, b: string): number {
  return Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / (30.44 * 86_400_000)))
}

function useSpan() {
  const t = useTranslations('stories')
  return {
    months: (a: string, b: string) => {
      const m = monthsBetween(a, b)
      return m >= 11 && m <= 13 ? t('oneYear') : t('months', { n: m })
    },
    hours: (h: number) => (h < 1 ? t('minutes', { n: Math.max(1, Math.round(h * 60)) }) : t('hours', { n: h < 10 ? Math.round(h * 10) / 10 : Math.round(h) })),
  }
}

function frameChip(locale: string, topic: Blink['topic'], f: Blink['frames'][number]): string {
  const d = new Date(f.t)
  if (topic === 'years') return `${d.getUTCFullYear()}, ${f.telescope ?? 'SPHEREx'}`
  if (topic === 'night') return `${d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC`
  return d.toLocaleDateString(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' })
}

function Photo({ children }: { children: ReactNode }) {
  return <div className="relative aspect-square w-full overflow-hidden bg-media-bg">{children}</div>
}

export function BlinkScreen({ screen, name, elapsed }: { screen: Blink; name: string; elapsed: number }) {
  const t = useTranslations('stories')
  const locale = useLocale()
  const chip = useBandChip()
  const span = useSpan()
  const k = blinkIndex(elapsed, screen.frames.length, BLINK_MS[screen.topic])
  const first = screen.frames[0]
  const last = screen.frames[screen.frames.length - 1]
  const now = screen.frames[k]
  const band = chip(screen.band, screen.wavelength_um)
  const named = screen.band ?? (screen.wavelength_um !== null ? t('wavelengthChip', { um: screen.wavelength_um.toLocaleString(locale) }) : '')
  const from = first ? frameChip(locale, screen.topic === 'years' ? 'years' : 'passes', first).split(',')[0] : ''
  const hours = first && last ? (Date.parse(last.t) - Date.parse(first.t)) / 3_600_000 : 0
  const caption =
    screen.topic === 'years'
      ? t('captions.years', { years: first && last ? new Date(last.t).getUTCFullYear() - new Date(first.t).getUTCFullYear() : 0, band: named, from })
      : screen.topic === 'night'
        ? t('captions.night', { span: span.hours(hours), band: named, name })
        : t(screen.topic === 'brightness' ? 'captions.brightness' : 'captions.passes', { span: first && last ? span.months(first.t, last.t) : '', band: named, from: first ? formatShortDate(first.t, locale) : '' })
  return (
    <>
      <Photo>
        {screen.frames.map((f, i) => (
          <Image key={f.src} src={f.src} alt={i === k ? t('frameAlt', { name, date: formatShortDate(f.t, locale) }) : ''} fill sizes="470px" unoptimized className={cx('pixelated object-contain', i !== k && 'opacity-0')} />
        ))}
        {screen.fixed && first?.mark && <Was x={first.mark.x} y={first.mark.y} />}
        {now?.mark && <Now x={now.mark.x} y={now.mark.y} />}
        {band && <Chip side="left">{band}</Chip>}
        {now && (
          <Chip side="right">
            <span data-testid="story-when">{frameChip(locale, screen.topic, now)}</span>
          </Chip>
        )}
      </Photo>
      <Caption>{caption}</Caption>
    </>
  )
}

export function StillScreen({ screen, name }: { screen: Still; name: string }) {
  const t = useTranslations('stories')
  const chip = useBandChip()
  const span = useSpan()
  const band = chip(screen.band, null)
  const named = screen.band ?? ''
  return (
    <>
      <Photo>
        <Image src={screen.src} alt={t('differenceAlt', { name })} fill sizes="470px" unoptimized className="pixelated object-contain" />
        {band && <Chip side="left">{band}</Chip>}
      </Photo>
      <Caption>{screen.hours !== null ? t('captions.difference', { band: named, gap: span.hours(screen.hours) }) : t('captions.differenceLater', { band: named })}</Caption>
    </>
  )
}

export function CurveScreen({ screen, elapsed }: { screen: Curve; elapsed: number }) {
  const t = useTranslations('stories')
  const locale = useLocale()
  const chip = useBandChip()
  const P = screen.points
  const W = 340
  const H = 260
  const L = 40
  const R = 40
  const T = 34
  const B = 44
  const mags = P.flatMap((p) => [p.mag - p.err, p.mag + p.err])
  const lo = Math.min(...mags) - 0.15
  const hi = Math.max(...mags) + 0.15
  const x = (i: number) => L + (i * (W - L - R)) / Math.max(1, P.length - 1)
  const y = (m: number) => T + ((m - lo) / (hi - lo)) * (H - T - B)
  const spread = Math.max(...P.map((p) => p.mag)) - Math.min(...P.map((p) => p.mag))
  const shown = Math.min(P.length, 1 + Math.floor(Math.max(0, elapsed - 300) / 500))
  return (
    <>
      <Photo>
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 m-auto h-full w-full text-warning" role="img" aria-label={t('curveAlt', { band: screen.band })}>
          <g className="text-on-media-muted" fill="currentColor" fontSize="12">
            <path d={`M${L} 12v10M${L - 4} 16l4-4 4 4`} stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            <text x={L + 10} y="22">
              {t('brighter')}
            </text>
          </g>
          <polyline points={P.slice(0, shown).map((p, i) => `${x(i)},${y(p.mag)}`).join(' ')} fill="none" stroke="currentColor" strokeOpacity="0.45" strokeWidth="2" strokeDasharray="4 4" />
          {P.slice(0, shown).map((p, i) => (
            <g key={p.t}>
              <line x1={x(i)} x2={x(i)} y1={y(p.mag - p.err)} y2={y(p.mag + p.err)} stroke="currentColor" strokeWidth="2" />
              <circle cx={x(i)} cy={y(p.mag)} r="6" fill="currentColor" />
              <text x={x(i)} y={H - 16} textAnchor="middle" fontSize="12" className="fill-on-media-muted">
                {new Date(p.t).toLocaleDateString(locale, { month: 'short', year: '2-digit', timeZone: 'UTC' })}
              </text>
            </g>
          ))}
        </svg>
        <Chip side="left">{chip(screen.band, null)}</Chip>
      </Photo>
      <Caption>
        {t('captions.curve', { band: screen.band, spread: spread.toLocaleString(locale, { maximumFractionDigits: 1 }), n: P.length })}
        {screen.saturated && ` ${t('captions.curveSaturated')}`}
      </Caption>
    </>
  )
}

export function ColoursScreen({ screen, name, elapsed }: { screen: Colours; name: string; elapsed: number }) {
  const t = useTranslations('stories')
  const locale = useLocale()
  const max = Math.max(1, ...screen.signal.map((v) => v ?? 0))
  const um = (v: number) => v.toLocaleString(locale, { maximumFractionDigits: 2 })
  return (
    <>
      <div className="grid w-full grid-cols-3 gap-1 p-1">
        {screen.frames.map((f, i) => (
          <div key={f.band} className={cx('relative aspect-square overflow-hidden rounded-[10px] bg-media-bg transition-[opacity,transform] duration-300', elapsed >= CELL_START_MS + i * CELL_STEP_MS ? 'opacity-100' : 'scale-95 opacity-0')}>
            <Image src={f.src} alt={t('colourAlt', { name, band: f.band })} fill sizes="160px" unoptimized className="pixelated object-contain" />
            <span aria-hidden="true" className="absolute size-[22px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-warning" style={{ left: `${(f.mark?.x ?? 0.5) * 100}%`, top: `${(f.mark?.y ?? 0.5) * 100}%` }} />
            <span className="absolute bottom-1 left-1.5 text-meta font-bold leading-tight text-on-media [text-shadow:0_1px_3px_rgb(0_0_0)]">
              {f.band}
              {f.um && f.um.length > 1 && <span className="block text-micro font-medium opacity-85">{t('umRange', { from: um(f.um[0] as number), to: um(f.um[1] as number) })}</span>}
            </span>
          </div>
        ))}
      </div>
      <div className="story-chrome px-3.5 pt-2.5" data-testid="story-signal">
        <p className="mb-1 text-micro text-on-media-muted">{t('measured')}</p>
        <div className="grid grid-cols-6 gap-1.5">
          {screen.signal.map((v, i) => (
            <div key={i} className="flex flex-col items-center gap-0.5 text-micro text-on-media-muted">
              <span className="flex h-11 w-full items-end overflow-hidden rounded-md bg-on-media/10">
                <span className="block w-full rounded-t-md bg-warning transition-[height] duration-500" style={{ height: elapsed > CELL_START_MS + i * CELL_STEP_MS ? `${Math.max(v ? 3 : 0, ((v ?? 0) / max) * 100)}%` : '0%' }} />
              </span>
              {`D${i + 1}`}
            </div>
          ))}
        </div>
      </div>
      <Caption>{t('captions.colours')}</Caption>
    </>
  )
}

function EndLinks({ primary, secondary }: { primary: { href: string; label: string }; secondary?: { href: string; label: string } }) {
  return (
    <div className="flex gap-2.5 px-4 pb-[max(18px,env(safe-area-inset-bottom))] pt-1.5">
      <Link href={primary.href} className="flex h-[46px] flex-1 items-center justify-center rounded-[14px] bg-on-media text-ui font-semibold text-media-bg">
        {primary.label}
      </Link>
      {secondary && (
        <Link href={secondary.href} className="flex h-[46px] flex-1 items-center justify-center rounded-[14px] text-ui font-semibold text-on-media ring-1 ring-inset ring-on-media-muted">
          {secondary.label}
        </Link>
      )}
    </div>
  )
}

export function EndScreen({ screen, id, name, avatar, next }: { screen: End; id: string; name: string; avatar: ReactNode; next: string | null }) {
  const t = useTranslations('stories')
  const locale = useLocale()
  const n = (v: number) => v.toLocaleString(locale, { maximumFractionDigits: 1 })
  const m = screen.motion
  const span = m ? (m.days >= 330 && m.days <= 400 ? t('oneYear') : t('months', { n: Math.max(1, Math.round(m.days / 30.44)) })) : ''
  return (
    <>
      <div className="flex flex-1 flex-col items-center justify-center gap-3.5 p-6 text-center">
        {avatar}
        <h3 className="text-title-sm font-semibold">{name}</h3>
        <p className="max-w-80 text-body leading-snug text-on-media" data-testid="story-measure">
          {m ? t('end.motion', { span, measured: n(m.measured_arcsec), err: n(m.err_arcsec), predicted: n(m.predicted_arcsec) }) : t('end.count', { name, images: screen.images, passes: screen.passes })}
        </p>
      </div>
      <EndLinks primary={{ href: `/o/${id}`, label: t('profile') }} secondary={{ href: `/lab/${id}`, label: t('lab') }} />
      {next && <p className="pb-3.5 text-center text-note text-on-media-muted">{t('next', { name: next })}</p>}
    </>
  )
}

export function FindBlinkScreen({ finding, elapsed }: { finding: Finding; elapsed: number }) {
  const t = useTranslations('stories')
  const tc = useTranslations('community')
  const locale = useLocale()
  const n = finding.passes
  const k = blinkIndex(elapsed, n, 800)
  const people = finding.credits.length + finding.credits_anonymous
  const from = finding.first_t ? formatShortDate(finding.first_t, locale) : ''
  const to = finding.last_t ? formatShortDate(finding.last_t, locale) : ''
  return (
    <>
      {finding.sprite ? (
        <Photo>
          <span
            role="img"
            aria-label={t('findAlt')}
            className="pixelated absolute inset-0 bg-no-repeat"
            style={{ backgroundImage: `url(${finding.sprite})`, backgroundSize: `${n * 100}% 200%`, backgroundPosition: `${n > 1 ? (k / (n - 1)) * 100 : 0}% 0%` }}
          />
          <Chip side="left">{t('bandChip', { band: finding.band.replace('SPHEREx-', '') })}</Chip>
          {finding.example && (
            <Chip side="centre" tone="warning">
              {tc('example')}
            </Chip>
          )}
        </Photo>
      ) : (
        finding.example && (
          <p className="text-center">
            <span className="inline-block rounded-full bg-warning px-2.5 py-1 text-meta font-semibold text-on-warning">{tc('example')}</span>
          </p>
        )
      )}
      <Caption>{people > 0 ? t('find.seen', { n: people, from, to }) : t('find.seenNobody', { from, to })}</Caption>
    </>
  )
}

export function FindChecksScreen({ finding }: { finding: Finding }) {
  const t = useTranslations('stories')
  const tc = useTranslations('community')
  return (
    <>
      <div className="mx-4 rounded-[18px] bg-sheet p-[18px] text-text">
        <h3 className="mb-3 text-title-sm font-semibold">{t('find.checks')}</h3>
        <ul>
          {finding.checks.map((c) => (
            <li key={c.service} className="flex justify-between gap-3 border-t-[0.5px] border-divider py-2.5 text-ui">
              <span>{tc(`checks.${c.service}`)}</span>
              <b className={cx('text-right font-semibold', c.result === 'found' ? 'text-warning' : 'text-text-secondary')}>{c.result === 'found' && c.names.length ? c.names.join(', ') : tc(`checkResults.${c.note === 'no_flags_for_card' ? 'not_applicable' : (c.result ?? 'waiting')}`)}</b>
            </li>
          ))}
        </ul>
      </div>
      <Caption>{finding.state === 'candidate' ? t('find.candidate') : tc.has(`states.${finding.state}.body`) ? tc(`states.${finding.state}.body`, { name: finding.reason ?? '' }) : t('find.candidate')}</Caption>
    </>
  )
}

export function FindEndScreen({ next }: { next: string | null }) {
  const t = useTranslations('stories')
  return (
    <>
      <div className="flex flex-1 flex-col items-center justify-center gap-3.5 p-6 text-center">
        <p className="max-w-80 text-body leading-snug text-on-media">{t('find.cta')}</p>
      </div>
      <EndLinks primary={{ href: '/community', label: t('find.open') }} />
      {next && <p className="pb-3.5 text-center text-note text-on-media-muted">{t('next', { name: next })}</p>}
    </>
  )
}
