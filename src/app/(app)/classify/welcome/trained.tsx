'use client'

import { useTranslations } from 'next-intl'
import { swapButton } from '@/components/classify/swap-photo'
import { STEP_BODY, STEP_TITLE, SwapShell } from '../shell'

export function Trained({ onStart }: { onStart: () => void }) {
  const t = useTranslations('classify.trained')
  return (
    <SwapShell>
      <div className="flex min-h-0 flex-1 flex-col" data-testid="swap-trained">
        <div className="flex min-h-0 flex-1 overflow-y-auto px-5 py-6">
          <div className="m-auto w-full text-center">
            <h1 className={`${STEP_TITLE} text-display`}>{t('title')}</h1>
            <p className={`${STEP_BODY} mt-3`}>{t('body1')}</p>
            <p className={`${STEP_BODY} mt-3`}>{t('body2')}</p>
          </div>
        </div>
        <div className="shrink-0 px-5 pb-4">
          <button type="button" onClick={onStart} className={`${swapButton.primary} w-full`}>
            {t('start')}
          </button>
        </div>
      </div>
    </SwapShell>
  )
}
