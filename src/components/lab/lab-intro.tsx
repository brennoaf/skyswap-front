'use client'

import { useTranslations } from 'next-intl'
import { useMemo, useState, type ReactNode } from 'react'
import { IconColours, IconCompare, IconCrosshair, IconInfo, IconLayers, IconMore, IconMoves, IconNote, IconSearch, IconSpectrum } from '@/components/icons'
import { ScreenTour, type TourStep } from '@/components/shell/onboarding'
import { IconButton, Sheet } from '@/components/ui/primitives'

export const TOOLS = [
  { key: 'date', icon: IconCompare },
  { key: 'colour', icon: IconColours },
  { key: 'zoom', icon: IconSearch },
  { key: 'pixel', icon: IconCrosshair },
  { key: 'layers', icon: IconLayers },
  { key: 'spectrum', icon: IconSpectrum },
  { key: 'motion', icon: IconMoves },
  { key: 'notes', icon: IconNote },
  { key: 'more', icon: IconMore },
] as const

export type Tool = (typeof TOOLS)[number]['key']

const TOUR_TOOLS: readonly Tool[] = ['colour', 'zoom', 'layers', 'spectrum', 'motion', 'notes', 'more']
const TOUR_OPENS: Record<string, Tool> = { photo: 'pixel', dates: 'date' }

export function LabTour({ onTool, onClose }: { onTool: (tool: Tool) => void; onClose: () => void }) {
  const t = useTranslations('lab.tour')
  const tools = useTranslations('lab.tools')
  const to = useTranslations('onboarding')
  const tc = useTranslations('common')
  const steps = useMemo<TourStep[]>(
    () => [
      { id: 'photo', target: 'lab-photo', text: t('photo.title'), body: t('photo.body') },
      { id: 'dates', target: 'lab-dates', text: t('dates.title'), body: t('dates.body') },
      ...TOUR_TOOLS.map((key) => {
        const Icon = TOOLS.find((tool) => tool.key === key)?.icon ?? IconMore
        return { id: key, target: 'lab-tools', text: tools(key), body: t(key), icon: <Icon size={24} /> }
      }),
    ],
    [t, tools],
  )
  return (
    <ScreenTour
      steps={steps}
      labels={{ skip: to('skip'), back: to('back'), next: to('next'), done: tc('done'), step: (n, total) => to('step', { n, total }) }}
      onStep={(id) => onTool(TOUR_OPENS[id] ?? (id as Tool))}
      onClose={onClose}
    />
  )
}

export function PanelLine({ title, info, children }: { title: string; info?: ReactNode; children?: ReactNode }) {
  const t = useTranslations('lab')
  const [open, setOpen] = useState(false)
  return (
    <div className="-my-1 flex min-h-11 items-center gap-2">
      <p className="min-w-0 flex-1 text-note leading-snug text-text-secondary">{children}</p>
      {info && (
        <>
          <IconButton label={t('about', { tool: title })} onClick={() => setOpen(true)} className="-mr-2 text-text-secondary">
            <IconInfo size={22} />
          </IconButton>
          <Sheet open={open} onClose={() => setOpen(false)} title={title}>
            <div className="space-y-3 px-4 pt-4 text-ui leading-relaxed">{info}</div>
          </Sheet>
        </>
      )}
    </div>
  )
}
