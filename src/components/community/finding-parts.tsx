'use client'

import { useLocale, useTranslations } from 'next-intl'
import { cx, formatShortDate } from '@/lib/format'
import type { FindingSummary } from '@/lib/api/client'

const TONE: Record<string, string> = {
  candidate: 'bg-accent/15 text-accent',
  known: 'bg-success/15 text-success',
  published: 'bg-success/15 text-success',
  likely_artifact: 'bg-surface text-text-secondary',
  discarded: 'bg-surface text-text-secondary',
  package_ready: 'bg-accent/15 text-accent',
  in_review: 'bg-warning/15 text-warning',
}

export function StatePill({ state }: { state: string }) {
  const t = useTranslations('community.states')
  return <span className={cx('inline-flex h-6 items-center rounded-full px-2.5 text-meta font-semibold', TONE[state] ?? 'bg-surface text-text-secondary')}>{t(`${state}.label`)}</span>
}

export function ExamplePill() {
  const t = useTranslations('community')
  return <span className="inline-flex h-6 items-center rounded-full bg-warning px-2.5 text-meta font-semibold text-on-warning">{t('example')}</span>
}

export function shortCoords(ra: number, dec: number): string {
  const totalMin = Math.round((((ra % 360) + 360) % 360) * 4)
  const hours = Math.floor(totalMin / 60) % 24
  const decMin = Math.round(Math.abs(dec) * 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(hours)}h ${pad(totalMin % 60)}m, ${dec < 0 ? '-' : '+'}${pad(Math.floor(decMin / 60))}° ${pad(decMin % 60)}'`
}

export function useFindingTitle() {
  const t = useTranslations('community')
  return (f: Pick<FindingSummary, 'state' | 'reason' | 'ra' | 'dec'>) => (f.state === 'known' && f.reason ? f.reason : t('patchTitle', { coords: shortCoords(f.ra, f.dec) }))
}

export function stateBody(t: ReturnType<typeof useTranslations<'community.states'>>, f: Pick<FindingSummary, 'state' | 'reason'>): string {
  return f.state === 'known' ? t('known.body', { name: f.reason ?? '' }) : t(`${f.state}.body`)
}

export function FindingFacts({ finding }: { finding: FindingSummary }) {
  const t = useTranslations('community')
  const locale = useLocale()
  const from = finding.first_t ? formatShortDate(finding.first_t, locale) : ''
  const to = finding.last_t ? formatShortDate(finding.last_t, locale) : ''
  const dates = from && to && from !== to ? t('period', { from, to }) : from
  return (
    <p className="text-note leading-snug text-text-secondary">
      {t('passes', { n: finding.passes })}
      {dates && `, ${dates}`}
      {`. ${t('checksDone', { done: finding.checks_done, total: finding.checks_total })}`}
    </p>
  )
}

export function FoundBy({ names, others }: { names: string[]; others: number }) {
  const t = useTranslations('community')
  if (!names.length && !others) return null
  if (!names.length) return <p className="text-note text-text-secondary">{t('foundByAnonymous', { n: others })}</p>
  return <p className="text-note text-text-secondary">{others ? t('foundByMore', { names: names.join(', '), n: others }) : t('foundBy', { names: names.join(', ') })}</p>
}
