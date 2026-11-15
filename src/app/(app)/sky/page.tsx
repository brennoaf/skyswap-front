'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Suspense, useCallback, useState } from 'react'
import { skyHref } from '@/components/feed/spot-sheet'
import { IconDirect } from '@/components/icons'
import { SkyShareSheet } from '@/components/sky/sky-share-sheet'
import { parseSkyParams, SkyViewer, skyTitle, type SkyParams } from '@/components/sky/sky-viewer'
import { EmptyState, IconButton, Skeleton, TopBar } from '@/components/ui/primitives'
import { formatDec, formatRa } from '@/lib/format'

function SkyScreen() {
  const t = useTranslations('sky')
  const sp = useSearchParams()
  const router = useRouter()
  const params = parseSkyParams(new URLSearchParams(sp.toString()))
  const [share, setShare] = useState(false)

  const onChange = useCallback(
    (next: Partial<SkyParams>) => {
      if (!params) return
      router.replace(skyHref({ ...params, ...next }), { scroll: false })
    },
    [params, router],
  )

  if (!params)
    return (
      <main>
        <TopBar title={t('title')} />
        <EmptyState
          title={t('title')}
          body={t('invalid')}
          action={
            <Link href="/search" className="inline-flex h-11 items-center rounded-[var(--radius-button)] bg-accent px-5 text-ui font-semibold text-on-accent">
              {t('goSearch')}
            </Link>
          }
        />
      </main>
    )

  return (
    <main>
      <SkyViewer
        params={params}
        onChange={onChange}
        header={(onBack) => (
          <TopBar
            onBack={onBack}
            title={
              <span className="block leading-tight">
                <span className="block truncate">{skyTitle(params)}</span>
                <span className="block truncate font-sans text-meta font-normal tabular-nums text-text-secondary">{t('coordinates', { ra: formatRa(params.ra), dec: formatDec(params.dec) })}</span>
              </span>
            }
            actions={
              <IconButton label={t('share')} onClick={() => setShare(true)}>
                <IconDirect />
              </IconButton>
            }
          />
        )}
      />
      <SkyShareSheet open={share} onClose={() => setShare(false)} params={params} />
    </main>
  )
}

export default function SkyPage() {
  return (
    <Suspense fallback={<Skeleton className="aspect-square w-full rounded-none" />}>
      <SkyScreen />
    </Suspense>
  )
}
