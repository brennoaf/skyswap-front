'use client'

import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { PointSpectrumChart } from '@/components/charts/charts'
import { IconChevronRight, IconFlask, IconLink, IconSaturated } from '@/components/icons'
import type { SkyParams } from '@/components/sky/sky-viewer'
import { Button, Notice, Sheet, Skeleton } from '@/components/ui/primitives'
import { ApiError } from '@/lib/api/client'
import { useSky, useSkySpectrum } from '@/lib/api/hooks'
import { monthYear } from '@/lib/format'

export const IRSA_SPECTROPHOTOMETRY = 'https://irsa.ipac.caltech.edu/onlinehelp/spherex/spherex/sp.html'
const SAME_OBJECT_ARCSEC = 20

export function SkySpectrumSheet({ open, onClose, params }: { open: boolean; onClose: () => void; params: SkyParams }) {
  const t = useTranslations('sky.spectrum')
  const tc = useTranslations('common')
  const tv = useTranslations('viewer')
  const locale = useLocale()
  const spectrum = useSkySpectrum(params.ra, params.dec, open)
  const sky = useSky(open ? params.ra : null, params.dec, params.fov, params.band)
  const near = sky.data?.nearby.find((o) => (o.separation_deg ?? Infinity) * 3600 <= SAME_OBJECT_ARCSEC)
  const labId = params.obj ?? near?.id ?? null
  const data = spectrum.data
  const offline = spectrum.error instanceof ApiError && spectrum.error.status === 503
  const row = 'flex min-h-12 w-full items-center gap-3 border-b-[0.5px] border-divider text-left text-ui active:bg-surface'
  return (
    <Sheet open={open} onClose={onClose} title={t('title')}>
      <div className="space-y-3 px-4 pb-4 pt-1" data-testid="sky-spectrum">
        {data ? (
          <p className="text-note leading-snug text-text-secondary" data-testid="sky-spectrum-peek">
            {t('peek', { from: monthYear(data.date_beg, locale), to: monthYear(data.date_end, locale), px: Math.round(data.pixel_arcsec) })}
          </p>
        ) : spectrum.isError ? (
          <div className="space-y-3 py-6 text-center">
            <p className="text-body">{t(offline ? 'offline' : 'failed')}</p>
            {!offline && (
              <Button onClick={() => void spectrum.refetch()} className="h-11">
                {tc('retry')}
              </Button>
            )}
          </div>
        ) : (
          <>
            <p className="text-note text-text-secondary">{t('loading')}</p>
            <Skeleton className="h-[260px] w-full" />
          </>
        )}
        {data?.bright && (
          <Notice tone="warning" icon={<IconSaturated size={20} />}>
            <p className="font-semibold">{tv('saturatedPill')}</p>
            <p>{t('bright')}</p>
          </Notice>
        )}
        {data && <PointSpectrumChart data={data} />}
        <nav className="border-t-[0.5px] border-divider" aria-label={t('more')}>
          {labId && (
            <Link href={`/lab/${labId}`} className={row} data-testid="sky-spectrum-lab">
              <IconFlask size={22} className="shrink-0 text-text-secondary" />
              <span className="min-w-0 flex-1">{t('lab')}</span>
              <IconChevronRight size={18} className="shrink-0 text-icon-muted" />
            </Link>
          )}
          <a href={IRSA_SPECTROPHOTOMETRY} target="_blank" rel="noreferrer" className={row}>
            <IconLink size={22} className="shrink-0 text-text-secondary" />
            <span className="min-w-0 flex-1">{t('irsa')}</span>
          </a>
        </nav>
        <p className="text-meta leading-snug text-text-secondary">{t('credit')}</p>
      </div>
    </Sheet>
  )
}
