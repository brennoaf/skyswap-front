'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { IconShare } from '@/components/icons'
import { UserAvatar } from '@/components/ui/user-avatar'
import type { AppPostItem, FindingSummary } from '@/lib/api/client'
import { cx } from '@/lib/format'
import { useShare } from '@/lib/share'
import { AppAvatar, AppBadge } from './app-post-card'
import { ExamplePill, FindingPhoto, ObjectLink, stateBody, StatePill, useFindingTitle } from './finding-parts'
import { FindersLine, PostVotes, useAgo } from './talk'

export type CommunityItem = FindingSummary | AppPostItem

export const isAppItem = (i: CommunityItem): i is AppPostItem => 'type' in i && i.type === 'app'

export function hrefOf(i: CommunityItem): string {
  return isAppItem(i) ? `/community/post/${encodeURIComponent(i.id)}` : `/community/${encodeURIComponent(i.id)}`
}

export function splitHeadline(text: string): { title: string; body: string } {
  const m = /^([^]+?[.!?])\s+([^]+)$/.exec(text.trim())
  return m ? { title: m[1] as string, body: m[2] as string } : { title: text.trim(), body: '' }
}

function CommentIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 4.5h12a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 16 14.5H9l-4 3v-3H4A1.5 1.5 0 0 1 2.5 13V6A1.5 1.5 0 0 1 4 4.5z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}

function ActionBar({ item, title }: { item: CommunityItem; title: string }) {
  const t = useTranslations('community.talk')
  const share = useShare()
  const href = hrefOf(item)
  return (
    <div className="flex items-center gap-2 pt-2" data-testid="card-actions">
      <PostVotes id={item.id} votes={item.thread.votes} mine={item.thread.my_vote} />
      <Link href={`${href}#talk-title`} className="hit-44 inline-flex h-9 items-center gap-1.5 rounded-full bg-surface px-3 text-note font-semibold text-text-secondary active:bg-surface-pressed" data-testid="card-comments">
        <CommentIcon />
        <span className="tabular-nums">{item.thread.comments}</span>
        <span className="sr-only">{t('comments', { n: item.thread.comments })}</span>
      </Link>
      <button type="button" onClick={() => void share({ title, path: href })} className="hit-44 ml-auto inline-flex h-9 items-center gap-1.5 rounded-full bg-surface px-3 text-note font-semibold text-text-secondary active:bg-surface-pressed">
        <IconShare size={18} />
        {t('share')}
      </button>
    </div>
  )
}

function Shell({ id, kind, label, head, title, body, media, after, actions, href, full }: { id: string; kind: 'app' | 'finding'; label: string; head: ReactNode; title: string; body: ReactNode; media: ReactNode; after?: ReactNode; actions: ReactNode; href: string; full: boolean }) {
  const inner = (
    <>
      <h3 className="pt-2 text-title-sm font-bold leading-snug [text-wrap:pretty]">{title}</h3>
      {body}
      {media && <div className="mt-2.5 overflow-hidden rounded-2xl bg-media-bg">{media}</div>}
    </>
  )
  return (
    <article id={id} aria-label={label} className={cx('scroll-mt-[var(--height-topbar)] bg-bg px-4 py-3', !full && 'border-b-[0.5px] border-divider')} data-testid="community-card" data-kind={kind}>
      {head}
      {full ? inner : (
        <Link href={href} className="block rounded-xl outline-offset-2">
          {inner}
        </Link>
      )}
      {after}
      {actions}
    </article>
  )
}

function Head({ avatar, who, ago, pills }: { avatar: ReactNode; who: ReactNode; ago: string; pills: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      {avatar}
      <div className="min-w-0 flex-1 leading-tight">
        <div className="flex min-w-0 items-center gap-1.5">{who}</div>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-meta text-text-secondary">
          <span className="shrink-0">{ago}</span>
          {pills}
        </div>
      </div>
    </div>
  )
}

export function AppCard({ item, full = false, media }: { item: AppPostItem; full?: boolean; media?: ReactNode }) {
  const locale = useLocale()
  const ago = useAgo()
  const pt = locale.startsWith('pt')
  const { title, body } = splitHeadline(pt ? item.text.pt : item.text.en)
  return (
    <Shell
      id={item.id}
      kind="app"
      label={`${item.account.name}: ${title}`}
      href={hrefOf(item)}
      full={full}
      title={title}
      head={
        <Head
          avatar={
            <Link href={`/u/${item.account.handle}`} aria-label={item.account.name}>
              <AppAvatar size={36} />
            </Link>
          }
          who={
            <>
              <Link href={`/u/${item.account.handle}`} className="truncate text-account font-semibold">
                {item.account.name}
              </Link>
              <AppBadge className="h-5 px-1.5 text-micro" />
            </>
          }
          ago={ago(Date.parse(item.created_at))}
          pills={<StatePill state="known" reason={item.object.name} />}
        />
      }
      body={
        <div className="space-y-1.5 pt-1">
          {body && <p className={cx('text-body leading-snug text-text', !full && 'line-clamp-3')}>{body}</p>}
          <p className="text-meta leading-snug text-text-secondary" data-testid="app-source">
            {pt ? item.source.pt : item.source.en}
          </p>
        </div>
      }
      media={media ?? (item.post.cover ? <Image src={item.post.cover} alt="" width={470} height={470} className="pixelated aspect-square w-full object-contain" unoptimized /> : null)}
      after={<ObjectLink objectId={item.object.id} name={item.object.name} />}
      actions={<ActionBar item={item} title={title} />}
    />
  )
}

export function FindingCard({ finding }: { finding: FindingSummary }) {
  const t = useTranslations('community')
  const ts = useTranslations('community.states')
  const ago = useAgo()
  const title = useFindingTitle()(finding)
  return (
    <Shell
      id={finding.id}
      kind="finding"
      label={title}
      href={hrefOf(finding)}
      full={false}
      title={title}
      head={
        <Head
          avatar={<span className="story-ring inline-flex shrink-0 rounded-full p-[2px]"><UserAvatar nickname={finding.finder?.name ?? null} src={finding.finder?.avatar} size={32} className="ring-2 ring-bg" /></span>}
          who={<FindersLine id={finding.id} finder={finding.finder} total={finding.finders} />}
          ago={ago(finding.updated_at)}
          pills={
            <>
              <StatePill state={finding.state} reason={finding.reason} />
              {finding.example && <ExamplePill />}
            </>
          }
        />
      }
      body={<p className="line-clamp-2 pt-1 text-body leading-snug text-text-secondary">{stateBody(ts, finding)}</p>}
      media={<FindingPhoto finding={{ ...finding, mark: null }} alt={t('photoAlt', { title })} />}
      after={<ObjectLink objectId={finding.object_id} name={finding.reason} />}
      actions={<ActionBar item={finding} title={title} />}
    />
  )
}

export function CommunityCard({ item }: { item: CommunityItem }) {
  return isAppItem(item) ? <AppCard item={item} /> : <FindingCard finding={item} />
}
