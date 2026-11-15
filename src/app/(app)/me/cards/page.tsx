'use client'

import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { TechnicalData } from '@/components/classify/swap-sheets'
import { StatePill } from '@/components/community/finding-parts'
import { IconChevronRight } from '@/components/icons'
import { EmptyState, Sheet, Skeleton, TopBar } from '@/components/ui/primitives'
import { api, unwrap, type MyCardItem } from '@/lib/api/client'
import { useMyCards, useSession } from '@/lib/api/hooks'
import { formatShortDate } from '@/lib/format'

function CardDetail({ cardId, onClose }: { cardId: string | null; onClose: () => void }) {
  const t = useTranslations('community.myCards')
  const tc = useTranslations('classify')
  const detail = useQuery({
    queryKey: ['my-card', cardId],
    enabled: !!cardId,
    queryFn: async () => unwrap(await api.GET('/api/me/cards/{id}', { params: { path: { id: cardId ?? '' } } })),
  })
  const reveal = detail.data?.reveal
  const line = 'border-b-[0.5px] border-divider py-2.5 text-[16px] leading-snug'
  return (
    <Sheet open={!!cardId} onClose={onClose} title={t('detail.title')}>
      <div className="px-4 pb-4 pt-1">
        {detail.isLoading && <Skeleton className="h-24 w-full" />}
        {detail.isError && <p className="py-4 text-body text-text-secondary">{t('detail.failed')}</p>}
        {reveal && detail.data && (
          <>
            <p className={line}>{t(`answers.${detail.data.label}`)}</p>
            <p className={line}>
              <b className="font-semibold">{t('detail.others')}: </b>
              {t('detail.othersCount', { moves: reveal.votes.real, still: reveal.votes.artifact, unsure: reveal.votes.unsure })}
            </p>
            {reveal.kind !== 'sky' && (
              <div className={line}>
                <p>
                  <b className="font-semibold">{t('detail.guess')}: </b>
                  {tc(`guesses.${reveal.kind}`)}
                </p>
                <p className="mt-1 text-[14px] text-text-secondary">{t('detail.guessNote')}</p>
              </div>
            )}
            {reveal.known && (
              <p className={line}>
                <b className="font-semibold">{t('detail.catalog')}: </b>
                {reveal.known.name}
              </p>
            )}
            <details className="mt-3">
              <summary className="flex min-h-11 cursor-pointer items-center text-[16px] font-semibold">{tc('understand.technical')}</summary>
              <TechnicalData reveal={reveal} />
            </details>
          </>
        )}
      </div>
    </Sheet>
  )
}

function Row({ item, onOpen }: { item: MyCardItem; onOpen: () => void }) {
  const t = useTranslations('community.myCards')
  const locale = useLocale()
  const body = (
    <>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block text-body">{t(`answers.${item.label}`)}</span>
        <span className="block text-meta text-text-secondary">{formatShortDate(item.created_at, locale)}</span>
      </span>
      {item.finding ? <StatePill state={item.finding} /> : <span className="shrink-0 text-note text-text-secondary">{t(`status.${item.status}`)}</span>}
      <IconChevronRight size={18} className="shrink-0 text-text-secondary" />
    </>
  )
  const cls = 'flex min-h-14 items-center gap-3 px-4 py-2'
  return (
    <li>
      {item.finding ? (
        <Link href={`/community/${encodeURIComponent(item.card_id)}`} className={`${cls} active:bg-surface`}>
          {body}
        </Link>
      ) : (
        <button type="button" onClick={onOpen} className={`${cls} w-full text-left active:bg-surface`}>
          {body}
        </button>
      )}
    </li>
  )
}

export default function MyCardsPage() {
  const t = useTranslations('community.myCards')
  const { data: user, isLoading } = useSession()
  const cards = useMyCards(!!user)
  const sentinel = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState<string | null>(null)
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
          <Row key={item.card_id} item={item} onOpen={() => setOpen(item.card_id)} />
        ))}
      </ul>
      <div ref={sentinel} />
      <CardDetail cardId={open} onClose={() => setOpen(null)} />
    </main>
  )
}
