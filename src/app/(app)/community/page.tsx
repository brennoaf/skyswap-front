'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import { CommunitySwitch } from '@/components/community/community-switch'
import { FindingActions, SocialFacts } from '@/components/community/finding-actions'
import { ExamplePill, FindingFacts, FindingPhoto, FirstAnswer, FoundBy, ObjectLink, stateBody, StatePill, useFindingTitle } from '@/components/community/finding-parts'
import { IconCards, IconChevronRight, IconTarget } from '@/components/icons'
import { Button, Chip, EmptyState, Skeleton, Wordmark } from '@/components/ui/primitives'
import type { FindingSummary } from '@/lib/api/client'
import { useCommunityFeed, useCommunityOverview, useGoals, type CommunityTab } from '@/lib/api/hooks'

const TABS: CommunityTab[] = ['popular', 'open', 'solved']
const TAB_LABEL = { popular: 'tabPopular', open: 'tabOpen', solved: 'tabSolved' } as const

function FindingCard({ finding }: { finding: FindingSummary }) {
  const t = useTranslations('community')
  const ts = useTranslations('community.states')
  const title = useFindingTitle()(finding)
  const href = `/community/${encodeURIComponent(finding.id)}`
  return (
    <article className="pb-4" aria-label={title}>
      <Link href={href} className="block">
        <div className="flex min-h-[54px] items-center gap-2 px-3 py-1.5">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-surface">
            <IconTarget size={22} />
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-account font-medium">{title}</span>
            <span className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
              {finding.example && <ExamplePill />}
              <StatePill state={finding.state} />
            </span>
          </span>
        </div>
        <FindingPhoto finding={finding} alt={t('photoAlt', { title })} />
      </Link>
      <FindingActions id={finding.id} social={finding.social} lookHref={`${href}?look=1`} />
      <Link href={href} className="block space-y-1 px-3 pt-2">
        <p className="text-body leading-snug">{stateBody(ts, finding)}</p>
        <SocialFacts social={finding.social} />
        <FindingFacts finding={finding} />
        <FoundBy names={finding.credit_names} others={finding.credit_others} />
      </Link>
      <div className="px-3">
        <ObjectLink objectId={finding.object_id} name={finding.reason} />
      </div>
      <div className="px-3 pt-1">
        <FirstAnswer id={finding.id} first={finding.first_vote} />
      </div>
    </article>
  )
}

function Highlight({ finding }: { finding: FindingSummary }) {
  const ts = useTranslations('community.states')
  const title = useFindingTitle()(finding)
  return (
    <Link href={`/community/${encodeURIComponent(finding.id)}`} className="mx-4 mt-3 block rounded-[var(--radius-button)] bg-surface p-3">
      <span className="flex items-center gap-1.5">
        <StatePill state={finding.state} />
        {finding.example && <ExamplePill />}
      </span>
      <span className="mt-1.5 block truncate text-ui font-semibold">{title}</span>
      <span className="mt-0.5 block text-note leading-snug text-text-secondary">{stateBody(ts, finding)}</span>
    </Link>
  )
}

function OpenCards({ n }: { n: number }) {
  const t = useTranslations('community')
  const goals = useGoals()
  const goal = goals.data?.find((g) => g.key === 'classifications')
  const line = goal ? t('goalLine', { count: goal.count, target: goal.target }) : null
  if (!n) return line ? <p className="px-4 pt-3 text-note leading-snug text-text-secondary">{line}</p> : null
  return (
    <Link href="/classify?open=1" className="flex min-h-14 items-center gap-3 border-b-[0.5px] border-divider px-4 py-2 active:bg-surface">
      <span className="text-accent">
        <IconCards size={26} />
      </span>
      <span className="min-w-0 flex-1 leading-snug">
        <span className="block text-ui font-semibold">{t('openCards', { n })}</span>
        {line && <span className="block text-note text-text-secondary">{line}</span>}
      </span>
      <IconChevronRight size={20} className="shrink-0 text-icon-muted" />
    </Link>
  )
}

export default function CommunityPage() {
  const t = useTranslations('community')
  const overview = useCommunityOverview()
  const [pick, setPick] = useState<CommunityTab | null>(null)
  const tab: CommunityTab = pick ?? (overview.data?.has_popular ? 'popular' : 'open')
  const feed = useCommunityFeed(tab, !!overview.data || overview.isError)
  const openCards = overview.data?.open_cards ?? 0
  const sentinel = useRef<HTMLDivElement>(null)
  const items = feed.data?.pages.flatMap((p) => p.items) ?? []

  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting && feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage()
    }, { rootMargin: '600px' })
    io.observe(el)
    return () => io.disconnect()
  }, [feed])

  return (
    <main>
      <header className="sticky top-0 z-30 flex h-[var(--height-topbar)] items-center bg-bg pl-4 pr-2">
        <Link href="/" aria-label={t('switchPosts')}>
          <Wordmark />
        </Link>
      </header>
      <CommunitySwitch />
      <OpenCards n={openCards} />
      {overview.data?.highlight && <Highlight finding={overview.data.highlight} />}
      <div role="group" aria-label={t('tabsLabel')} className="flex gap-2 px-4 pt-3">
        {TABS.map((k) => (
          <Chip key={k} active={tab === k} onClick={() => setPick(k)}>
            {t(TAB_LABEL[k])}
          </Chip>
        ))}
      </div>
      <p className="px-4 pb-1 pt-2 text-note leading-snug text-text-secondary" data-testid="community-line">
        {t(`tabLine.${tab}`)}
      </p>
      {(feed.isLoading || overview.isLoading) && (
        <div className="space-y-3 p-4" aria-hidden="true">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}
      {feed.isError && <EmptyState title={t('errorTitle')} action={<Button onClick={() => feed.refetch()}>{t('retry')}</Button>} />}
      {!feed.isLoading && !overview.isLoading && !feed.isError && !items.length && tab !== 'open' && <EmptyState title={t('nothingYet')} />}
      {!feed.isLoading && !overview.isLoading && !feed.isError && !items.length && tab === 'open' && (
        <EmptyState
          title={t('emptyTitle')}
          body={t('emptyBody')}
          action={
            openCards > 0 ? undefined : (
              <Link href="/classify" className="inline-flex h-11 items-center rounded-[var(--radius-button)] bg-accent px-5 text-ui font-semibold text-on-accent">
                {t('emptyAction')}
              </Link>
            )
          }
        />
      )}
      {items.map((f) => (
        <FindingCard key={f.id} finding={f} />
      ))}
      <div ref={sentinel} />
    </main>
  )
}
