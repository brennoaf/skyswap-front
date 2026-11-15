'use client'

import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import { api } from '@/lib/api/client'
import { useSession } from '@/lib/api/hooks'
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

export function StatePill({ state, reason = null }: { state: string; reason?: string | null }) {
  const t = useTranslations('community.states')
  const tc = useTranslations('community')
  return (
    <span className={cx('inline-flex h-6 min-w-0 items-center rounded-full px-2.5 text-meta font-semibold', TONE[state] ?? 'bg-surface text-text-secondary')} data-testid="state-pill">
      <span className="truncate">{state === 'known' ? (reason ? tc('knownAs', { name: reason }) : tc('known')) : t(`${state}.label`)}</span>
    </span>
  )
}

export function FindingPhoto({ finding, alt }: { finding: Pick<FindingSummary, 'photo' | 'photo_cols' | 'mark'>; alt: string }) {
  if (!finding.photo) return null
  const cols = Math.max(1, finding.photo_cols)
  return (
    <span className="relative block aspect-square w-full overflow-hidden bg-media-bg" data-testid="finding-photo">
      <span
        role="img"
        aria-label={alt}
        className="pixelated absolute inset-0 bg-no-repeat"
        style={{ backgroundImage: `url(${finding.photo})`, backgroundSize: cols > 1 ? `${cols * 100}% 200%` : 'contain', backgroundPosition: cols > 1 ? '0 0' : 'center' }}
      />
      {finding.mark && (
        <span aria-hidden="true" className="absolute size-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent/80" style={{ left: `${finding.mark.x * 100}%`, top: `${finding.mark.y * 100}%` }} data-testid="finding-mark" />
      )}
    </span>
  )
}

export function ObjectLink({ objectId, name }: { objectId: string | null; name: string | null }) {
  const t = useTranslations('community')
  if (!objectId || !name) return null
  return (
    <Link href={`/o/${objectId}`} className="inline-flex min-h-11 items-center text-ui font-semibold text-link" data-testid="finding-object">
      {t('seeProfile', { name })}
    </Link>
  )
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

export function FirstAnswer({ id, first }: { id: string; first: FindingSummary['first_vote'] }) {
  const t = useTranslations('community')
  const session = useSession()
  const [reported, setReported] = useState(false)
  if (!first) return null
  return (
    <div className="text-note leading-snug" data-testid="first-answer">
      <p className="text-text-secondary">{first.nickname ? t('firstVote', { name: first.nickname }) : t('firstVoteAnonymous')}</p>
      {first.note && !reported && (
        <>
          <blockquote className="mt-1 border-l-2 border-accent pl-2.5 text-body text-text" data-testid="first-note">
            {`"${first.note}"`}
          </blockquote>
          {session.data && (
            <button
              type="button"
              onClick={() => {
                setReported(true)
                void api.POST('/api/community/findings/{id}/note-report', { params: { path: { id } } })
              }}
              className="mt-0.5 min-h-8 text-note font-semibold text-text-secondary"
              data-testid="note-report"
            >
              {t('noteReport')}
            </button>
          )}
        </>
      )}
      {first.note && reported && (
        <p role="status" className="mt-1 text-note text-text-secondary">
          {t('noteReported')}
        </p>
      )}
    </div>
  )
}

export function FoundBy({ names, others }: { names: string[]; others: number }) {
  const t = useTranslations('community')
  if (!names.length && !others) return null
  if (!names.length) return <p className="text-note text-text-secondary">{t('foundByAnonymous', { n: others })}</p>
  return <p className="text-note text-text-secondary">{others ? t('foundByMore', { names: names.join(', '), n: others }) : t('foundBy', { names: names.join(', ') })}</p>
}
