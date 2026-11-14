'use client'

import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Suspense } from 'react'
import { parseSkyParams, SkyViewer } from '@/components/sky/sky-viewer'
import { EmptyState, Skeleton } from '@/components/ui/primitives'
import { formatDec, formatRa } from '@/lib/format'

function EmbedScreen() {
  const t = useTranslations('sky')
  const sp = useSearchParams()
  const params = parseSkyParams(new URLSearchParams(sp.toString()))
  if (!params) return <EmptyState title={t('embedTitle')} body={t('invalid')} />
  return (
    <main>
      <h1 className="truncate px-3 pb-1.5 pt-2 text-[14px] font-semibold">
        {params.name ?? `${formatRa(params.ra)} ${formatDec(params.dec)}`}
        {params.name && (
          <span className="ml-1.5 font-normal text-text-secondary">
            {formatRa(params.ra)} {formatDec(params.dec)}
          </span>
        )}
      </h1>
      <SkyViewer params={params} compact />
    </main>
  )
}

export default function EmbedPage() {
  return (
    <Suspense fallback={<Skeleton className="aspect-square w-full rounded-none" />}>
      <EmbedScreen />
    </Suspense>
  )
}
