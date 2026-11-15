'use client'

import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { IconCrosshair } from '@/components/icons'
import { Button, Sheet } from '@/components/ui/primitives'

function LegendRow({ mark, title, body }: { mark: ReactNode; title: string; body: string }) {
  return (
    <li className="flex gap-3 py-1.5">
      <span className="inline-flex size-8 shrink-0 items-center justify-center">{mark}</span>
      <span className="min-w-0 flex-1 leading-snug">
        <span className="block text-body font-medium">{title}</span>
        <span className="block text-note text-text-secondary">{body}</span>
      </span>
    </li>
  )
}

function Legend() {
  const t = useTranslations('marking')
  return (
    <ul>
      <LegendRow mark={<IconCrosshair size={26} className="text-crosshair" />} title={t('yellowTitle')} body={t('yellowBody')} />
      <LegendRow mark={<span className="size-3.5 rounded-full border-2 border-mark-outline bg-mark-mine" />} title={t('youTitle')} body={t('youBody')} />
      <LegendRow mark={<span className="size-3.5 rounded-full border-2 border-mark-outline bg-mark-community" />} title={t('othersTitle')} body={t('othersBody')} />
    </ul>
  )
}

export function PredictionHelp({ open, onClose, onMark }: { open: boolean; onClose: () => void; onMark: () => void }) {
  const t = useTranslations('marking')
  return (
    <Sheet open={open} onClose={onClose} title={t('helpTitle')}>
      <div className="px-4 pt-2">
        <Legend />
        <h3 className="mt-3 text-ui font-semibold">{t('whyTitle')}</h3>
        <p className="mt-1 text-body leading-snug text-text-secondary">{t('whyBody')}</p>
        <p className="mt-2 text-note leading-snug text-text-secondary">{t('whyHonest')}</p>
        <Button variant="primary" className="mt-4 h-12 w-full" onClick={onMark}>
          {t('markNow')}
        </Button>
      </div>
    </Sheet>
  )
}
