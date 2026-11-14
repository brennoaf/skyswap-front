'use client'

import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { IconCrosshair } from '@/components/icons'
import { Button, Sheet } from '@/components/ui/primitives'

type Mark = { frame: number; x: number; y: number }

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

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

export function MarkResult({ marks, predicted, onClose }: { marks: Mark[] | null; predicted: Map<number, { x: number; y: number }>; onClose: () => void }) {
  const t = useTranslations('marking')
  const gaps = (marks ?? []).flatMap((m) => {
    const p = predicted.get(m.frame)
    return p ? [Math.hypot(m.x - p.x, m.y - p.y)] : []
  })
  const gap = gaps.length ? median(gaps) : null
  const verdict = gap === null ? null : gap < 0.03 ? 'close' : gap < 0.1 ? 'near' : 'far'
  return (
    <Sheet open={!!marks} onClose={onClose} title={t('resultTitle', { n: marks?.length ?? 0 })}>
      <div className="px-4 pt-3">
        {verdict && gap !== null && (
          <div className="rounded-xl bg-surface p-3">
            <p className="text-ui font-semibold">{t(`result.${verdict}`)}</p>
            <p className="mt-0.5 text-note leading-snug text-text-secondary">{t('resultGap', { pct: Math.max(1, Math.round(gap * 100)) })}</p>
          </div>
        )}
        <div className="mt-2">
          <Legend />
        </div>
        <p className="mt-2 text-note leading-snug text-text-secondary">{t('whyHonest')}</p>
        <Button variant="primary" className="mt-4 h-12 w-full" onClick={onClose}>
          {t('gotIt')}
        </Button>
      </div>
    </Sheet>
  )
}
