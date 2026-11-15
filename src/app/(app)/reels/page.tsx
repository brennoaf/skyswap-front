'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Crosshair } from '@/components/feed/post-media'
import { IconDirect, IconMore, IconSave, IconTag, IconTarget } from '@/components/icons'
import { PlayerBar } from '@/components/player/player-bar'
import { usePlayback } from '@/components/player/use-playback'
import { TagPanel } from '@/components/post/tag-panel'
import { Button, IconButton, ObjectAvatar, Sheet, Skeleton } from '@/components/ui/primitives'
import type { FeedItem } from '@/lib/api/client'
import { useFeed } from '@/lib/api/hooks'
import { formatShortDate } from '@/lib/format'
import { useShare } from '@/lib/share'
import { useBandName } from '@/lib/use-band'
import { frameYear, isLongBaseline, LONG_BASELINE_FPS, telescopeOf } from '@/lib/long-baseline'
import { useUi } from '@/lib/state/ui'
import { postCaption, postTitle } from '@/lib/post-text'

const REEL_H = 'h-[calc(100dvh-var(--height-bottomnav)-env(safe-area-inset-bottom))]'
const REEL_CAPTION = 88
const REEL_BAR = 228
const ON_BLACK = '[--color-text:var(--color-on-media)] [--color-text-secondary:var(--color-on-media-muted)]'

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

function useSettledFrames(srcs: string[], active: boolean): Set<string> {
  const [settled, setSettled] = useState<Set<string>>(() => new Set())
  const asked = useRef(new Set<string>())
  useEffect(() => {
    if (!active) return
    let alive = true
    for (const src of srcs) {
      if (asked.current.has(src)) continue
      asked.current.add(src)
      const img = new window.Image()
      const done = () => {
        if (alive) setSettled((s) => new Set(s).add(src))
        else asked.current.delete(src)
      }
      img.onload = done
      img.onerror = done
      img.src = src
    }
    return () => {
      alive = false
    }
  }, [active, srcs])
  return settled
}

