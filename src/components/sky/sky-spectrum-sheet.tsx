'use client'

import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import { PointSpectrumChart } from '@/components/charts/charts'
import { IconLink, IconWarning } from '@/components/icons'
import type { SkyParams } from '@/components/sky/sky-viewer'
import { Button, Notice, Sheet, Skeleton } from '@/components/ui/primitives'
import { ApiError } from '@/lib/api/client'
import { useSkySpectrum } from '@/lib/api/hooks'
import { monthYear } from '@/lib/format'

export const IRSA_SPECTROPHOTOMETRY = 'https://irsa.ipac.caltech.edu/onlinehelp/spherex/spherex/sp.html'

export function SkySpectrumSheet({ open, onClose, params }: { open: boolean; onClose: () => void; params: SkyParams }) {
  const t = useTranslations('sky.spectrum')
  const tc = useTranslations('common')
  const tv = useTranslations('viewer')
  const locale = useLocale()
  const [follow, setFollow] = useState<string | null>(null)
  const obj = follow ?? params.obj
  const spectrum = useSkySpectrum(params.ra, params.dec, obj, open)
  const data = spectrum.data
  const gone = data?.elsewhere?.[0]
  const moved = data?.object && !data.object.solar_system && data.object.shift_arcsec > data.pixel_arcsec ? data.object : null
  const toProfile = !!data?.bright && !!obj && !data.object?.solar_system
  const offline = spectrum.error instanceof ApiError && spectrum.error.status === 503
  const notes = data
    ? [
        t('sum', { from: monthYear(data.date_beg, locale), to: monthYear(data.date_end, locale), px: Math.round(data.pixel_arcsec) }),
        ...(moved ? [t('movedRead', { name: moved.name, n: Math.round(moved.shift_arcsec) })] : []),
        ...(data.bright ? [t('bright')] : []),
      ]
    : []
  const title = (
    <span className="inline-flex items-center gap-2">
      {t('title')}
      {data?.bright && (
        <span className="rounded-full bg-warning px-2 py-0.5 text-meta font-medium text-on-warning" data-testid="sky-spectrum-bright">
          {tv('saturatedPill')}
        </span>
      )}
    </span>
  )
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="space-y-3 px-4 pb-4 pt-1" data-testid="sky-spectrum">
        {!data &&
          (spectrum.isError ? (
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
          ))}
        {data?.object?.solar_system && (
          <Notice tone="warning" icon={<IconWarning size={20} />}>
            <p>{t('solarSystem')}</p>
          </Notice>
        )}
        {gone && (
          <Notice tone="warning" icon={<IconWarning size={20} />}>
            <p data-testid="sky-spectrum-gone">{t('elsewhere', { name: gone.name, n: Math.round(gone.offset_arcsec) })}</p>
            <Button className="mt-2 h-11" onClick={() => setFollow(gone.id)}>
              {t('elsewhereGo', { name: gone.name })}
            </Button>
          </Notice>
        )}
        {data && toProfile && (
          <div className="space-y-3 py-2" data-testid="sky-spectrum-profile">
            <p className="text-body leading-snug">{t('brightProfile')}</p>
            <Link href={`/o/${obj}?tab=spectrum`} className="inline-flex h-11 items-center justify-center rounded-[var(--radius-button)] bg-accent px-5 text-ui font-semibold text-on-accent active:bg-accent-pressed">
              {t('seeProfile')}
            </Link>
          </div>
        )}
        {data && !toProfile && (
          <PointSpectrumChart
            data={data}
            notes={notes}
            extra={
              <>
                <a href={IRSA_SPECTROPHOTOMETRY} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 text-ui font-medium text-link">
                  <IconLink size={20} className="shrink-0" />
                  {t('irsa')}
                </a>
                <p>{t('credit')}</p>
              </>
            }
          />
        )}
      </div>
    </Sheet>
  )
}
