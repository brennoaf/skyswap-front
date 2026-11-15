'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useEffect, useState, type ReactNode } from 'react'
import { Button, EmptyState, Skeleton } from '@/components/ui/primitives'
import { SwapHeader, SwapShell } from '../shell'

export function DeckSkeleton({ onHelp, line, notice }: { onHelp: () => void; line?: string; notice?: ReactNode }) {
  return (
    <SwapShell>
      <div className="h-[22px] shrink-0" />
      <SwapHeader onHelp={onHelp} />
      <div className="flex shrink-0 justify-center pb-1.5" aria-hidden="true">
        <Skeleton className="rounded-[20px]" style={{ width: 'var(--swap-photo)', height: 'var(--swap-photo)' }} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col" aria-live="polite">
        {notice}
        {line && <p className="my-auto px-6 text-center text-[15px] text-text-secondary">{line}</p>}
      </div>
    </SwapShell>
  )
}

export function PauseCard({ looks, onContinue }: { looks: number; onContinue: () => void }) {
  const t = useTranslations('classify.rest')
  return (
    <section aria-labelledby="pause-title" className="rounded-2xl border-[0.5px] border-divider bg-bg-elevated px-5 py-6 text-center">
      <h2 id="pause-title" className="font-[family-name:var(--font-display)] text-title-md font-bold">
        {t('title', { n: looks })}
      </h2>
      <p className="mx-auto mt-2 max-w-80 text-body leading-snug text-text-secondary">{t('body')}</p>
      <div className="mt-5 flex flex-col gap-2">
        <Button variant="primary" full className="h-11" onClick={onContinue}>
          {t('continue')}
        </Button>
        <Link href="/me#explored" className="inline-flex h-11 items-center justify-center rounded-[var(--radius-button)] text-ui font-semibold text-link">
          {t('map')}
        </Link>
      </div>
    </section>
  )
}

function useOnline() {
  const [online, setOnline] = useState(true)
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine)
    sync()
    window.addEventListener('online', sync)
    window.addEventListener('offline', sync)
    return () => {
      window.removeEventListener('online', sync)
      window.removeEventListener('offline', sync)
    }
  }, [])
  return online
}

export function StateScreen({ kind, busy = false, onRetry, onHelp }: { kind: 'failed' | 'slow'; busy?: boolean; onRetry: () => void; onHelp: () => void }) {
  const t = useTranslations('classify')
  const online = useOnline()
  const offline = kind === 'failed' && !online
  return (
    <SwapShell>
      <SwapHeader onHelp={onHelp} />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto" data-testid="swap-state" data-kind={offline ? 'offline' : kind}>
        <EmptyState
          title={t(offline ? 'state.offline' : `state.${kind}`)}
          action={
            <Button variant="primary" disabled={busy} aria-busy={busy} onClick={onRetry}>
              {t('retry')}
            </Button>
          }
        />
      </div>
    </SwapShell>
  )
}