function Reel({ item, index, active, onVisible, onTags }: { item: FeedItem; index: number; active: boolean; onVisible: (i: number) => void; onTags: (postId: string) => void }) {
  const tv = useTranslations('viewer.longBaseline')
  const locale = useLocale()
  const t = useTranslations('reels')
  const tp = useTranslations('post')
  const ref = useRef<HTMLElement>(null)
  const reduce = useReducedMotionPref()
  const crosshair = useUi((s) => s.crosshair)
  const saved = useUi((s) => s.saved.includes(item.post.id))
  const toggleSaved = useUi((s) => s.toggleSaved)
  const seen = useUi((s) => s.seenStories.includes(item.object.id))
  const share = useShare()
  const bandName = useBandName()
  const [expanded, setExpanded] = useState(false)
  const { post, object } = item
  const n = post.frames.length
  const srcs = useMemo(() => post.frames.map((f) => f.src), [post.frames])
  const settled = useSettledFrames(srcs, active)
  const [at, setAt] = useState(0)
  const nextSrc = srcs[(at + 1) % Math.max(1, n)]
  const playback = usePlayback(n, { baseMs: isLongBaseline(post) ? 1000 / LONG_BASELINE_FPS : 125, autoplay: true, enabled: active && !reduce, frozen: !nextSrc || !settled.has(nextSrc) })
  const frame = playback.index
  useEffect(() => setAt(frame), [frame])
  const title = postTitle(post.title, locale)
  const total = item.tags.counts ? Object.values(item.tags.counts).reduce((a, b) => a + b, 0) : 0

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && onVisible(index), { threshold: 0.6 })
    io.observe(el)
    return () => io.disconnect()
  }, [onVisible, index])

  const shown = post.frames[frame]
  const ready = !!shown && settled.has(shown.src)
  const mark = post.marks.find((m) => m.frame === frame)

  return (
    <section ref={ref} aria-label={`${object.name}, ${title}`} className={`relative w-full shrink-0 snap-start snap-always overflow-hidden bg-reels-bg ${REEL_H}`}>
      {shown && isLongBaseline(post) && (
        <span className="pointer-events-none absolute left-3 top-14 z-10 rounded-full bg-media-scrim px-2.5 py-1 text-note font-semibold text-on-media">
          {tv('pill', { year: frameYear(shown), telescope: telescopeOf(shown) })}
        </span>
      )}
      <button type="button" className="absolute inset-x-0 top-0 block [container-type:size]" style={{ bottom: n > 1 ? REEL_BAR : REEL_CAPTION }} aria-label={playback.playing ? t('pause') : t('play')} aria-pressed={!playback.playing} onClick={() => playback.setPlaying(!playback.playing)}>
        {shown && (
          <Image
            src={shown.src}
            alt={tp('frameAlt', { band: bandName(shown.band), date: formatShortDate(shown.t, locale) })}
            fill
            sizes="(max-width: 470px) 100vw, 470px"
            className="pixelated object-contain"
            unoptimized
            priority={active}
          />
        )}
        {!ready && <Skeleton className="absolute left-1/2 top-1/2 aspect-square w-[min(100cqw,100cqh)] -translate-x-1/2 -translate-y-1/2 rounded-none opacity-20" />}
        {ready && crosshair && mark && (
          <span className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[min(100cqw,100cqh)] -translate-x-1/2 -translate-y-1/2">
            <Crosshair x={mark.x} y={mark.y} />
          </span>
        )}
      </button>

      <div className="absolute inset-x-0 z-10 px-2" style={{ bottom: REEL_CAPTION }}>
        <PlayerBar
          reserve
          tone="media"
          playback={playback}
          seconds={post.frames.map((f) => (Date.parse(f.t) - Date.parse(post.frames[0]?.t ?? f.t)) / 1000)}
          dates={post.frames.map((f) => f.t)}
          thumb={(i) => {
            const f = active ? post.frames[i] : null
            return f ? <Image src={f.src} alt="" fill sizes="56px" className="pixelated object-contain" unoptimized /> : null
          }}
        />
      </div>

      <div className={`absolute bottom-3 left-3 right-3 z-20 text-[color:var(--color-text)] ${ON_BLACK}`}>
        <div className="flex items-center gap-2">
          <Link href={`/o/${object.id}`} className="flex min-w-0 items-center gap-2" aria-label={t('profile')}>
            <ObjectAvatar src={object.avatar} alt="" size={34} ring={seen ? 'seen' : 'new'} />
            <span className="truncate text-body font-semibold">{object.name}</span>
          </Link>
        </div>
        <button type="button" onClick={() => setExpanded((e) => !e)} className={expanded ? 'mt-2 block text-left text-body' : 'mt-2 line-clamp-2 text-left text-body'}>
          <span className="font-semibold">{title}.</span> {postCaption(post.caption, locale)}
        </button>
      </div>

      <div className={`absolute right-1 flex flex-col items-center gap-1 drop-shadow ${ON_BLACK}`} style={{ bottom: n > 1 ? REEL_BAR : REEL_CAPTION }}>
        <div className="flex flex-col items-center">
          <IconButton label={tp('actions.tag')} onClick={() => onTags(post.id)}>
            <IconTag />
          </IconButton>
          <span className="-mt-1 text-meta font-semibold text-white">{item.tags.counts ? total : ''}</span>
        </div>
        <Link href={`/p/${post.id}?mark=1`} aria-label={tp('actions.mark')} title={tp('actions.mark')} className="inline-flex size-11 items-center justify-center rounded-full text-white active:scale-90">
          <IconTarget />
        </Link>
        <IconButton label={tp('actions.share')} onClick={() => share({ title, path: `/p/${post.id}` })}>
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
    const lapses = items.filter((i) => (i.post.type === 'timelapse' || i.post.type === 'long_baseline') && i.post.frames.length > 1)
    return lapses.length ? lapses : items.filter((i) => i.post.type === 'pass_blink' && i.post.frames.length > 1)
  }, [items])
  const tagItem = reels.find((r) => r.post.id === tagsFor) ?? null
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = feed

  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && (active >= reels.length - 2 || !reels.length) && !feed.isLoading) void fetchNextPage()
  }, [active, reels.length, hasNextPage, isFetchingNextPage, fetchNextPage, feed.isLoading])

  const closeTags = useCallback(() => setTagsFor(null), [])

  return (
    <main className={`relative bg-reels-bg text-on-media ${REEL_H}`}>
      <h1 className="pointer-events-none absolute left-4 top-3 z-20 font-[family-name:var(--font-display)] text-title-lg font-bold text-white drop-shadow">{t('title')}</h1>
      <div className={`no-scrollbar snap-y snap-mandatory overflow-y-auto overscroll-contain ${REEL_H}`} aria-label={t('label')} role="feed" aria-busy={feed.isFetching}>
        {feed.isLoading && (
          <div className={`relative flex items-center justify-center ${REEL_H}`} aria-label={t('loading')}>
            <Skeleton className="aspect-square w-full rounded-none opacity-20" />
          </div>
        )}
        {feed.isError && (
          <div className={`flex flex-col items-center justify-center gap-4 px-8 text-center ${REEL_H}`}>
            <p className="text-title-md font-semibold">{th('errorTitle')}</p>
            <p className="text-white/70">{th('errorBody')}</p>
            <Button variant="primary" onClick={() => feed.refetch()}>
              {th('retry')}
            </Button>
          </div>
        )}
        {!feed.isLoading && !feed.isError && !reels.length && !hasNextPage && (
          <div className={`flex flex-col items-center justify-center gap-2 px-8 text-center ${REEL_H}`}>
            <p className="text-title-md font-semibold">{t('empty')}</p>
            <p className="text-white/70">{t('emptyBody')}</p>
          </div>
        )}
        {reels.map((item, i) => (
          <Reel key={item.post.id} item={item} index={i} active={i === active} onVisible={setActive} onTags={setTagsFor} />
        ))}
        {isFetchingNextPage && (
          <div className={`flex snap-start items-center justify-center ${REEL_H}`}>
            <span className="text-note text-white/60">{t('loading')}</span>
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
          <p className="mb-3 text-note text-text-secondary">{t('explain')}</p>
          <TagPanel postId={item.post.id} tags={item.tags} />
        </div>
      )}
    </Sheet>
  )
}
