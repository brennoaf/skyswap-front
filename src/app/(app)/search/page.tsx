'use client'

import { useQueryClient } from '@tanstack/react-query'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useRef, useState } from 'react'
import { skyHref } from '@/components/feed/spot-sheet'
import { IconChevronRight, IconClose, IconReel, IconSearch, IconTarget } from '@/components/icons'
import { Button, Chip, EmptyState, ObjectAvatar, Skeleton } from '@/components/ui/primitives'
import type { FeedItem, SearchResult } from '@/lib/api/client'
import { searchQuery, useFeed, useObject, useObjects, useSearch } from '@/lib/api/hooks'
import { formatDec, formatRa, formatShortPosition } from '@/lib/format'
import { directSpot, spotName, spotObject } from '@/lib/search-direct'

const TARGET_ORDER = ['barnards-star', 'eps-indi-b', 'wise-0855-0714', 'rw-aurigae', 'r-draconis']
const targetRank = (id: string) => (TARGET_ORDER.includes(id) ? TARGET_ORDER.indexOf(id) : TARGET_ORDER.length)
import { useUi } from '@/lib/state/ui'
import { useFmt } from '@/lib/use-fmt'

const NAME_CHIPS = ['WISE 0855', 'Eros', "Barnard's Star", 'Proxima Centauri']

type Spot = NonNullable<SearchResult['spot']>
type Hit = SearchResult['objects'][number]

function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-2" aria-hidden="true">
      <Skeleton className="size-11 rounded-full" />
      <span className="flex-1">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="mt-2 h-3 w-44" />
      </span>
    </div>
  )
}

function ResultRow({ o, onOpen }: { o: Hit; onOpen: () => void }) {
  const fmt = useFmt()
  const t = useTranslations('search')
  const tp = useTranslations('post')
  const kindKey = `kinds.${o.kind}`
  const kind = tp.has(kindKey) ? tp(kindKey) : o.kind
  return (
    <li>
      <Link href={`/o/${o.id}`} onClick={onOpen} className="flex min-h-[60px] items-center gap-3 px-4 py-2 active:bg-surface">
        <ObjectAvatar src={o.avatar} alt="" size={44} ring={o.has_new_data ? 'new' : 'none'} />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-body font-semibold">{o.name}</span>
          <span className="block truncate text-body text-text-secondary">
            {o.handle}, {kind}
            {o.separation_deg !== null && `, ${t('separation', { deg: fmt.fixed(o.separation_deg, 2) })}`}
          </span>
        </span>
      </Link>
    </li>
  )
}

function WatchRow({ spot, name, onWatch, obj }: { spot: Spot; name: string | null; onWatch: () => void; obj: string | null }) {
  const t = useTranslations('search')
  return (
    <Link href={skyHref({ ra: spot.ra, dec: spot.dec, name, obj })} onClick={onWatch} className="flex min-h-[60px] items-center gap-3 px-4 py-2 active:bg-surface">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full border-[0.5px] border-divider">
        <IconTarget size={24} />
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-body font-semibold">{t('watchTitle')}</span>
        <span className="block truncate text-body text-text-secondary">{name ?? t('coordinates', { ra: formatRa(spot.ra), dec: formatDec(spot.dec) })}</span>
      </span>
      <IconChevronRight size={20} className="shrink-0 text-text-secondary" />
    </Link>
  )
}

function NameChips({ onPick }: { onPick: (name: string) => void }) {
  return (
    <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-4 pb-3 pt-1">
      {NAME_CHIPS.map((name) => (
        <Chip key={name} onClick={() => onPick(name)}>
          {name}
        </Chip>
      ))}
    </div>
  )
}

