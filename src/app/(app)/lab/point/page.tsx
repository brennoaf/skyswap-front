'use client'

import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Suspense } from 'react'
import { LabView } from '@/components/lab/lab-view'
import { EmptyState, Skeleton, TopBar } from '@/components/ui/primitives'
import { BANDS } from '@/lib/format'

function PointLab() {
  const t = useTranslations('lab')
  const sp = useSearchParams()
  const ra = Number(sp.get('ra'))
  const dec = Number(sp.get('dec'))
  const b = sp.get('band')
  const ok = sp.get('ra') !== null && sp.get('dec') !== null && Number.isFinite(ra) && Number.isFinite(dec) && ra >= 0 && ra < 360 && dec >= -90 && dec <= 90
  if (!ok)
    return (
      <main>
        <TopBar title={t('title')} />
        <EmptyState title={t('coord.invalid')} />
      </main>
    )
  const band = b && (BANDS as readonly string[]).includes(b) ? b : null
  return <LabView key={`${ra}|${dec}`} id={`point-${ra.toFixed(4)}${dec < 0 ? '' : '+'}${dec.toFixed(4)}`} point={{ ra, dec, band }} />
}

export default function PointLabPage() {
  return (
    <Suspense fallback={<Skeleton className="m-4 h-64" />}>
      <PointLab />
    </Suspense>
  )
}
