import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { EmptyState } from '@/components/ui/primitives'

export default async function NotFound() {
  const t = await getTranslations('common')
  return (
    <main className="pt-16">
      <EmptyState
        title={t('notFound')}
        body={t('notFoundBody')}
        action={
          <Link href="/" className="inline-flex h-9 items-center rounded-[var(--radius-button)] bg-accent px-4 text-ui font-medium text-on-accent">
            {t('goHome')}
          </Link>
        }
      />
    </main>
  )
}
