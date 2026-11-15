'use client'

import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { TechnicalData } from '@/components/classify/swap-sheets'
import { StatePill } from '@/components/community/finding-parts'
import { IconChevronRight } from '@/components/icons'
import { EmptyState, Sheet, Skeleton, TopBar } from '@/components/ui/primitives'
import { api, unwrap, type MyCardItem } from '@/lib/api/client'
import { useMyCards, useSession } from '@/lib/api/hooks'
import { cx, formatShortDate } from '@/lib/format'
import { cleanNote, NOTE_MAX } from '@/lib/note'

function NoteBlock({ cardId, note, editable }: { cardId: string; note: string | null; editable: boolean }) {
  const t = useTranslations('community.myCards.note')
  const tn = useTranslations('classify.note')
  const qc = useQueryClient()
  const [draft, setDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const invalid = draft !== null && cleanNote(draft) === 'invalid'
  const save = async (value: string | null) => {
    setSaving(true)
    await api.PUT('/api/me/cards/{id}/note', { params: { path: { id: cardId } }, body: { note: value } })
    await qc.invalidateQueries({ queryKey: ['my-card', cardId] })
    setDraft(null)
    setSaving(false)
  }
  return (
    <div className="border-b-[0.5px] border-divider py-2.5 text-[16px] leading-snug" data-testid="my-note">
      <b className="font-semibold">{t('title')}: </b>
      {draft === null ? (
        <>
          <span className={cx(!note && 'text-text-secondary')}>{note ? `"${note}"` : t('empty')}</span>
          {editable ? (
            <span className="mt-1 flex gap-4">
              <button type="button" onClick={() => setDraft(note ?? '')} className="min-h-10 text-ui font-semibold text-link">
                {t('edit')}
              </button>
              {note && (
                <button type="button" disabled={saving} onClick={() => void save(null)} className="min-h-10 text-ui font-semibold text-danger">
                  {t('delete')}
                </button>
              )}
            </span>
          ) : (
            note && <span className="mt-1 block text-ui text-text-secondary">{t('locked')}</span>
          )}
        </>
      ) : (
        <span className="mt-1 block">
          <input
            autoFocus
            type="text"
            aria-label={tn('label')}
            maxLength={NOTE_MAX}
            value={draft}
            placeholder={tn('placeholder')}
            onChange={(e) => setDraft(e.target.value)}
            className="h-11 w-full rounded-xl bg-surface px-3 text-ui outline-none focus:ring-2 focus:ring-accent"
          />
          <span className={cx('mt-1 block text-ui', invalid ? 'text-danger' : 'text-text-secondary')}>{invalid ? tn('invalid') : tn('help')}</span>
          <span className="mt-1 flex gap-4">
            <button type="button" disabled={saving || invalid} onClick={() => void save(draft)} className="min-h-10 text-ui font-semibold text-link disabled:opacity-50">
              {t('save')}
            </button>
            <button type="button" onClick={() => setDraft(null)} className="min-h-10 text-ui font-semibold text-text-secondary">
              {t('cancel')}
            </button>
          </span>
        </span>
      )}
    </div>
  )
}

function CardDetail({ item, onClose }: { item: MyCardItem | null; onClose: () => void }) {
  const t = useTranslations('community.myCards')
  const tc = useTranslations('classify')
  const locale = useLocale()
  const detail = useQuery({
    queryKey: ['my-card', item?.card_id],
    enabled: !!item,
    queryFn: async () => unwrap(await api.GET('/api/me/cards/{id}', { params: { path: { id: item?.card_id ?? '' } } })),
  })
  const reveal = detail.data?.reveal
  const line = 'border-b-[0.5px] border-divider py-2.5 text-[16px] leading-snug'
  return (
    <Sheet open={!!item} onClose={onClose} title={t('detail.title')}>
      <div className="px-4 pb-4 pt-1">
        {detail.isLoading && <Skeleton className="h-24 w-full" />}
        {detail.isError && <p className="py-4 text-body text-text-secondary">{t('detail.failed')}</p>}
        {reveal && item && (
          <>
            <p className={line}>
              <b className="font-semibold">{t('detail.yours')}: </b>
              {t(`answers.${item.label}`)}
              <span className="block text-[14px] text-text-secondary">{formatShortDate(item.created_at, locale)}</span>
            </p>
            {item.label === 'real' && detail.data && <NoteBlock cardId={item.card_id} note={detail.data.note} editable={detail.data.note_editable} />}
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

function Thumb({ item }: { item: MyCardItem }) {
  const box = 'pixelated block size-12 shrink-0 overflow-hidden rounded-lg bg-media-bg'
  if (!item.thumb) return <span aria-hidden="true" className={box} />
  if (!item.thumb_cols) return <span aria-hidden="true" className={`${box} bg-cover`} style={{ backgroundImage: `url(${item.thumb})` }} />
  return <span aria-hidden="true" className={`${box} bg-no-repeat`} style={{ backgroundImage: `url(${item.thumb})`, backgroundSize: `${item.thumb_cols * 100}% 200%`, backgroundPosition: '0 0' }} />
}

function Row({ item, onOpen }: { item: MyCardItem; onOpen: () => void }) {
  const t = useTranslations('community.myCards')
  const body = (
    <>
      <Thumb item={item} />
      <span className="min-w-0 flex-1 text-[16px] leading-tight">{t(`answers.${item.label}`)}</span>
      {item.finding === 'candidate' && <StatePill state={item.finding} />}
      <IconChevronRight size={18} className="shrink-0 text-text-secondary" />
    </>
  )
  const cls = 'flex min-h-16 items-center gap-3 px-4 py-2'
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
  const [open, setOpen] = useState<MyCardItem | null>(null)
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
          <Row key={item.card_id} item={item} onOpen={() => setOpen(item)} />
        ))}
      </ul>
      <div ref={sentinel} />
      <CardDetail item={open} onClose={() => setOpen(null)} />
    </main>
  )
}
