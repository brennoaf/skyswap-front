'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState, type ReactNode } from 'react'
import { IconCards, IconClock, IconHighlight, IconStar, IconTarget, IconWarning } from '@/components/icons'
import { Button, Sheet } from '@/components/ui/primitives'
import { useUi } from '@/lib/state/ui'

function Row({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3 py-2">
      <span className="inline-flex size-8 shrink-0 items-center justify-center">{icon}</span>
      <div className="min-w-0 flex-1 leading-snug">
        <p className="text-body font-medium">{title}</p>
        <div className="text-note text-text-secondary">{children}</div>
      </div>
    </li>
  )
}

export function MeIntro({ levels, dailyCap }: { levels: { key: string; min_xp: number }[]; dailyCap: number }) {
  const t = useTranslations('meIntro')
  const tl = useTranslations('levels')
  const language = useUi((s) => s.languageChosen)
  const done = useUi((s) => s.meIntroDone)
  const finish = useUi((s) => s.finishMeIntro)
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])
  const ladder = levels.map((l) => t('levelStep', { name: tl(l.key), points: l.min_xp })).join(', ')
  return (
    <Sheet open={hydrated && language && !done} onClose={finish} title={t('title')}>
      <p className="px-4 pt-3 text-body leading-snug">{t('lead')}</p>
      <ul className="mt-1 px-4">
        <Row icon={<IconTarget size={24} />} title={t('pointsTitle')}>
          {t('pointsBody')}
        </Row>
        <Row icon={<IconHighlight size={24} />} title={t('levelsTitle')}>
          {t('levelsBody', { ladder })}
        </Row>
        <Row icon={<IconStar size={24} />} title={t('badgesTitle')}>
          {t('badgesBody')}
        </Row>
        <Row icon={<IconClock size={24} />} title={t('daysTitle')}>
          {t('daysBody')}
        </Row>
        <Row icon={<IconWarning size={24} />} title={t('limitsTitle')}>
          {t('limitsBody', { cap: dailyCap })}
        </Row>
        <Row icon={<IconCards size={24} />} title={t('helpTitle')}>
          {t('helpBody')}
        </Row>
      </ul>
      <div className="sticky bottom-0 -mb-[max(var(--space-gutter),env(safe-area-inset-bottom))] bg-sheet px-4 pb-[max(var(--space-gutter),env(safe-area-inset-bottom))] pt-3">
        <Button variant="primary" className="h-12 w-full" onClick={finish}>
          {t('action')}
        </Button>
      </div>
    </Sheet>
  )
}