function TargetRow({ id }: { id: string }) {
  const { data: o } = useObject(id)
  if (!o) return <RowSkeleton />
  return (
    <li>
      <Link href={`/o/${o.id}`} className="flex min-h-[60px] items-center gap-3 px-4 py-2 active:bg-surface">
        <ObjectAvatar src={o.avatar} alt="" size={44} ring={o.has_new_data ? 'new' : 'none'} />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-body font-semibold">{o.name}</span>
          <span className="block truncate text-body tabular-nums text-text-secondary">{formatShortPosition(o.ra, o.dec)}</span>
        </span>
        <IconChevronRight size={20} className="shrink-0 text-text-secondary" />
      </Link>
    </li>
  )
}

function Targets() {
  const t = useTranslations('search')
  const objects = useObjects()
  const ids = (objects.data ?? [])
    .filter((o) => o.official_target)
    .map((o) => o.id)
    .sort((a, b) => targetRank(a) - targetRank(b))
  if (!ids.length) return null
  return (
    <section className="pb-2" aria-labelledby="targets-title" data-testid="search-targets">
      <h2 id="targets-title" className="px-4 pb-1 pt-2 text-title-sm font-semibold">
        {t('targets')}
      </h2>
      <ul>
        {ids.map((id) => (
          <TargetRow key={id} id={id} />
        ))}
      </ul>
    </section>
  )
}

