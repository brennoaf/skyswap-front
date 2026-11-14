'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useEffect, useRef } from 'react'
import { CommunitySwitch } from '@/components/community/community-switch'
import { ExamplePill, FindingFacts, FoundBy, stateBody, StatePill, useFindingTitle } from '@/components/community/finding-parts'
import { IconTarget } from '@/components/icons'
import { SkyLocator } from '@/components/sky/sky-locator'
import { Button, EmptyState, Skeleton, Wordmark } from '@/components/ui/primitives'
import type { FindingSummary } from '@/lib/api/client'
import { useCommunityFeed } from '@/lib/api/hooks'

function FindingCard({ finding }: { finding: FindingSummary }) {
  const t = useTranslations('community')
  const ts = useTranslations('community.states')
  const title = useFindingTitle()(finding)
  return (
    <article className="pb-4" aria-label={title}>
      <Link href={`/community/${encodeURIComponent(finding.id)}`} className="block">
        <div className="flex min-h-[54px] items-center gap-2 px-3">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-surface">
            <IconTarget size={22} />
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-account font-medium">{title}</span>
            <span className="block truncate text-meta text-text-secondary">{t('skyPatch')}</span>
          </span>
          {finding.example && <ExamplePill />}
          <StatePill state={finding.state} />
        </div>
        <div className="bg-reels-bg px-10 py-3 text-on-media">
          <SkyLocator ra={finding.ra} dec={finding.dec} name={title} />
        </div>
        <div className="space-y-1 px-3 pt-2">
          <p className="text-body leading-snug">{stateBody(ts, finding)}</p>
          <FindingFacts finding={finding} />
          <FoundBy names={finding.credit_names} others={finding.credit_others} />
        </div>
      </Link>
    </article>
  )
}

export default function CommunityPage() {
  const t = useTranslations('community')
  const feed = useCommunityFeed()
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
      {feed.isLoading && (
        <div className="space-y-3 p-4" aria-hidden="true">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}
      {feed.isError && <EmptyState title={t('errorTitle')} action={<Button onClick={() => feed.refetch()}>{t('retry')}</Button>} />}
      {!feed.isLoading && !feed.isError && !items.length && (
        <EmptyState
          title={t('emptyTitle')}
          body={t('emptyBody')}
          action={
            <Link href="/classify" className="inline-flex h-11 items-center rounded-[var(--radius-button)] bg-accent px-5 text-ui font-semibold text-on-accent">
              {t('emptyAction')}
            </Link>
          }
        />
      )}
      {items.length > 0 && <p className="px-4 py-3 text-note leading-snug text-text-secondary">{t('lead')}</p>}
      {items.map((f) => (
        <FindingCard key={f.id} finding={f} />
      ))}
      <div ref={sentinel} />
    </main>
  )
}
