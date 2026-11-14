'use client'

import Link from 'next/link'
import { use, useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { PhotoViewer } from '@/components/classify/photo-viewer'
import { ExamplePill, FindingFacts, FoundBy, stateBody, StatePill, useFindingTitle } from '@/components/community/finding-parts'
import { IconLink } from '@/components/icons'
import { SkyViewer } from '@/components/sky/sky-viewer'
import { EmptyState, IconButton, Notice, Skeleton, TopBar } from '@/components/ui/primitives'
import type { FindingDetail } from '@/lib/api/client'
import { useFinding } from '@/lib/api/hooks'
import { cx, formatDateTime, formatShortDate } from '@/lib/format'
import { useShare } from '@/lib/share'

function useSprite(src: string | null) {
  const [img, setImg] = useState<{ src: string; el: HTMLImageElement } | null>(null)
  useEffect(() => {
    if (!src) return
    const el = new Image()
    let live = true
    el.onload = () => live && setImg({ src, el })
    el.src = src
    return () => {
      live = false
    }
  }, [src])
  return img && img.src === src ? img.el : null
}

function Media({ finding }: { finding: FindingDetail }) {
  const img = useSprite(finding.sprite)
  if (finding.sprite) return <PhotoViewer sprite={finding.sprite} img={img} offsets={finding.offsets_s} />
  return <SkyViewer compact params={{ ra: finding.ra, dec: finding.dec, fov: Math.min(0.5, Math.max(0.05, finding.fov_deg)), band: finding.band, name: null, obj: null }} />
}

function Checks({ finding }: { finding: FindingDetail }) {
  const t = useTranslations('community')
  const locale = useLocale()
  return (
    <section className="px-4 pt-5">
      <h2 className="text-ui font-semibold">{t('checksTitle')}</h2>
      <ul className="mt-1 divide-y-[0.5px] divide-divider">
        {finding.checks.map((c) => (
          <li key={c.service} className="py-2 leading-snug">
            <span className="flex items-center justify-between gap-3">
              <span className="text-body">{t(`checks.${c.service}`)}</span>
              <span className={cx('shrink-0 text-note font-medium', c.result === 'found' ? 'text-success' : 'text-text-secondary')}>{t(`checkResults.${c.note === 'no_flags_for_card' ? 'not_applicable' : (c.result ?? 'waiting')}`)}</span>
            </span>
            {c.names.length > 0 && <span className="block text-note text-text-secondary">{c.names.join(', ')}</span>}
            {c.checked_at !== null && <span className="block text-meta text-text-secondary">{formatShortDate(c.checked_at, locale)}</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}

function Timeline({ finding }: { finding: FindingDetail }) {
  const t = useTranslations('community')
  const ts = useTranslations('community.states')
  const locale = useLocale()
  return (
    <section className="px-4 pt-5">
      <h2 className="text-ui font-semibold">{t('timelineTitle')}</h2>
      <ol className="mt-2 space-y-2 border-l-[1.5px] border-divider pl-3 text-body leading-snug">
        {finding.first_vote && (
          <li>
            {finding.first_vote.nickname ? t('firstVote', { name: finding.first_vote.nickname }) : t('firstVoteAnonymous')}
            <span className="block text-meta text-text-secondary">{formatDateTime(new Date(finding.first_vote.at).toISOString(), locale)}</span>
          </li>
        )}
        {finding.events.map((e, i) => (
          <li key={i}>
            {ts(`${e.state}.label`)}
            {e.url && (
              <a href={e.url} target="_blank" rel="noopener noreferrer" className="ml-1 text-link">
                {t('source')}
              </a>
            )}
            <span className="block text-meta text-text-secondary">
              {formatDateTime(new Date(e.created_at).toISOString(), locale)}, {t(`sources.${e.source}`)}, {t('dataVersion', { version: e.data_version })}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}

export default function FindingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const t = useTranslations('community')
  const ts = useTranslations('community.states')
  const finding = useFinding(decodeURIComponent(id))
  const share = useShare()
  const title = useFindingTitle()
  if (finding.isLoading)
    return (
      <main>
        <TopBar title={t('postTitle')} />
        <Skeleton className="aspect-square w-full rounded-none" />
      </main>
    )
  const f = finding.data
  if (!f)
    return (
      <main>
        <TopBar title={t('postTitle')} />
        <EmptyState title={t('notFound')} action={<Link href="/community" className="text-link">{t('backToCommunity')}</Link>} />
      </main>
    )
  const name = title(f)
  return (
    <main className="pb-8">
      <TopBar
        title={name}
        actions={
          <IconButton label={t('share')} onClick={() => void share({ title: name, path: `/community/${encodeURIComponent(f.id)}` })}>
            <IconLink size={24} />
          </IconButton>
        }
      />
      {f.example && (
        <div className="px-4 pb-2">
          <Notice>{t('exampleNotice')}</Notice>
        </div>
      )}
      <Media finding={f} />
      <section className="space-y-1 px-4 pt-3">
        <div className="flex items-center gap-1.5">
          <StatePill state={f.state} />
          {f.example && <ExamplePill />}
        </div>
        <p className="pt-1 text-body leading-snug">{stateBody(ts, f)}</p>
        <FindingFacts finding={f} />
        <FoundBy names={f.credits} others={f.credits_anonymous} />
      </section>
      <Checks finding={f} />
      <Timeline finding={f} />
      <p className="px-4 pt-5 text-note leading-snug text-text-secondary">{t('namingNote')}</p>
    </main>
  )
}
