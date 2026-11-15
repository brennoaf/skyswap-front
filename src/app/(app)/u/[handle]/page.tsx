'use client'

import Image from 'next/image'
import { useParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { AppAvatar, AppBadge } from '@/components/community/app-post-card'
import { AppCard } from '@/components/community/community-card'
import { IconChart } from '@/components/icons'
import { EmptyState, Skeleton, TopBar } from '@/components/ui/primitives'
import type { AppPostItem } from '@/lib/api/client'
import { useAccount } from '@/lib/api/hooks'

function Tile({ item }: { item: AppPostItem }) {
  const frame = item.post.frames[0]
  return (
    <a href={`#${item.id}`} className="relative block aspect-square overflow-hidden bg-media-bg" aria-label={item.object.name}>
      {frame ? (
        <Image src={frame.src} alt="" fill sizes="160px" className="pixelated object-contain" unoptimized />
      ) : (
        <span className="flex size-full flex-col items-center justify-center gap-1 px-2 text-center text-on-media">
          <IconChart size={28} />
          <span className="line-clamp-2 text-micro font-medium">{item.object.name}</span>
        </span>
      )}
    </a>
  )
}

export default function AccountPage() {
  const { handle } = useParams<{ handle: string }>()
  const t = useTranslations('community.account')
  const locale = useLocale()
  const q = useAccount(handle)
  if (q.isError) return <EmptyState title={t('notFound')} />
  const page = q.data
  return (
    <main className="pb-6">
      <TopBar title={page?.account.name ?? handle} />
      {!page ? (
        <div className="space-y-3 p-4" aria-hidden="true">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <>
          <section className="flex items-start gap-4 px-4 pb-3 pt-2" data-testid="account-header">
            <AppAvatar size={80} />
            <div className="min-w-0 flex-1 pt-1">
              <h2 className="truncate text-title-md font-bold leading-tight">{page.account.name}</h2>
              <p className="truncate text-note text-text-secondary">@{page.account.handle}</p>
              <AppBadge className="mt-1.5" />
            </div>
          </section>
          <p className="px-4 pb-3 text-body leading-snug">{locale.startsWith('pt') ? page.account.bio.pt : page.account.bio.en}</p>
          <div role="list" aria-label={t('posts', { name: page.account.name })} className="grid grid-cols-3 gap-0.5 border-y-[0.5px] border-divider">
            {page.posts.map((p) => (
              <div role="listitem" key={p.id}>
                <Tile item={p} />
              </div>
            ))}
          </div>
          <div>
            {page.posts.map((p) => (
              <AppCard key={p.id} item={p} />
            ))}
          </div>
        </>
      )}
    </main>
  )
}
