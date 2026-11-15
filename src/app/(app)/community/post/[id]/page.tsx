'use client'

import Link from 'next/link'
import { use } from 'react'
import { useTranslations } from 'next-intl'
import { AppCard } from '@/components/community/community-card'
import { Discussion } from '@/components/community/talk'
import { EmptyState, Skeleton, TopBar } from '@/components/ui/primitives'
import { useAppPost } from '@/lib/api/hooks'

export default function AppPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const t = useTranslations('community')
  const post = useAppPost(decodeURIComponent(id))
  if (post.isLoading)
    return (
      <main>
        <TopBar title={t('postTitle')} />
        <Skeleton className="aspect-square w-full rounded-none" />
      </main>
    )
  const item = post.data
  if (!item)
    return (
      <main>
        <TopBar title={t('postTitle')} />
        <EmptyState title={t('notFound')} action={<Link href="/community" className="text-link">{t('backToCommunity')}</Link>} />
      </main>
    )
  return (
    <main className="pb-10">
      <TopBar title={item.account.name} />
      <AppCard item={item} full />
      <div className="border-t-[0.5px] border-divider">
        <Discussion id={item.id} />
      </div>
    </main>
  )
}
