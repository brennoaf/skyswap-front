'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { IconChevronRight, IconInfo, IconShare } from '@/components/icons'
import { Glass, glassClass } from '@/components/ui/glass'
import { Sheet } from '@/components/ui/primitives'
import { UserAvatar } from '@/components/ui/user-avatar'
import type { AppPostItem, FindingSummary } from '@/lib/api/client'
import { cx } from '@/lib/format'
import { frameYear, isLongBaseline, LONG_BASELINE_FPS } from '@/lib/long-baseline'
import { useShare } from '@/lib/share'
import { AppAvatar } from './app-post-card'
import { ExamplePill, stateBody, useFindingTitle } from './finding-parts'
import { FindersLine, PostVotes, useAgo } from './talk'

export type CommunityItem = FindingSummary | AppPostItem
type ObjectRef = { id: string; name: string; avatar: string }

const FRAME_MS = 1000 / LONG_BASELINE_FPS

export const isAppItem = (i: CommunityItem): i is AppPostItem => 'type' in i && i.type === 'app'

export function hrefOf(i: CommunityItem): string {
  return isAppItem(i) ? `/community/post/${encodeURIComponent(i.id)}` : `/community/${encodeURIComponent(i.id)}`
}

export function splitHeadline(text: string): { title: string; body: string } {
  const m = /^([^]+?[.!?])\s+([^]+)$/.exec(text.trim())
  return m ? { title: m[1] as string, body: m[2] as string } : { title: text.trim(), body: '' }
}

const shortName = (name: string) => name.split(' (')[0] ?? name

function useInView<T extends Element>() {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setInView(!!e?.isIntersecting), { threshold: 0.5 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return { ref, inView }
}

function useCycle(n: number) {
  const { ref, inView } = useInView<HTMLButtonElement>()
  const [paused, setPaused] = useState(false)
  const [still, setStill] = useState(false)
  const [i, setI] = useState(0)
  useEffect(() => {
    setStill(matchMedia('(prefers-reduced-motion: reduce)').matches)
  }, [])
  const running = n > 1 && inView && !paused && !still
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => setI((v) => (v + 1) % n), FRAME_MS)
    return () => clearInterval(timer)
  }, [running, n])
  return { ref, i, playing: running, toggle: () => (still ? setI((v) => (v + 1) % n) : setPaused((p) => !p)), canPlay: n > 1 }
}

function MediaBox({ count, label, caption, mention, children }: { count: number; label: string; caption: string | null; mention: ReactNode; children: (i: number, playing: boolean) => ReactNode }) {
  const t = useTranslations('community.card')
  const cycle = useCycle(count)
  return (
    <div className="relative aspect-square w-full overflow-hidden bg-media-bg" data-testid="card-media">
      <button
        ref={cycle.ref}
        type="button"
        onClick={cycle.toggle}
        disabled={!cycle.canPlay}
        aria-label={cycle.canPlay ? `${label}. ${cycle.playing ? t('pause') : t('play')}` : label}
        aria-pressed={cycle.canPlay ? !cycle.playing : undefined}
        className="absolute inset-0 block size-full cursor-pointer disabled:cursor-default"
        data-frame={cycle.i}
      >
        {children(cycle.i, cycle.playing)}
      </button>
      {caption && (
        <Glass tone="media" className="pointer-events-none absolute right-3 top-3 rounded-full px-2.5 py-1 text-meta font-semibold" data-testid="media-caption">
          {caption}
        </Glass>
      )}
      {mention && <div className="absolute bottom-3 left-3 max-w-[calc(100%-1.5rem)]">{mention}</div>}
    </div>
  )
}

export function ObjectMention({ object, known }: { object: ObjectRef; known: boolean }) {
  const t = useTranslations('community.card')
  return (
    <Link href={`/o/${object.id}`} className={cx(glassClass('media'), 'flex h-10 min-w-0 items-center gap-2 rounded-full pl-1 pr-2.5')} aria-label={t('openProfile', { name: object.name })} data-testid="object-mention">
      <Image src={object.avatar} alt="" width={32} height={32} className="pixelated size-8 shrink-0 rounded-full bg-media-bg object-cover" unoptimized />
      <span className="min-w-0 truncate text-note font-semibold">{shortName(object.name)}</span>
      {known && <span className="shrink-0 text-meta opacity-80">{t('known')}</span>}
      <IconChevronRight size={16} className="shrink-0 opacity-80" />
    </Link>
  )
}

