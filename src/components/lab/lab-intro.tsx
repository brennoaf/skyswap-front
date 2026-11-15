'use client'

import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { IconClose, IconColours, IconCompare, IconCrosshair, IconLayers, IconMore, IconMoves, IconNote, IconSearch, IconSpectrum } from '@/components/icons'
import { Button, IconButton, Sheet } from '@/components/ui/primitives'
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

const SELF_EXPLAINED: readonly Tool[] = ['pixel', 'motion', 'spectrum', 'more']

export function LabIntro() {
  const t = useTranslations('lab.intro')
  const path = usePathname()
  const language = useUi((s) => s.languageChosen)
  const done = useUi((s) => s.labIntroDone)
  const finish = useUi((s) => s.finishLabIntro)
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])
  const open = hydrated && language && !done && (path === '/lab' || path.startsWith('/lab/'))
  return (
    <Sheet open={open} onClose={finish} title={t('title')}>
      <p className="px-4 pt-4 text-ui leading-relaxed">{t('body')}</p>
      <div className="px-4 pt-5">
        <Button variant="primary" className="h-12 w-full" onClick={finish}>
          {t('action')}
        </Button>
      </div>
    </Sheet>
  )
}

export function LabToolHint({ tool }: { tool: Tool }) {
  const t = useTranslations('lab.intro')
  const tc = useTranslations('common')
  const key = `lab-${tool}`
  const seen = useUi((s) => s.tipsSeen.includes(key))
  const markTip = useUi((s) => s.markTip)
  if (seen || SELF_EXPLAINED.includes(tool)) return null
  return (
    <div role="note" className="flex items-center gap-1 rounded-xl bg-surface pl-3 text-note leading-snug">
      <p className="min-w-0 flex-1 py-2.5">{t(`tools.${tool}`)}</p>
      <IconButton label={tc('close')} onClick={() => markTip(key)} className="text-text-secondary">
        <IconClose size={18} />
      </IconButton>
    </div>
  )
}

export function LabToolsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('lab.intro')
  const tools = useTranslations('lab.tools')
  return (
    <Sheet open={open} onClose={onClose} title={t('again')}>
      <ul className="px-4 pt-2">
        {TOOLS.map((tool) => (
          <li key={tool.key} className="flex items-center gap-3 py-2">
            <span className="inline-flex size-8 shrink-0 items-center justify-center">{tool.icon}</span>
            <span className="min-w-0 flex-1 leading-snug">
              <span className="block text-body font-medium">{tools(tool.key)}</span>
              <span className="block text-note text-text-secondary">{t(`tools.${tool.key}`)}</span>
            </span>
          </li>
        ))}
      </ul>
    </Sheet>
  )
}
