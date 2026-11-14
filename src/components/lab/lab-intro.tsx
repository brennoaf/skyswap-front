'use client'

import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { IconColours, IconCompare, IconCrosshair, IconLayers, IconMore, IconMoves, IconNote, IconSearch, IconSpectrum } from '@/components/icons'
import { Button, Sheet } from '@/components/ui/primitives'
import { useUi } from '@/lib/state/ui'

export const TOOLS = [
  { key: 'date', icon: <IconCompare size={26} /> },
  { key: 'colour', icon: <IconColours size={26} /> },
  { key: 'zoom', icon: <IconSearch size={26} /> },
  { key: 'layers', icon: <IconLayers size={26} /> },
  { key: 'pixel', icon: <IconCrosshair size={26} /> },
  { key: 'motion', icon: <IconMoves size={26} /> },
  { key: 'spectrum', icon: <IconSpectrum size={26} /> },
  { key: 'notes', icon: <IconNote size={26} /> },
  { key: 'more', icon: <IconMore size={26} /> },
] as const

export type Tool = (typeof TOOLS)[number]['key']

export function LabIntro() {
  const t = useTranslations('lab.intro')
  const tools = useTranslations('lab.tools')
  const path = usePathname()
  const language = useUi((s) => s.languageChosen)
  const done = useUi((s) => s.labIntroDone)
  const finish = useUi((s) => s.finishLabIntro)
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])
  const open = hydrated && language && !done && (path === '/lab' || path.startsWith('/lab/'))
  return (
    <Sheet open={open} onClose={finish} title={t('title')}>
      <p className="px-4 pt-3 text-body leading-snug">{t('body')}</p>
      <ul className="mt-2 px-4">
        {TOOLS.map((tool) => (
          <li key={tool.key} className="flex items-center gap-3 py-1.5">
            <span className="inline-flex size-8 shrink-0 items-center justify-center">{tool.icon}</span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block text-body font-medium">{tools(tool.key)}</span>
              <span className="block text-meta text-text-secondary">{t(`tools.${tool.key}`)}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="sticky bottom-0 bg-sheet px-4 pt-3">
        <Button variant="primary" className="h-12 w-full" onClick={finish}>
          {t('action')}
        </Button>
      </div>
    </Sheet>
  )
}
