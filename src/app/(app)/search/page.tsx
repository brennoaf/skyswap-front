'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useRef, useState } from 'react'
import { skyHref } from '@/components/feed/spot-sheet'
import { IconClose, IconLink, IconReel, IconSearch, IconTarget, IconWarning } from '@/components/icons'
import { Button, EmptyState, isSaturated, isVerified, Notice, ObjectAvatar, ObjectBadges, Skeleton } from '@/components/ui/primitives'
import type { FeedItem, SearchResult } from '@/lib/api/client'
import { useFeed, useObjects, useSearch } from '@/lib/api/hooks'
import { formatDec, formatRa } from '@/lib/format'
import { useUi } from '@/lib/state/ui'
import { useFmt } from '@/lib/use-fmt'

function IconCode() {
  return (
    <svg width={20} height={20} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M12 10L6 16L12 22M20 10L26 16L20 22" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

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
          <span className="flex items-center gap-1">
            <span className="truncate text-body font-semibold">{o.handle}</span>
            <ObjectBadges verified={isVerified(o.verdict)} saturated={isSaturated(o.saturation)} />
          </span>
          <span className="block truncate text-body text-text-secondary">
            {o.name}, {kind}
            {o.separation_deg !== null && `, ${t('separation', { deg: fmt.fixed(o.separation_deg, 2) })}`}
          </span>
        </span>
      </Link>
    </li>
  )
}

function SpotCard({ spot, onWatch, obj }: { spot: Spot; onWatch: () => void; obj: string | null }) {
  const fmt = useFmt()
  const t = useTranslations('search')
  const ts = useTranslations('sky')
  const toast = useUi((s) => s.toast)
  const [manual, setManual] = useState<string | null>(null)
  const href = skyHref({ ra: spot.ra, dec: spot.dec, name: spot.name, obj })
  const sourceKey = `sources.${spot.source}`
  const source = t.has(sourceKey) ? t(sourceKey) : spot.source
  const coords = t('coordinates', { ra: formatRa(spot.ra), dec: formatDec(spot.dec) })

  const copy = async (kind: 'link' | 'embed') => {
    const origin = window.location.origin
    const text =
      kind === 'link'
        ? `${origin}${href}`
        : `<iframe src="${origin}${href.replace('/sky?', '/embed?')}" width="360" height="640" style="border:0;border-radius:12px" loading="lazy" allow="fullscreen" title="${ts('embedTitle')}"></iframe>`
    try {
      await navigator.clipboard.writeText(text)
      setManual(null)
      toast({ kind: 'info', key: 'search.copied' })
    } catch {
      setManual(text)
    }
  }

  return (
    <section className="mx-4 mb-2 mt-3 rounded-2xl border-[0.5px] border-divider bg-bg-elevated p-4" aria-labelledby="spot-title">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface text-text">
          <IconTarget size={26} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-meta font-semibold uppercase tracking-wide text-text-secondary">{t('watchTitle')}</p>
          <h2 id="spot-title" className="truncate text-title-sm font-semibold">
            {spot.name ?? coords}
          </h2>
          {spot.name && <p className="text-note text-text-secondary">{coords}</p>}
          <p className="text-note text-text-secondary">{t('resolvedBy', { source })}</p>
        </div>
      </div>
      {spot.stale && (
        <div className="mt-3">
          <Notice tone="warning" icon={<IconWarning size={20} />}>
            {spot.moved_arcsec !== null && spot.epoch !== null ? t('stale', { epoch: spot.epoch, moved: fmt.fixed(spot.moved_arcsec, 1) }) : t('staleUnknown')}
          </Notice>
        </div>
      )}
      <p className="mt-3 text-body">{t('watchBody')}</p>
      <Link
        href={href}
        onClick={onWatch}
        className="mt-3 flex min-h-11 w-full items-center justify-center rounded-[var(--radius-button)] bg-accent px-3 text-ui font-semibold text-on-accent active:bg-accent-pressed"
      >
        {t('watchOpen')}
      </Link>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button className="min-h-9 whitespace-nowrap" onClick={() => void copy('link')} aria-label={t('copyDeepLink')}>
          <IconLink size={20} />
          {t('deepLink')}
        </Button>
        <Button className="min-h-9 whitespace-nowrap" onClick={() => void copy('embed')} aria-label={t('copyEmbed')}>
          <IconCode />
          {t('embed')}
        </Button>
      </div>
      {manual && (
        <label className="mt-3 block text-note text-text-secondary">
          {t('copyFailed')}
          <textarea
            readOnly
            autoFocus
            value={manual}
            rows={3}
            onFocus={(e) => e.currentTarget.select()}
            className="mt-1 block w-full resize-none rounded-[var(--radius-input)] border-[0.5px] border-divider bg-surface p-2 font-mono text-meta text-text outline-none"
          />
        </label>
      )}
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
        }}
      >
        <label htmlFor="search-q" className="sr-only">
          {t('label')}
        </label>
        <div className="flex h-9 w-full items-center rounded-[var(--radius-input)] bg-surface focus-within:ring-1 focus-within:ring-divider">
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
          <p className="px-4 pb-3 pt-1 text-note text-text-secondary">{t('hint')}</p>
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
          {data && !data.resolved && <EmptyState title={t('noResults', { q: data.query })} body={t('hint')} />}
          {data?.resolved && (
            <>
              {data.spot && <SpotCard spot={data.spot} onWatch={remember} obj={data.spot.source === 'kit' ? (data.objects[0]?.id ?? null) : null} />}
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
              {!data.spot && !data.objects.length && <EmptyState title={t('noResults', { q: data.query })} />}
            </>
          )}
        </div>
      )}
    </main>
  )
}
