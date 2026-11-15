'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Suspense, useCallback, useState } from 'react'
import { skyHref } from '@/components/feed/spot-sheet'
import { IconCopy, IconDirect, IconSpectrum } from '@/components/icons'
import { SkyShareSheet } from '@/components/sky/sky-share-sheet'
import { SkySpectrumSheet } from '@/components/sky/sky-spectrum-sheet'
import { parseSkyParams, SkyViewer, type SkyParams } from '@/components/sky/sky-viewer'
import { EmptyState, IconButton, ObjectAvatar, Skeleton, TopBar } from '@/components/ui/primitives'
import { useObject } from '@/lib/api/hooks'
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
  const [colours, setColours] = useState(false)
  const { data: object } = useObject(params?.obj ?? '')

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

  const name = params.name ?? object?.name ?? t('title')
  const profile = object ? `/o/${object.id}` : null

  return (
    <main>
      <SkyViewer
        params={params}
        onChange={onChange}
        header={(onBack) => (
          <TopBar
            onBack={onBack}
            title={
              <span className="flex min-w-0 items-center gap-2">
                {object && profile && (
                  <Link href={profile} tabIndex={-1} aria-hidden="true" className="shrink-0">
                    <ObjectAvatar src={object.avatar} alt="" size={28} />
                  </Link>
                )}
                <span className="block min-w-0 flex-1 leading-tight">
                  {profile ? (
                    <Link href={profile} className="block truncate" data-testid="sky-profile">
                      {name}
                    </Link>
                  ) : (
                    <span className="block truncate">{name}</span>
                  )}
                  <button type="button" onClick={() => void copy()} aria-label={tm('copy')} className="-my-1 flex max-w-full items-center gap-1.5 py-1 font-sans text-meta font-normal tabular-nums text-text-secondary" data-testid="sky-position">
                    <span className="truncate">
                      {formatRa(params.ra)} {formatDec(params.dec)}
                    </span>
                    <IconCopy size={14} className="shrink-0" />
                  </button>
                </span>
              </span>
            }
            actions={
              <>
                <IconButton label={t('spectrum.title')} onClick={() => setColours(true)} data-testid="sky-spectrum-open">
                  <IconSpectrum />
                </IconButton>
                <IconButton label={t('share')} onClick={() => setShare(true)}>
                  <IconDirect />
                </IconButton>
              </>
            }
          />
        )}
      />
      <SkyShareSheet open={share} onClose={() => setShare(false)} params={params} />
      <SkySpectrumSheet open={colours} onClose={() => setColours(false)} params={params} />
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
