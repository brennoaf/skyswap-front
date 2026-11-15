'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import { CommunityCard } from '@/components/community/community-card'
import { CommunitySwitch } from '@/components/community/community-switch'
import { ExamplePill, stateBody, StatePill, useFindingTitle } from '@/components/community/finding-parts'
import { IconCards, IconChevronRight } from '@/components/icons'
import { Button, EmptyState, Skeleton, Wordmark } from '@/components/ui/primitives'
import type { FindingSummary } from '@/lib/api/client'
import { useCommunityFeed, useCommunityOverview, useGoals, type CommunityTab } from '@/lib/api/hooks'
import { cx } from '@/lib/format'

const TABS: CommunityTab[] = ['popular', 'open', 'solved']
const TAB_LABEL = { popular: 'tabPopular', open: 'tabOpen', solved: 'tabSolved' } as const

function Highlight({ finding }: { finding: FindingSummary }) {
  const t = useTranslations('community')
  const ts = useTranslations('community.states')
  const title = useFindingTitle()(finding)
  return (
    <Link href={`/community/${encodeURIComponent(finding.id)}`} className="mx-4 mt-3 block rounded-2xl bg-surface p-3.5 active:bg-surface-pressed">
      <span className="flex items-center gap-1.5">
        <span className="text-meta font-semibold uppercase tracking-wide text-text-secondary">{t('highlight')}</span>
        <StatePill state={finding.state} reason={finding.reason} />
        {finding.example && <ExamplePill />}
      </span>
      <span className="mt-1.5 block truncate text-title-sm font-bold">{title}</span>
      <span className="mt-0.5 line-clamp-2 block text-note leading-snug text-text-secondary">{stateBody(ts, finding)}</span>
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
    <Link href="/classify?open=1" className="mx-4 mt-3 flex min-h-16 items-center gap-3 rounded-2xl bg-surface px-3.5 py-2.5 active:bg-surface-pressed">
      <span className="story-ring inline-flex size-10 shrink-0 items-center justify-center rounded-full text-on-accent">
        <IconCards size={22} />
      </span>
      <span className="min-w-0 flex-1 leading-snug">
        <span className="block text-ui font-semibold">{t('openCards', { n })}</span>
        {line && <span className="block text-note text-text-secondary">{line}</span>}
      </span>
      <IconChevronRight size={20} className="shrink-0 text-icon-muted" />
    </Link>
  )
}

function Tabs({ tab, onPick }: { tab: CommunityTab; onPick: (k: CommunityTab) => void }) {
  const t = useTranslations('community')
  return (
    <div role="group" aria-label={t('tabsLabel')} className="mx-4 mt-4 grid grid-cols-3 gap-1 rounded-full bg-surface p-1">
      {TABS.map((k) => (
        <button
          key={k}
          type="button"
          aria-pressed={tab === k}
          onClick={() => onPick(k)}
          className={cx('hit-44 h-9 rounded-full text-note font-semibold transition-colors', tab === k ? 'bg-bg text-text shadow-[0_1px_3px_rgb(0_0_0/0.18)]' : 'text-text-secondary')}
        >
          {t(TAB_LABEL[k])}
        </button>
      ))}
    </div>
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
      <Tabs tab={tab} onPick={setPick} />
      <p className="px-5 pb-2 pt-2 text-note leading-snug text-text-secondary" data-testid="community-line">
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
      <div className="border-t-[0.5px] border-divider">
        {items.map((item) => (
          <CommunityCard key={item.id} item={item} />
        ))}
      </div>
      <div ref={sentinel} />
    </main>
  )
}