function MoreText({ text, open: openAtStart = false }: { text: string; open?: boolean }) {
  const t = useTranslations('community.card')
  const ref = useRef<HTMLParagraphElement>(null)
  const [open, setOpen] = useState(openAtStart)
  const [long, setLong] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || open) return
    const check = () => setLong(el.scrollHeight > el.clientHeight + 1)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [open, text])
  if (!text) return null
  return (
    <div className="px-4 pt-2.5">
      <p ref={ref} className={cx('text-body leading-snug', !open && 'line-clamp-2')}>
        {text}
      </p>
      {long && !open && (
        <button type="button" onClick={() => setOpen(true)} className="hit-44 text-note font-semibold text-text-secondary">
          {t('more')}
        </button>
      )}
    </div>
  )
}

function Dot() {
  return <span aria-hidden="true" className="inline-block size-[3px] shrink-0 rounded-full bg-current opacity-70" />
}

function CommentIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 4.5h12a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 16 14.5H9l-4 3v-3H4A1.5 1.5 0 0 1 2.5 13V6A1.5 1.5 0 0 1 4 4.5z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}

function ActionBar({ item, title, source }: { item: CommunityItem; title: string; source?: string }) {
  const t = useTranslations('community.talk')
  const tc = useTranslations('community.card')
  const share = useShare()
  const [info, setInfo] = useState(false)
  const href = hrefOf(item)
  const icon = 'hit-44 inline-flex h-9 items-center gap-1.5 rounded-full px-2 text-note font-semibold text-text-secondary active:bg-surface'
  return (
    <div className="flex items-center gap-1 px-2.5 pt-1.5" data-testid="card-actions">
      <PostVotes id={item.id} votes={item.thread.votes} mine={item.thread.my_vote} />
      <Link href={`${href}#talk-title`} className={icon} aria-label={t('comments', { n: item.thread.comments })} data-testid="card-comments">
        <CommentIcon />
        <span className="tabular-nums" aria-hidden="true">
          {item.thread.comments}
        </span>
      </Link>
      <span className="ml-auto flex items-center">
        {source && (
          <button type="button" onClick={() => setInfo(true)} aria-label={tc('source')} className={icon} data-testid="card-source">
            <IconInfo size={22} />
          </button>
        )}
        <button type="button" onClick={() => void share({ title, path: href })} aria-label={t('share')} className={icon}>
          <IconShare size={20} />
        </button>
      </span>
      {source && (
        <Sheet open={info} onClose={() => setInfo(false)} title={tc('source')}>
          <p className="px-4 pb-4 text-body leading-snug" data-testid="app-source">
            {source}
          </p>
        </Sheet>
      )}
    </div>
  )
}

function Shell({ id, kind, label, head, title, href, media, text, actions }: { id: string; kind: 'app' | 'finding'; label: string; head: ReactNode; title: string; href: string; media: ReactNode; text: ReactNode; actions: ReactNode }) {
  return (
    <article id={id} aria-label={label} className="scroll-mt-[calc(var(--height-topbar)+3.5rem)] border-b-[0.5px] border-divider bg-bg pb-3 pt-3" data-testid="community-card" data-kind={kind}>
      <div className="flex min-w-0 items-center gap-2 px-4">{head}</div>
      <Link href={href} className="block px-4 pb-2.5 pt-2">
        <h3 className="line-clamp-2 text-title-sm font-bold leading-snug [text-wrap:pretty]">{title}</h3>
      </Link>
      {media}
      {text}
      {actions}
    </article>
  )
}

function useCaption() {
  const t = useTranslations('community.card')
  const tp = useTranslations('post')
  return (post: AppPostItem['post']) => {
    const first = post.frames[0]
    const last = post.frames[post.frames.length - 1]
    if (isLongBaseline(post) && first && last) return t('years', { from: frameYear(first), to: frameYear(last) })
    if (!post.frames.length) return t('spectrum')
    return tp(`types.${post.type}`)
  }
}

