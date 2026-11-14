'use client'

import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { useState } from 'react'
import { PostMedia } from '@/components/feed/post-media'
import { IconCompare, IconFlask, IconLink, IconMore, IconTarget } from '@/components/icons'
import { ActionRow } from '@/components/post/action-row'
import { TagPanel } from '@/components/post/tag-panel'
import { IconButton, isSaturated, isVerified, ObjectAvatar, ObjectBadges, Sheet, SheetRow } from '@/components/ui/primitives'
import type { FeedItem } from '@/lib/api/client'
import { formatDate } from '@/lib/format'
import { useUi } from '@/lib/state/ui'
import { useShare } from '@/lib/share'

export function PostHeader({ item, onMore }: { item: Pick<FeedItem, 'object' | 'post'>; onMore: () => void }) {
  const t = useTranslations('post')
  const seen = useUi((s) => s.seenStories.includes(item.object.id))
  const openStory = useUi((s) => s.openStory)
  return (
    <div className="flex h-[54px] items-center gap-[6px] pl-[6px] pr-1">
      <button type="button" onClick={() => openStory(item.object.id)} aria-label={t('openStory', { name: item.object.name })} className="rounded-full">
        <ObjectAvatar src={item.object.avatar} alt="" size={40} ring={seen ? 'seen' : 'new'} />
      </button>
      <Link href={`/o/${item.object.id}`} className="min-w-0 flex-1">
        <span className="flex items-center gap-1">
          <span className="truncate text-account font-medium">{item.object.handle}</span>
          <ObjectBadges verified={isVerified(item.object.verdict)} saturated={isSaturated(item.object.saturation)} size={13} />
        </span>
        <span className="block truncate text-meta text-text-secondary">{item.object.official_target ? t('officialTarget') : t(`kinds.${item.object.kind}`)}</span>
      </Link>
      <IconButton label={t('menuLabel')} onClick={onMore}>
        <IconMore />
      </IconButton>
    </div>
  )
}

export function PostMoreSheet({ open, onClose, item }: { open: boolean; onClose: () => void; item: Pick<FeedItem, 'object' | 'post'> }) {
  const t = useTranslations('post.menu')
  const share = useShare()
  return (
    <Sheet open={open} onClose={onClose}>
      <div className="py-2">
        <SheetRow icon={<IconFlask size={26} />} label={t('lab')} hint={t('labHint')} href={`/lab/${item.object.id}`} onClick={onClose} />
        <SheetRow icon={<IconCompare size={26} />} label={t('compare')} href={`/p/${item.post.id}?compare=1`} onClick={onClose} />
        <SheetRow icon={<IconTarget size={26} />} label={t('mark')} href={`/p/${item.post.id}?mark=1`} onClick={onClose} />
        <SheetRow
          icon={<IconLink size={26} />}
          label={t('copyLink')}
          onClick={() => {
            share({ title: item.post.title, path: `/p/${item.post.id}` })
            onClose()
          }}
        />
        <SheetRow label={t('profile')} href={`/o/${item.object.id}`} onClick={onClose} />
      </div>
    </Sheet>
  )
}

export function PostCard({ item, priority = false }: { item: FeedItem; priority?: boolean }) {
  const locale = useLocale()
  const t = useTranslations('post')
  const [more, setMore] = useState(false)
  const [tagsOpen, setTagsOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const saved = useUi((s) => s.saved.includes(item.post.id))
  const toggleSaved = useUi((s) => s.toggleSaved)
  const total = item.tags.counts ? Object.values(item.tags.counts).reduce((a, b) => a + b, 0) : 0
  const { post, object } = item
  return (
    <article className="pb-4" aria-labelledby={`post-${post.id}`}>
      <PostHeader item={item} onMore={() => setMore(true)} />
      <Link href={`/p/${post.id}`} aria-label={t('open', { title: post.title })}>
        <PostMedia post={post} priority={priority} />
      </Link>
      <ActionRow
        tag={{ onClick: () => setTagsOpen(true) }}
        mark={{ href: `/p/${post.id}?mark=1` }}
        colours={{ href: `/p/${post.id}?colours=1` }}
        save={{ onClick: () => toggleSaved(post.id) }}
        saved={saved}
        tagCount={item.tags.counts ? total : null}
      />
      <div className="px-3">
        <p className="text-body">
          {item.tags.counts ? t('taggedBy', { total }) : <button type="button" onClick={() => setTagsOpen(true)} className="text-text-secondary">{t('tagPrompt')}</button>}
        </p>
        <p id={`post-${post.id}`} className={expanded ? 'mt-1 text-body' : 'mt-1 line-clamp-2 text-body'}>
          <Link href={`/o/${object.id}`} className="font-semibold">
            {object.handle}
          </Link>{' '}
          <span className="font-semibold">{post.title}.</span> {post.caption}
        </p>
        {!expanded && post.caption.length > 70 && (
          <button type="button" className="text-body text-text-muted" onClick={() => setExpanded(true)}>
            {t('more')}
          </button>
        )}
        <p className="mt-1 text-meta text-text-muted">
          <time dateTime={post.date_range[1]}>{formatDate(post.date_range[1] ?? post.date_range[0] ?? '', locale)}</time>
          {post.frames[0] && ` · ${[...new Set(post.frames.flatMap((f) => f.release.split('+')).map((r) => r.trim().toUpperCase()))].join(' + ')}`}
        </p>
      </div>
      <PostMoreSheet open={more} onClose={() => setMore(false)} item={item} />
      <SheetTags open={tagsOpen} onClose={() => setTagsOpen(false)} item={item} />
    </article>
  )
}

function SheetTags({ open, onClose, item }: { open: boolean; onClose: () => void; item: FeedItem }) {
  const t = useTranslations('tags')
  return (
    <Sheet open={open} onClose={onClose} title={t('title')}>
      <div className="px-4 py-4">
        <p className="mb-3 text-note text-text-secondary">{t('explain')}</p>
        <TagPanel postId={item.post.id} tags={item.tags} />
      </div>
    </Sheet>
  )
}
