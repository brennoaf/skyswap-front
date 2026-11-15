'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { skyHref } from '@/components/feed/spot-sheet'
import { IconLink, IconWarning } from '@/components/icons'
import type { SkyParams } from '@/components/sky/sky-viewer'
import { Button, Notice, Sheet } from '@/components/ui/primitives'
import { useSearch } from '@/lib/api/hooks'
import { formatDec, formatRa } from '@/lib/format'
import { readView, withView } from '@/lib/sky-view'
import { useUi } from '@/lib/state/ui'
import { useFmt } from '@/lib/use-fmt'

const SAME_SPOT_DEG = 1e-3

function IconCode() {
  return (
    <svg width={20} height={20} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M12 10L6 16L12 22M20 10L26 16L20 22" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function SkyShareSheet({ open, onClose, params }: { open: boolean; onClose: () => void; params: SkyParams }) {
  const t = useTranslations('search')
  const ts = useTranslations('sky')
  const fmt = useFmt()
  const toast = useUi((s) => s.toast)
  const [manual, setManual] = useState<string | null>(null)
  const { data } = useSearch(open && params.name ? params.name : '')
  const found = data?.spot ?? null
  const spot = found && Math.hypot(found.ra - params.ra, found.dec - params.dec) < SAME_SPOT_DEG ? found : null
  const sourceKey = spot ? `sources.${spot.source}` : ''
  const href = () => withView(skyHref(params), readView(window.location.search))
  const coords = t('coordinates', { ra: formatRa(params.ra), dec: formatDec(params.dec) })

  const copy = async (kind: 'link' | 'embed') => {
    const origin = window.location.origin
    const text =
      kind === 'link'
        ? `${origin}${href()}`
        : `<iframe src="${origin}${href().replace('/sky?', '/embed?')}" width="360" height="640" style="border:0;border-radius:12px" loading="lazy" allow="fullscreen" title="${ts('embedTitle')}"></iframe>`
    try {
      await navigator.clipboard.writeText(text)
      setManual(null)
      toast({ kind: 'info', key: 'search.copied' })
    } catch {
      setManual(text)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={ts('share')}>
      <div className="space-y-3 px-4 py-4">
        <div className="leading-snug">
          <p className="truncate text-ui font-semibold">{params.name ?? coords}</p>
          {params.name && <p className="text-note text-text-secondary">{coords}</p>}
          {spot && <p className="text-note text-text-secondary">{t('resolvedBy', { source: t.has(sourceKey) ? t(sourceKey) : spot.source })}</p>}
        </div>
        {spot?.stale && (
          <Notice tone="warning" icon={<IconWarning size={20} />}>
            {spot.moved_arcsec !== null && spot.epoch !== null ? t('stale', { epoch: spot.epoch, moved: fmt.fixed(spot.moved_arcsec, 1) }) : t('staleUnknown')}
          </Notice>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button className="min-h-11 whitespace-nowrap" onClick={() => void copy('link')} aria-label={t('copyDeepLink')}>
            <IconLink size={20} />
            {t('deepLink')}
          </Button>
          <Button className="min-h-11 whitespace-nowrap" onClick={() => void copy('embed')} aria-label={t('copyEmbed')}>
            <IconCode />
            {t('embed')}
          </Button>
        </div>
        {manual && (
          <label className="block text-note text-text-secondary">
            {t('copyFailed')}
            <textarea
              readOnly
              autoFocus
              value={manual}
              rows={3}
              onFocus={(e) => e.currentTarget.select()}
              className="mt-1 block w-full resize-none rounded-[var(--radius-input)] border-[0.5px] border-divider bg-surface p-2 font-mono text-meta text-text outline-none"
            />
          </label>
        )}
      </div>
    </Sheet>
  )
}