function ExploreGrid() {
  const t = useTranslations('search')
  const objects = useObjects()
  const feed = useFeed('for_you')
  const items = useMemo(() => feed.data?.pages.flatMap((p) => p.items) ?? [], [feed.data])
  const tiles = useMemo(() => {
    const byObject = new Map<string, FeedItem>()
    for (const it of items) if (!byObject.has(it.object.id)) byObject.set(it.object.id, it)
    return (objects.data ?? []).map((o) => byObject.get(o.id)).filter((x): x is FeedItem => !!x)
  }, [items, objects.data])
  const want = objects.data?.length ?? 0
  const pages = feed.data?.pages.length ?? 0

  useEffect(() => {
    if (want && tiles.length < want && feed.hasNextPage && !feed.isFetchingNextPage && pages < 12) void feed.fetchNextPage()
  }, [want, tiles.length, feed, pages])

  if (objects.isLoading || feed.isLoading)
    return (
      <div className="grid grid-cols-3 gap-px" aria-hidden="true">
        {Array.from({ length: 9 }, (_, i) => (
          <Skeleton key={i} className="aspect-[3/4] rounded-none" />
        ))}
      </div>
    )

  return (
    <section aria-label={t('explore')}>
      <h2 className="sr-only">{t('explore')}</h2>
      <ul className="grid grid-cols-3 gap-px">
        {tiles.map((it) => (
          <li key={it.post.id}>
            <Link href={`/p/${it.post.id}`} aria-label={t('exploreTile', { name: it.object.name })} className="relative block aspect-[3/4] overflow-hidden bg-media-bg">
              <Image src={it.post.cover} alt="" fill sizes="(max-width: 470px) 33vw, 157px" className="pixelated object-contain" unoptimized />
              {it.post.type === 'timelapse' && (
                <span className="absolute right-1 top-1 text-white drop-shadow" aria-hidden="true">
                  <IconReel size={22} />
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function SearchPage() {
  const t = useTranslations('search')
  const tc = useTranslations('common')
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const recent = useUi((s) => s.recentSearches)
  const addRecent = useUi((s) => s.addRecentSearch)
  const clearRecent = useUi((s) => s.clearRecentSearches)
  const search = useSearch(debounced)
  const queryClient = useQueryClient()
  const router = useRouter()

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 350)
    return () => clearTimeout(id)
  }, [query])

  const q = query.trim()
  const pending = q !== debounced || search.isFetching
  const data = search.data && search.data.query === debounced ? search.data : null
  const [saveFor, setSaveFor] = useState<string | null>(null)
  const remember = () => {
    if (data?.resolved) addRecent(data.query)
  }

  useEffect(() => {
    if (!saveFor || !data || data.query !== saveFor) return
    if (data.resolved) addRecent(data.query)
    setSaveFor(null)
  }, [saveFor, data, addRecent])
  const nearbyMode = !!data?.objects.some((o) => o.separation_deg !== null)
  const pick = (name: string) => {
    setQuery(name)
    setDebounced(name)
    setSaveFor(name)
  }

  return (
    <main>
      <form
        role="search"
        className="sticky top-0 z-30 flex h-[var(--height-topbar)] items-center bg-bg px-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!q) return
          setDebounced(q)
          setSaveFor(q)
          input.current?.blur()
          void queryClient
            .fetchQuery(searchQuery(q))
            .then((r) => {
              const go = directSpot(r)
              if (!go || input.current?.value.trim() !== q) return
              addRecent(r.query)
              router.push(go.obj ? `/o/${go.obj}` : skyHref(go))
            })
            .catch(() => undefined)
        }}
      >
        <label htmlFor="search-q" className="sr-only">
          {t('label')}
        </label>
        <div className="field-focus flex h-9 w-full items-center rounded-[var(--radius-input)] bg-surface">
          <IconSearch size={20} className="ml-2.5 shrink-0 text-text-secondary" />
          <input
            id="search-q"
            ref={input}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            value={query}
            maxLength={120}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('placeholder')}
            className="h-full min-w-0 flex-1 bg-transparent px-2 text-title-sm outline-none placeholder:text-text-secondary [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              aria-label={t('clearQuery')}
              onClick={() => {
                setQuery('')
                setDebounced('')
                input.current?.focus()
              }}
              className="mr-0.5 inline-flex size-9 shrink-0 items-center justify-center text-text-secondary"
            >
              <span className="inline-flex size-[18px] items-center justify-center rounded-full bg-text-secondary text-surface">
                <IconClose size={14} />
              </span>
            </button>
          )}
        </div>
      </form>

      {!q && (
        <>
          {recent.length > 0 && (
            <section className="pb-2" aria-labelledby="recent-title">
              <div className="flex items-center justify-between px-4 pb-1 pt-2">
                <h2 id="recent-title" className="text-title-sm font-semibold">
                  {t('recent')}
                </h2>
                <button type="button" onClick={clearRecent} className="min-h-11 px-1 text-body font-semibold text-link">
                  {t('clear')}
                </button>
              </div>
              <ul>
                {recent.map((r) => (
                  <li key={r}>
                    <button
                      type="button"
                      aria-label={t('recentSearch', { q: r })}
                      onClick={() => {
                        setQuery(r)
                        setDebounced(r)
                      }}
                      className="flex min-h-[60px] w-full items-center gap-3 px-4 py-2 text-left active:bg-surface"
                    >
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-full border-[0.5px] border-divider">
                        <IconSearch size={22} />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-body font-semibold">{r}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <Targets />
          <NameChips onPick={pick} />
          <ExploreGrid />
        </>
      )}

      {q && (
        <div aria-live="polite" aria-busy={pending}>
          {pending && !data && (
            <>
              <p className="sr-only">{t('searching')}</p>
              <RowSkeleton />
              <RowSkeleton />
              <RowSkeleton />
            </>
          )}
          {search.isError && !pending && <EmptyState title={t('failed')} action={<Button onClick={() => search.refetch()}>{tc('retry')}</Button>} />}
          {data && !data.resolved && <EmptyState title={t('noResults', { q: data.query })} action={<NameChips onPick={pick} />} />}
          {data?.resolved && (
            <>
              {data.objects.length > 0 && (
                <section aria-labelledby="results-title" className="pt-2">
                  <h2 id="results-title" className="px-4 pb-1 pt-2 text-title-sm font-semibold">
                    {nearbyMode ? t('nearby') : t('results')}
                  </h2>
                  <ul>
                    {data.objects.map((o) => (
                      <ResultRow key={o.id} o={o} onOpen={remember} />
                    ))}
                  </ul>
                </section>
              )}
              {data.spot && <WatchRow spot={data.spot} name={spotName(data)} onWatch={remember} obj={spotObject(data)} />}
              {!data.spot && !data.objects.length && <EmptyState title={t('noResults', { q: data.query })} />}
            </>
          )}
        </div>
      )}
    </main>
  )
}
