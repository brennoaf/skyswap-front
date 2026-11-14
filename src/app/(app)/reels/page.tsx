'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Crosshair } from '@/components/feed/post-media'
import { IconComment, IconDirect, IconMore, IconPlay, IconSave, IconTarget } from '@/components/icons'
import { TagPanel } from '@/components/post/tag-panel'
import { Button, IconButton, isSaturated, isVerified, ObjectAvatar, ObjectBadges, Sheet, Skeleton } from '@/components/ui/primitives'
import type { FeedItem } from '@/lib/api/client'
import { useFeed } from '@/lib/api/hooks'
import { formatDateTime, formatShortDate, formatWavelength } from '@/lib/format'
import { useShare } from '@/lib/share'
import { useUi } from '@/lib/state/ui'

const REEL_H = 'h-[calc(100dvh-var(--height-bottomnav))]'
const ON_BLACK = '[--color-text:#f8f8f9] [--color-text-secondary:rgb(248_248_249/0.75)]'

function useReducedMotionPref() {
  const [reduce, setReduce] = useState(false)
  useEffect(() => {
    const mq = matchMedia('(prefers-reduced-motion: reduce)')
    setReduce(mq.matches)
    const on = (e: MediaQueryListEvent) => setReduce(e.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduce
}

function Reel({ item, index, active, onVisible, onTags }: { item: FeedItem; index: number; active: boolean; onVisible: (i: number) => void; onTags: (postId: string) => void }) {
  const t = useTranslations('reels')
  const tp = useTranslations('post')
  const ref = useRef<HTMLElement>(null)
  const reduce = useReducedMotionPref()
  const crosshair = useUi((s) => s.crosshair)
  const saved = useUi((s) => s.saved.includes(item.post.id))
  const toggleSaved = useUi((s) => s.toggleSaved)
  const seen = useUi((s) => s.seenStories.includes(item.object.id))
  const share = useShare()
  const [frame, setFrame] = useState(0)
  const [paused, setPaused] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const { post, object } = item
  const n = post.frames.length
  const playing = active && !paused && !reduce && n > 1
  const total = item.tags.counts ? Object.values(item.tags.counts).reduce((a, b) => a + b, 0) : 0

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && onVisible(index), { threshold: 0.6 })
    io.observe(el)
    return () => io.disconnect()
  }, [onVisible, index])

  useEffect(() => {
    if (!active) return
    for (const f of post.frames) {
      const img = new window.Image()
      img.src = f.src
    }
  }, [active, post.frames])

  useEffect(() => {
    if (!playing) return
    const timer = setInterval(() => setFrame((f) => (f + 1) % n), 125)
    return () => clearInterval(timer)
  }, [playing, n])

  const shown = post.frames[frame]
  const mark = post.marks.find((m) => m.frame === frame)
  const from = post.date_range[0] ?? shown?.t ?? ''
  const to = post.date_range[1] ?? from

  return (
    <section ref={ref} aria-label={`${object.handle} · ${post.title}`} className={`relative w-full shrink-0 snap-start snap-always overflow-hidden bg-black ${REEL_H}`}>
      <button type="button" className="absolute inset-0 block size-full" aria-label={paused ? t('play') : t('pause')} aria-pressed={paused} onClick={() => setPaused((p) => !p)}>
        {shown && (
          <Image
            src={shown.src}
            alt={tp('frameAlt', { band: shown.band, date: formatShortDate(shown.t) })}
            fill
            sizes="(max-width: 470px) 100vw, 470px"
            className="pixelated object-contain"
            unoptimized
            priority={active}
          />
        )}
        {crosshair && mark && (
          <span className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[min(100%,calc(100dvh-var(--height-bottomnav)))] -translate-x-1/2 -translate-y-1/2">
            <Crosshair x={mark.x} y={mark.y} />
          </span>
        )}
      </button>

      {(paused || reduce) && n > 1 && (
        <span className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2 text-white" aria-hidden="true">
          <span className="flex size-16 items-center justify-center rounded-full bg-black/50">
            <IconPlay size={36} />
          </span>
          {paused && <span className="rounded-full bg-black/60 px-2.5 py-1 text-[12px] font-medium">{t('mute')}</span>}
        </span>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-linear-to-t from-black/80 via-black/35 to-transparent" aria-hidden="true" />

      <div className={`absolute bottom-3 left-3 right-[68px] text-[color:var(--color-text)] ${ON_BLACK}`}>
        <div className="flex items-center gap-2">
          <Link href={`/o/${object.id}`} className="flex min-w-0 items-center gap-2" aria-label={t('profile')}>
            <ObjectAvatar src={object.avatar} alt="" size={34} ring={seen ? 'seen' : 'new'} />
            <span className="truncate text-[14px] font-semibold">{object.handle}</span>
          </Link>
          <ObjectBadges verified={isVerified(object.verdict)} saturated={isSaturated(object.saturation)} size={13} />
        </div>
        <button type="button" onClick={() => setExpanded((e) => !e)} className={expanded ? 'mt-2 block text-left text-[14px]' : 'mt-2 line-clamp-2 text-left text-[14px]'}>
          <span className="font-semibold">{post.title}.</span> {post.caption}
        </button>
        <p className="mt-1.5 text-[12px] text-[color:var(--color-text-secondary)]">{t('frames', { n, from: formatShortDate(from), to: formatShortDate(to) })}</p>
        {shown && (
          <p className="mt-0.5 text-[12px] tabular-nums text-[color:var(--color-text-secondary)]">
            {shown.band} · {formatWavelength(shown.wavelength_um)} · {formatDateTime(shown.t)} · {tp('falseColour')}
          </p>
        )}
      </div>

      <div className={`absolute bottom-3 right-1 flex flex-col items-center gap-1 drop-shadow ${ON_BLACK}`}>
        <div className="flex flex-col items-center">
          <IconButton label={tp('actions.tag')} onClick={() => onTags(post.id)}>
            <IconComment />
          </IconButton>
          <span className="-mt-1 text-[12px] font-semibold text-white">{item.tags.counts ? total : ''}</span>
        </div>
        <Link href={`/p/${post.id}?mark=1`} aria-label={tp('actions.mark')} title={tp('actions.mark')} className="inline-flex size-11 items-center justify-center rounded-full text-white active:scale-90">
          <IconTarget />
        </Link>
        <IconButton label={tp('actions.share')} onClick={() => share({ title: post.title, path: `/p/${post.id}` })}>
          <IconDirect />
        </IconButton>
        <IconButton label={saved ? tp('actions.unsave') : tp('actions.save')} aria-pressed={saved} onClick={() => toggleSaved(post.id)}>
          <IconSave filled={saved} />
        </IconButton>
        <Link href={`/p/${post.id}`} aria-label={t('openPost')} title={t('openPost')} className="inline-flex size-11 items-center justify-center rounded-full text-white active:scale-90">
          <IconMore />
        </Link>
      </div>

      {n > 1 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-white/20" aria-hidden="true">
          <div className="h-full bg-white" style={{ width: `${((frame + 1) / n) * 100}%` }} />
        </div>
      )}
    </section>
  )
}

export default function ReelsPage() {
  const t = useTranslations('reels')
  const th = useTranslations('home')
  const feed = useFeed('for_you')
  const [active, setActive] = useState(0)
  const [tagsFor, setTagsFor] = useState<string | null>(null)
  const items = useMemo(() => feed.data?.pages.flatMap((p) => p.items) ?? [], [feed.data])
  const reels = useMemo(() => {
    const lapses = items.filter((i) => i.post.type === 'timelapse' && i.post.frames.length > 1)
    return lapses.length ? lapses : items.filter((i) => i.post.type === 'pass_blink' && i.post.frames.length > 1)
  }, [items])
  const tagItem = reels.find((r) => r.post.id === tagsFor) ?? null
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = feed

  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && (active >= reels.length - 2 || !reels.length) && !feed.isLoading) void fetchNextPage()
  }, [active, reels.length, hasNextPage, isFetchingNextPage, fetchNextPage, feed.isLoading])

  const closeTags = useCallback(() => setTagsFor(null), [])

  return (
    <main className={`relative bg-black text-white ${REEL_H}`}>
      <h1 className="pointer-events-none absolute left-4 top-3 z-20 font-[family-name:var(--font-display)] text-[22px] font-bold text-white drop-shadow">{t('title')}</h1>
      <div className={`no-scrollbar snap-y snap-mandatory overflow-y-auto overscroll-contain ${REEL_H}`} aria-label={t('label')} role="feed" aria-busy={feed.isFetching}>
        {feed.isLoading && (
          <div className={`relative flex items-center justify-center ${REEL_H}`} aria-label={t('loading')}>
            <Skeleton className="aspect-square w-full rounded-none opacity-20" />
          </div>
        )}
        {feed.isError && (
          <div className={`flex flex-col items-center justify-center gap-4 px-8 text-center ${REEL_H}`}>
            <p className="text-[18px] font-semibold">{th('errorTitle')}</p>
            <p className="text-white/70">{th('errorBody')}</p>
            <Button variant="primary" onClick={() => feed.refetch()}>
              {th('retry')}
            </Button>
          </div>
        )}
        {!feed.isLoading && !feed.isError && !reels.length && !hasNextPage && (
          <div className={`flex flex-col items-center justify-center gap-2 px-8 text-center ${REEL_H}`}>
            <p className="text-[18px] font-semibold">{t('empty')}</p>
            <p className="text-white/70">{t('emptyBody')}</p>
          </div>
        )}
        {reels.map((item, i) => (
          <Reel key={item.post.id} item={item} index={i} active={i === active} onVisible={setActive} onTags={setTagsFor} />
        ))}
        {isFetchingNextPage && (
          <div className={`flex snap-start items-center justify-center ${REEL_H}`}>
            <span className="text-[13px] text-white/60">{t('loading')}</span>
          </div>
        )}
      </div>
      <TagsSheet item={tagItem} onClose={closeTags} />
    </main>
  )
}

function TagsSheet({ item, onClose }: { item: FeedItem | null; onClose: () => void }) {
  const t = useTranslations('tags')
  return (
    <Sheet open={!!item} onClose={onClose} title={t('title')} className="text-text">
      {item && (
        <div className="px-4 py-4">
          <p className="mb-3 text-[13px] text-text-secondary">{t('explain')}</p>
          <TagPanel postId={item.post.id} tags={item.tags} />
        </div>
      )}
    </Sheet>
  )
}
