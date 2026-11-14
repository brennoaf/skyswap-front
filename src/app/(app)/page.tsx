'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import { PostCard } from '@/components/feed/post-card'
import { StoriesRow } from '@/components/feed/stories-row'
import { IconCheck, IconChevronDown, IconDirect, IconLike } from '@/components/icons'
import { Button, EmptyState, Sheet, Skeleton, Wordmark } from '@/components/ui/primitives'
import { useAlerts, useFeed, useSession, type FeedTab } from '@/lib/api/hooks'
import { useShare } from '@/lib/share'

const TABS: FeedTab[] = ['for_you', 'following', 'new', 'targets']

function FeedSkeleton() {
  return (
    <div className="pb-4" aria-hidden="true">
      <div className="flex h-[54px] items-center gap-2 px-2">
        <Skeleton className="size-10 rounded-full" />
        <Skeleton className="h-3 w-32" />
      </div>
      <Skeleton className="aspect-[4/5] w-full rounded-none" />
    </div>
  )
}

export default function HomePage() {
  const t = useTranslations('home')
  const [tab, setTab] = useState<FeedTab>('for_you')
  const [picker, setPicker] = useState(false)
  const { data: user } = useSession()
  const { data: alerts } = useAlerts(!!user)
  const feed = useFeed(tab)
  const share = useShare()
  const sentinel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting && feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage()
    }, { rootMargin: '600px' })
    io.observe(el)
    return () => io.disconnect()
  }, [feed])

  const items = feed.data?.pages.flatMap((p) => p.items) ?? []
  const notice = feed.data?.pages[0]?.notice ?? null

  return (
    <main>
      <header className="sticky top-0 z-30 flex h-[var(--height-topbar)] items-center justify-between bg-bg pl-4 pr-2">
        <button type="button" className="flex items-end gap-0.5" aria-haspopup="dialog" aria-label={t('feedSelector', { feed: t(`tabs.${tab}`) })} onClick={() => setPicker(true)}>
          <Wordmark />
          <IconChevronDown className="mb-0.5" />
        </button>
        <div className="flex items-center">
          <Link href="/alerts" aria-label={t('alerts')} className="relative inline-flex size-11 items-center justify-center">
            <IconLike />
            {!!alerts?.unread && <span className="absolute right-2 top-2 size-2.5 rounded-full border-2 border-bg bg-danger" aria-label={t('unread', { n: alerts.unread })} />}
          </Link>
          <button type="button" aria-label={t('share')} className="inline-flex size-11 items-center justify-center" onClick={() => share({ title: 'SkySwap', path: '/' })}>
            <IconDirect />
          </button>
        </div>
      </header>

      <StoriesRow />

      {tab !== 'for_you' && (
        <div className="flex items-center justify-between px-4 pb-2 pt-1">
          <p className="text-[15px] font-semibold">{t(`tabs.${tab}`)}</p>
          <button type="button" className="text-[14px] font-semibold text-accent" onClick={() => setTab('for_you')}>
            {t('backToForYou')}
          </button>
        </div>
      )}

      {notice && (
        <p className="mx-4 mb-3 rounded-xl bg-surface px-3 py-2.5 text-[13px] text-text-secondary" role="status">
          {t(`notices.${notice}`)}
        </p>
      )}

      {feed.isLoading && (
        <>
          <FeedSkeleton />
          <FeedSkeleton />
        </>
      )}

      {feed.isError && <EmptyState title={t('errorTitle')} body={t('errorBody')} action={<Button onClick={() => feed.refetch()}>{t('retry')}</Button>} />}

      {!feed.isLoading && !items.length && !feed.isError && (
        <EmptyState
          title={t(`empty.${tab}.title`)}
          body={t(`empty.${tab}.body`)}
          action={
            <Link href="/search" className="inline-flex h-9 items-center rounded-[var(--radius-button)] bg-accent px-4 text-[15px] font-medium text-on-accent">
              {t('explore')}
            </Link>
          }
        />
      )}

      {items.map((item, i) => (
        <PostCard key={item.post.id} item={item} priority={i === 0} />
      ))}

      <div ref={sentinel} />
      {feed.isFetchingNextPage && <FeedSkeleton />}
      {!feed.hasNextPage && items.length > 0 && <p className="py-8 text-center text-[13px] text-text-secondary">{t('end')}</p>}

      <Sheet open={picker} onClose={() => setPicker(false)} title={t('feeds')}>
        <ul className="py-2">
          {TABS.map((k) => (
            <li key={k}>
              <button
                type="button"
                aria-pressed={k === tab}
                onClick={() => {
                  setTab(k)
                  setPicker(false)
                  window.scrollTo({ top: 0 })
                }}
                className="flex min-h-14 w-full items-center gap-3 px-4 text-left active:bg-surface"
              >
                <span className="flex-1">
                  <span className="block text-[15px] font-medium">{t(`tabs.${k}`)}</span>
                  <span className="block text-[12px] text-text-secondary">{t(`tabHints.${k}`)}</span>
                </span>
                {k === tab && <IconCheck size={24} className="text-accent" />}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </main>
  )
}
