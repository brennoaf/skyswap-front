'use client'

import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useRef } from 'react'
import { StatePill } from '@/components/community/finding-parts'
import { IconChevronRight } from '@/components/icons'
import { EmptyState, Skeleton, TopBar } from '@/components/ui/primitives'
import type { MyCardItem } from '@/lib/api/client'
import { useMyCards, useSession } from '@/lib/api/hooks'
import { formatShortDate } from '@/lib/format'

function Row({ item }: { item: MyCardItem }) {
  const t = useTranslations('community.myCards')
  const locale = useLocale()
  const body = (
    <>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block text-body">{t(`answers.${item.label}`)}</span>
        <span className="block text-meta text-text-secondary">{formatShortDate(item.created_at, locale)}</span>
      </span>
      {item.finding ? <StatePill state={item.finding} /> : <span className="shrink-0 text-note text-text-secondary">{t(`status.${item.status}`)}</span>}
      {item.finding && <IconChevronRight size={18} className="shrink-0 text-text-secondary" />}
    </>
  )
  const cls = 'flex min-h-14 items-center gap-3 px-4 py-2'
  return <li>{item.finding ? <Link href={`/community/${encodeURIComponent(item.card_id)}`} className={`${cls} active:bg-surface`}>{body}</Link> : <div className={cls}>{body}</div>}</li>
}

export default function MyCardsPage() {
  const t = useTranslations('community.myCards')
  const { data: user, isLoading } = useSession()
  const cards = useMyCards(!!user)
  const sentinel = useRef<HTMLDivElement>(null)
  const items = cards.data?.pages.flatMap((p) => p.items) ?? []

  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting && cards.hasNextPage && !cards.isFetchingNextPage) void cards.fetchNextPage()
    }, { rootMargin: '400px' })
    io.observe(el)
    return () => io.disconnect()
  }, [cards])

  return (
    <main className="pb-6">
      <TopBar title={t('title')} />
      <p className="px-4 pb-2 text-note leading-snug text-text-secondary">{t('lead')}</p>
      {(isLoading || cards.isLoading) && <Skeleton className="mx-4 h-14" />}
      {!isLoading && !cards.isLoading && !items.length && (
        <EmptyState
          title={t('emptyTitle')}
          action={
            <Link href="/classify" className="inline-flex h-11 items-center rounded-[var(--radius-button)] bg-accent px-5 text-ui font-semibold text-on-accent">
              {t('emptyAction')}
            </Link>
          }
        />
      )}
      <ul className="divide-y-[0.5px] divide-divider">
        {items.map((item) => (
          <Row key={item.card_id} item={item} />
        ))}
      </ul>
      <div ref={sentinel} />
    </main>
  )
}
