'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Button, EmptyState } from '@/components/ui/primitives'

export function ErrorScreen({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('errors')
  const tc = useTranslations('common')
  return (
    <main className="pt-16" role="alert">
      <EmptyState
        title={t('title')}
        body={t('body')}
        action={
          <div className="flex flex-col items-center gap-1">
            <Button variant="primary" className="h-11 px-6 font-semibold" onClick={reset}>
              {tc('retry')}
            </Button>
            <Link href="/" className="inline-flex min-h-11 items-center px-3 text-ui font-semibold text-link">
              {tc('goHome')}
            </Link>
          </div>
        }
      />
    </main>
  )
}
