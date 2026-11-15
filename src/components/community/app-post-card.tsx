'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { PostMedia } from '@/components/feed/post-media'
import type { AppPostItem } from '@/lib/api/client'
import { cx } from '@/lib/format'
import { InterestingAction, SocialFacts } from './finding-actions'
import { ObjectLink, StatePill } from './finding-parts'

export function AppAvatar({ size = 40 }: { size?: number }) {
  return (
    <span className="inline-flex shrink-0 overflow-hidden rounded-full ring-1 ring-divider" style={{ width: size, height: size }}>
      <Image src="/icon.svg" alt="" width={size} height={size} className="size-full" unoptimized />
    </span>
  )
}

export function AppBadge({ className }: { className?: string }) {
  const t = useTranslations('community')
  return (
    <span className={cx('inline-flex h-6 items-center gap-1 rounded-full bg-surface px-2 text-meta font-semibold text-text-secondary', className)} data-testid="app-badge">
      <Image src="/icon.svg" alt="" width={12} height={12} className="size-3 rounded-[3px]" unoptimized />
      {t('appAccount')}
    </span>
  )
}

export function AppPostCard({ item }: { item: AppPostItem }) {
  const locale = useLocale()
  const pt = locale.startsWith('pt')
  return (
    <article id={item.id} className="scroll-mt-[var(--height-topbar)] pb-4" aria-label={`${item.account.name}: ${item.object.name}`} data-testid="app-post">
      <Link href={`/u/${item.account.handle}`} className="flex min-h-[54px] items-center gap-2 px-3 py-1.5">
        <AppAvatar />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-account font-medium">{item.account.name}</span>
          <span className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
            <AppBadge />
            <StatePill state="known" reason={item.object.name} />
          </span>
        </span>
      </Link>
      <Link href={`/p/${item.post.id}`} className="block">
        <PostMedia post={item.post} />
      </Link>
      <InterestingAction id={item.id} social={item.social} />
      <div className="space-y-1 px-3 pt-2">
        <p className="text-body leading-snug">{pt ? item.text.pt : item.text.en}</p>
        <SocialFacts social={item.social} />
        <p className="text-note leading-snug text-text-secondary" data-testid="app-source">
          {pt ? item.source.pt : item.source.en}
        </p>
      </div>
      <div className="px-3">
        <ObjectLink objectId={item.object.id} name={item.object.name} />
      </div>
    </article>
  )
}
