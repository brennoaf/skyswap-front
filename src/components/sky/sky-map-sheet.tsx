'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import { skyHref } from '@/components/feed/spot-sheet'
import { IconCheck, IconCopy, IconMap, IconPlay } from '@/components/icons'
import { SkyLocator } from '@/components/sky/sky-locator'
import { Button, IconButton, Sheet, Skeleton } from '@/components/ui/primitives'
import { formatDec, formatRa } from '@/lib/format'
import { useUi } from '@/lib/state/ui'

type Status = 'idle' | 'loading' | 'ready' | 'failed'
type AladinMap = { destroy?: () => void; increaseZoom: () => void; decreaseZoom: () => void }
type AladinLib = { init: Promise<void>; aladin: (el: HTMLElement, options: Record<string, unknown>) => AladinMap }

const LOAD_MS = 15_000
const COPIED_MS = 2500
const ALADIN_URL = 'https://cdn.jsdelivr.net/npm/aladin-lite@3.6.5/dist/aladin.js'
const SURVEY_URL = 'https://skies.esac.esa.int/DSSColor/'
const CONTROLS_OFF = {
  showLayersControl: false,
  showFullscreenControl: false,
  showGotoControl: false,
  showShareControl: false,
  showSettingsControl: false,
  showSimbadPointerControl: false,
  showCooGrid: false,
  showProjectionControl: false,
  showCooLocation: false,
  showFrame: false,
  showContextMenu: false,
  showZoomControl: false,
  showFov: false,
}

function withTimeout<T>(work: Promise<T>): Promise<T> {
  return Promise.race([work, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), LOAD_MS))])
}

export function SkyMapSheet({ open, onClose, object, watch = true }: { open: boolean; onClose: () => void; object: { id: string; name: string; ra: number; dec: number }; watch?: boolean }) {
  const t = useTranslations('sky.map')
  const tp = useTranslations('profile')
  const tc = useTranslations('common')
  const toast = useUi((s) => s.toast)
  const [status, setStatus] = useState<Status>('idle')
  const [copied, setCopied] = useState(false)
  const run = useRef(0)
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<AladinMap | null>(null)
  const { ra, dec, name, id } = object
  const url = `https://sky.esa.int/esasky/?target=${encodeURIComponent(`${ra} ${dec}`)}&hips=DSS2+color&fov=0.25&cooframe=J2000`
  const coords = `${formatRa(ra)} ${formatDec(dec)}`

  const loading = status === 'loading'

  useEffect(() => {
    if (open) return
    run.current += 1
    map.current?.destroy?.()
    map.current = null
    setStatus('idle')
    setCopied(false)
  }, [open])

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), COPIED_MS)
    return () => clearTimeout(timer)
  }, [copied])

  useEffect(() => {
    if (!loading) return
    const mine = run.current
    const start = async () => {
      await withTimeout(fetch(`${SURVEY_URL}properties`, { mode: 'no-cors' }))
      const lib = (await withTimeout(import(/* webpackIgnore: true */ ALADIN_URL))) as { default: AladinLib }
      await withTimeout(lib.default.init)
      if (mine !== run.current || !box.current) return
      map.current = lib.default.aladin(box.current, { ...CONTROLS_OFF, survey: SURVEY_URL, target: `${ra} ${dec}`, fov: 0.25, reticleColor: '#ffcc00' })
      setStatus('ready')
    }
    start().catch(() => {
      if (mine === run.current) setStatus('failed')
    })
  }, [loading, ra, dec])

  const explore = () => {
    run.current += 1
    setStatus('loading')
  }

  const back = () => {
    run.current += 1
    map.current?.destroy?.()
    map.current = null
    setStatus('idle')
  }

  const copy = async () => {
    const done = await navigator.clipboard?.writeText(`${ra.toFixed(5)} ${dec.toFixed(5)}`).then(
      () => true,
      () => false,
    )
    if (done) setCopied(true)
    else toast({ kind: 'info', key: 'sky.map.copyFailed' })
  }

  return (
    <Sheet open={open} onClose={onClose} title={tp('skyMapTitle')}>
      <div className="space-y-2 px-4 pb-1 pt-3">
        {(status === 'idle' || status === 'failed') && <SkyLocator ra={ra} dec={dec} name={name} className="-mx-2" />}
        {(status === 'loading' || status === 'ready') && (
          <div>
            <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-reels-bg">
              <div className="absolute inset-0">
                <div ref={box} data-testid="sky-photos" className="size-full" />
              </div>
              {status === 'loading' && (
                <div className="absolute inset-0" role="status">
                  <Skeleton className="size-full rounded-none" />
                  <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 px-6 text-center text-note text-text">{t('loading')}</p>
                </div>
              )}
              {status === 'ready' && (
                <div className="absolute bottom-2 right-2 flex gap-2">
                  <Button className="size-11 text-title-sm" aria-label={t('zoomOut')} onClick={() => map.current?.decreaseZoom()}>
                    -
                  </Button>
                  <Button className="size-11 text-title-sm" aria-label={t('zoomIn')} onClick={() => map.current?.increaseZoom()}>
                    +
                  </Button>
                </div>
              )}
            </div>
            {status === 'loading' ? (
              <Button variant="ghost" className="mt-1 h-11 w-full" onClick={back}>
                {tc('cancel')}
              </Button>
            ) : (
              <>
                <p className="mt-2 text-meta leading-snug text-text-secondary">{t('photosHint')}</p>
                <p className="flex flex-wrap items-center justify-between gap-x-3 text-meta text-text-secondary">
                  <span>{tp('skyMapCredit')}</span>
                  <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-note font-medium text-link">
                    {t('openExternal')}
                  </a>
                </p>
              </>
            )}
          </div>
        )}

        <div className="flex min-h-11 items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-body tabular-nums">{coords}</p>
          <span aria-live="polite" className="text-meta text-text-secondary">
            {copied && t('copied')}
          </span>
          <IconButton label={t('copy')} onClick={() => void copy()} className="-mr-2">
            {copied ? <IconCheck size={22} /> : <IconCopy size={22} />}
          </IconButton>
        </div>

        {watch && (
          <Link href={skyHref({ ra, dec, name, obj: id })} onClick={onClose} className="flex h-11 items-center justify-center gap-1.5 rounded-[var(--radius-button)] bg-accent text-ui font-semibold text-on-accent active:bg-accent-pressed">
            <IconPlay size={20} />
            {t('watch')}
          </Link>
        )}

        {status === 'idle' && (
          <button type="button" onClick={explore} className="flex min-h-11 w-full items-center gap-2 rounded-[var(--radius-button)] px-1 py-1 text-left active:bg-surface">
            <IconMap size={20} className="shrink-0 text-text-secondary" />
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block text-body font-medium">{t('explore')}</span>
              <span className="block text-meta text-text-secondary">{t('exploreHint')}</span>
            </span>
          </button>
        )}

        {status === 'failed' && (
          <div className="rounded-xl bg-surface p-3" role="alert">
            <p className="text-body font-medium">{t('failedTitle')}</p>
            <p className="mt-0.5 text-note leading-snug text-text-secondary">{t('failedBody')}</p>
            <div className="mt-3 flex gap-2">
              <Button variant="ghost" className="h-11 flex-1 bg-bg" onClick={explore}>
                {tc('retry')}
              </Button>
              <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 flex-1 items-center justify-center rounded-[var(--radius-button)] bg-bg text-ui font-medium">
                {t('openExternal')}
              </a>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  )
}
