'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Suspense, useCallback, useState } from 'react'
import { skyHref } from '@/components/feed/spot-sheet'
import { IconCopy, IconDirect } from '@/components/icons'
import { SkyShareSheet } from '@/components/sky/sky-share-sheet'
import { parseSkyParams, SkyViewer, type SkyParams } from '@/components/sky/sky-viewer'
import { EmptyState, IconButton, Skeleton, TopBar } from '@/components/ui/primitives'
import { formatDec, formatRa } from '@/lib/format'
import { useUi } from '@/lib/state/ui'

function SkyScreen() {
  const t = useTranslations('sky')
  const tm = useTranslations('sky.map')
  const toast = useUi((s) => s.toast)
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

  const copy = async () => {
    const done = await navigator.clipboard?.writeText(`${params.ra.toFixed(5)} ${params.dec.toFixed(5)}`).then(
      () => true,
      () => false,
    )
    toast({ kind: 'info', key: done ? 'sky.map.copied' : 'sky.map.copyFailed' })
  }

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
                <span className="block truncate">{params.name ?? t('title')}</span>
                <button type="button" onClick={() => void copy()} aria-label={tm('copy')} className="-my-1 flex max-w-full items-center gap-1.5 py-1 font-sans text-meta font-normal tabular-nums text-text-secondary" data-testid="sky-position">
                  <span className="truncate">
                    {formatRa(params.ra)} {formatDec(params.dec)}
                  </span>
                  <IconCopy size={14} className="shrink-0" />
                </button>
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
