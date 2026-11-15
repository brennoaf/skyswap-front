'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { IconChevronRight, IconFlask } from '@/components/icons'
import { Button, EmptyState, ObjectAvatar, Skeleton, TopBar } from '@/components/ui/primitives'
import { useObjects } from '@/lib/api/hooks'

export default function LabPickerPage() {
  const t = useTranslations('lab')
  const tp = useTranslations('post')
  const th = useTranslations('home')
  const objects = useObjects()
  return (
    <main className="pb-6">
      <TopBar title={t('title')} />
      <h2 className="px-4 pt-1 text-ui font-semibold">{t('picker.title')}</h2>
      <p className="flex items-center gap-2 px-4 pb-2 pt-0.5 text-note leading-snug text-text-secondary">
        <IconFlask size={18} className="shrink-0" />
        {t('picker.intro')}
      </p>
      {objects.isLoading && (
        <div aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2">
              <Skeleton className="size-11 rounded-full" />
              <Skeleton className="h-3 w-40" />
            </div>
          ))}
        </div>
      )}
      {objects.isError && <EmptyState title={th('errorTitle')} body={th('errorBody')} action={<Button onClick={() => objects.refetch()}>{th('retry')}</Button>} />}
      <ul>
        {objects.data?.map((o) => {
          const kindKey = `kinds.${o.kind}`
          return (
            <li key={o.id}>
              <Link href={`/lab/${o.id}`} className="flex min-h-[60px] items-center gap-3 px-4 py-2 active:bg-surface">
                <ObjectAvatar src={o.avatar} alt="" size={44} />
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-body font-semibold">{o.name}</span>
                  <span className="block truncate text-body text-text-secondary">{tp.has(kindKey) ? tp(kindKey) : o.kind}</span>
                </span>
                <IconChevronRight size={20} className="shrink-0 text-text-secondary" />
              </Link>
            </li>
          )
        })}
      </ul>
    </main>
  )
}