export function AppCard({ item, full = false }: { item: AppPostItem; full?: boolean }) {
  const t = useTranslations('community')
  const locale = useLocale()
  const ago = useAgo()
  const caption = useCaption()
  const pt = locale.startsWith('pt')
  const { title, body } = splitHeadline(pt ? item.text.pt : item.text.en)
  const frames = item.post.frames.map((f) => f.src)
  const shots = frames.length ? frames : [item.post.cover]
  return (
    <Shell
      id={item.id}
      kind="app"
      label={`${item.account.name}: ${title}`}
      href={hrefOf(item)}
      title={title}
      head={
        <>
          <Link href={`/u/${item.account.handle}`} aria-label={item.account.name} className="shrink-0">
            <AppAvatar size={28} />
          </Link>
          <Link href={`/u/${item.account.handle}`} className="truncate text-account font-semibold">
            {item.account.name}
          </Link>
          <span title={t('appAccount')} aria-label={t('appAccount')} role="img" className="inline-flex shrink-0" data-testid="app-badge">
            <Image src="/icon.svg" alt="" width={14} height={14} className="size-3.5 rounded-[4px]" unoptimized />
          </span>
          <span className="flex shrink-0 items-center gap-1.5 text-meta text-text-secondary">
            <Dot />
            {ago(Date.parse(item.created_at))}
          </span>
        </>
      }
      media={
        <MediaBox count={shots.length} label={title} caption={caption(item.post)} mention={<ObjectMention object={item.object} known />}>
          {(i, playing) =>
            [i, ...(playing ? [(i + 1) % shots.length] : [])].map((k) => (
              <Image key={shots[k]} src={shots[k] as string} alt="" fill sizes="(max-width: 470px) 100vw, 470px" className={cx('object-contain', frames.length > 0 && 'pixelated', k === i ? 'opacity-100' : 'opacity-0')} priority={k === 0 && full} unoptimized />
            ))
          }
        </MediaBox>
      }
      text={<MoreText text={body} open={full} />}
      actions={<ActionBar item={item} title={title} source={pt ? item.source.pt : item.source.en} />}
    />
  )
}

export function FindingCard({ finding }: { finding: FindingSummary }) {
  const t = useTranslations('community')
  const ts = useTranslations('community.states')
  const ago = useAgo()
  const title = useFindingTitle()(finding)
  const cols = Math.max(1, finding.photo_cols)
  return (
    <Shell
      id={finding.id}
      kind="finding"
      label={title}
      href={hrefOf(finding)}
      title={title}
      head={
        <>
          <span className="story-ring inline-flex shrink-0 rounded-full p-[2px]">
            <UserAvatar nickname={finding.finder?.name ?? null} src={finding.finder?.avatar} size={26} className="ring-2 ring-bg" />
          </span>
          <span className="min-w-0">
            <FindersLine id={finding.id} finder={finding.finder} total={finding.finders} />
          </span>
          <span className="flex shrink-0 items-center gap-1.5 text-meta text-text-secondary">
            <Dot />
            {ago(finding.updated_at)}
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            {finding.example && <ExamplePill />}
            <span className="text-meta font-medium text-text-secondary" data-testid="state-pill">
              {t(`states.${finding.state}.label`)}
            </span>
          </span>
        </>
      }
      media={
        finding.photo ? (
          <MediaBox count={cols} label={t('photoAlt', { title })} caption={t('passes', { n: finding.passes })} mention={finding.object ? <ObjectMention object={finding.object} known={finding.state === 'known'} /> : null}>
            {(i) => (
              <span
                className="pixelated absolute inset-0 bg-no-repeat"
                style={{ backgroundImage: `url(${finding.photo})`, backgroundSize: cols > 1 ? `${cols * 100}% 200%` : 'contain', backgroundPosition: cols > 1 ? `${(i / (cols - 1)) * 100}% 0` : 'center' }}
                data-testid="finding-photo"
              />
            )}
          </MediaBox>
        ) : null
      }
      text={<MoreText text={stateBody(ts, finding)} />}
      actions={<ActionBar item={finding} title={title} />}
    />
  )
}

export function CommunityCard({ item }: { item: CommunityItem }) {
  return isAppItem(item) ? <AppCard item={item} /> : <FindingCard finding={item} />
}
