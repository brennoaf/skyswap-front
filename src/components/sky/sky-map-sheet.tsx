'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import { skyHref } from '@/components/feed/spot-sheet'
import { IconCopy, IconMap, IconPlay } from '@/components/icons'
import { SkyLocator } from '@/components/sky/sky-locator'
import { Button, IconButton, Sheet, Skeleton } from '@/components/ui/primitives'
import { formatDec, formatRa } from '@/lib/format'
import { useUi } from '@/lib/state/ui'

type Status = 'idle' | 'checking' | 'loading' | 'ready' | 'failed'

const PROBE_MS = 10_000

export function SkyMapSheet({ open, onClose, object }: { open: boolean; onClose: () => void; object: { id: string; name: string; ra: number; dec: number } }) {
  const t = useTranslations('sky.map')
  const tp = useTranslations('profile')
  const tc = useTranslations('common')
  const toast = useUi((s) => s.toast)
  const [status, setStatus] = useState<Status>('idle')
  const run = useRef(0)
  const { ra, dec, name, id } = object
  const url = `https://aladin.cds.unistra.fr/AladinLite/?target=${encodeURIComponent(`${ra} ${dec}`)}&fov=0.25&survey=CDS%2FP%2FDSS2%2Fcolor`
  const coords = `${formatRa(ra)} ${formatDec(dec)}`
  const region = dec > 10 ? 'regionNorth' : dec < -10 ? 'regionSouth' : 'regionEquator'

  useEffect(() => {
    if (open) return
    run.current += 1
    setStatus('idle')
  }, [open])

  const explore = async () => {
    const mine = ++run.current
    setStatus('checking')
    const reachable = await fetch(url, { mode: 'no-cors', cache: 'no-store', signal: AbortSignal.timeout(PROBE_MS) }).then(
      () => true,
      () => false,
    )
    if (mine === run.current) setStatus(reachable ? 'loading' : 'failed')
  }

  const copy = async () => {
    const done = await navigator.clipboard?.writeText(`${ra.toFixed(5)} ${dec.toFixed(5)}`).then(
      () => true,
      () => false,
    )
    toast({ kind: 'info', key: done ? 'sky.map.copied' : 'sky.map.copyFailed' })
  }

  return (
    <Sheet open={open} onClose={onClose} title={tp('skyMapTitle')}>
      <div className="space-y-3 px-4 py-3">
        <SkyLocator ra={ra} dec={dec} name={name} />
        <div className="flex items-center gap-2 rounded-xl bg-surface py-1 pl-3 pr-1">
          <div className="min-w-0 flex-1 leading-tight">
            <p className="text-body font-medium">{t(region)}</p>
            <p className="truncate text-meta tabular-nums text-text-secondary">{coords}</p>
          </div>
          <IconButton label={t('copy')} onClick={() => void copy()}>
            <IconCopy size={22} />
          </IconButton>
        </div>
        <Link href={skyHref({ ra, dec, name, obj: id })} onClick={onClose} className="flex h-11 items-center justify-center gap-1.5 rounded-[var(--radius-button)] bg-accent text-ui font-semibold text-on-accent active:bg-accent-pressed">
          <IconPlay size={20} />
          {t('watch')}
        </Link>

        {status === 'idle' && (
          <button type="button" onClick={() => void explore()} className="flex min-h-14 w-full items-center gap-3 rounded-xl bg-surface px-3 py-2 text-left active:bg-surface-pressed">
            <IconMap size={24} className="shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block text-body font-medium">{t('explore')}</span>
              <span className="block text-meta leading-snug text-text-secondary">{t('exploreHint')}</span>
            </span>
          </button>
        )}

        {status === 'failed' && (
          <div className="rounded-xl bg-surface p-3" role="alert">
            <p className="text-body font-medium">{t('failedTitle')}</p>
            <p className="mt-0.5 text-note leading-snug text-text-secondary">{t('failedBody')}</p>
            <div className="mt-3 flex gap-2">
              <Button variant="ghost" className="h-10 flex-1 bg-bg" onClick={() => void explore()}>
                {tc('retry')}
              </Button>
              <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 flex-1 items-center justify-center rounded-[var(--radius-button)] bg-bg text-ui font-medium">
                {t('openExternal')}
              </a>
            </div>
          </div>
        )}

        {(status === 'checking' || status === 'loading' || status === 'ready') && (
          <div>
            <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-media-bg">
              {(status === 'loading' || status === 'ready') && <iframe title={tp('skyMapTitle')} className="absolute inset-0 size-full" src={url} onLoad={() => setStatus('ready')} />}
              {status !== 'ready' && (
                <div className="absolute inset-0" role="status">
                  <Skeleton className="size-full rounded-none" />
                  <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 px-6 text-center text-note text-text">{t(status === 'checking' ? 'checking' : 'loading')}</p>
                </div>
              )}
            </div>
            <p className="mt-2 text-meta text-text-secondary">{tp('skyMapCredit')}</p>
            <a href={url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex min-h-11 items-center text-note font-medium text-link">
              {t('openExternal')}
            </a>
          </div>
        )}
      </div>
    </Sheet>
  )
}
