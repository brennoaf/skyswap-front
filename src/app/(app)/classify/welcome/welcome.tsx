'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { useMemo, useRef, useState, type CSSProperties } from 'react'
import { AnswerFace, FrameBars, SWIPE, swapButton } from '@/components/classify/swap-photo'
import { IconArrowRight, IconBack, IconWarning } from '@/components/icons'
import { IconButton } from '@/components/ui/primitives'
import type { DeckCard } from '@/lib/api/client'
import { STEP_BODY, STEP_TITLE, SwapShell } from '../shell'
import { useSpriteSet } from '../sprites'
import { WelcomePhoto, type WelcomeExample, type WelcomeStep, type WelcomeStepPlan } from './welcome-photo'

const WELCOME_STEPS: WelcomeStepPlan[] = [
  { key: 'intro' },
  { key: 'still', example: 'still', swipe: { x: -SWIPE, up: false, arrow: 'rotate-180' } },
  { key: 'moves', example: 'moves', follow: true, swipe: { x: SWIPE, up: false, arrow: '' } },
  { key: 'particle', example: 'particle', spot: { u: 0.5, v: 0.5, r: 15 }, tap: true },
  { key: 'streak', example: 'streak', spot: { u: 0.5, v: 0.5, r: 38 }, tap: true, hold: 1 },
  { key: 'unsure', example: 'still', swipe: { x: 0, up: true, arrow: '-rotate-90' } },
]
const WELCOME_STYLE = {
  '--welcome-up': 'clamp(28px, calc((100dvh - 560px) * 0.15 + 28px), 72px)',
  '--welcome-photo': 'max(120px, min(calc(min(100vw, var(--width-app)) - 40px), calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - var(--welcome-up) - var(--welcome-text) - 198px)))',
} as CSSProperties

export function Welcome({ lesson, examples, count, onStart, onSkip }: { lesson: { card: DeckCard }; examples: WelcomeExample[]; count: number; onStart: () => void; onSkip: () => void }) {
  const t = useTranslations('classify.welcome')
  const tc = useTranslations('classify')
  const reduce = useReducedMotion()
  const [index, setIndex] = useState(0)
  const primary = useRef<HTMLButtonElement>(null)
  const steps = useMemo<WelcomeStep[]>(
    () =>
      WELCOME_STEPS.flatMap((plan) => {
        if (!plan.example) return [{ ...plan, card: lesson.card, marks: [] }]
        const found = examples.find((e) => e.example === plan.example)
        return found ? [{ ...plan, card: found.card, marks: found.marks }] : []
      }),
    [examples, lesson.card],
  )
  const sprites = useSpriteSet(steps.map((s) => s.card.sprite))
  const step = steps[index] ?? steps[0]
  if (!step) return null
  const last = index === steps.length - 1
  const back = () => {
    setIndex(index - 1)
    if (index === 1) primary.current?.focus()
  }
  return (
    <SwapShell>
      <div style={WELCOME_STYLE} className="flex min-h-0 flex-1 flex-col pt-2 [--welcome-text:180px] [@media(min-height:700px)]:[--welcome-text:200px]" data-testid="swap-welcome">
        <div className="shrink-0 px-2">
          <FrameBars n={steps.length} index={index} />
        </div>
        <div className="flex h-12 shrink-0 items-center px-2" data-testid="welcome-top">
          {index > 0 && (
            <IconButton label={t('back')} onClick={back} className="size-12">
              <IconBack size={28} />
            </IconButton>
          )}
          <button type="button" onClick={onSkip} className="ml-auto flex h-12 items-center px-3 text-title-sm font-semibold text-text-secondary">
            {t('skip')}
          </button>
        </div>
        <WelcomePhoto step={step} index={index} sprites={sprites} />
        <div aria-live="polite" className="flex min-h-0 flex-1 overflow-y-auto px-5 py-6" data-testid="welcome-text-area">
          <motion.div key={index} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="m-auto w-full text-center" data-testid="welcome-text" data-step={index + 1} data-key={step.key}>
            <p className="sr-only">{t('stepRead', { n: index + 1, total: steps.length })}</p>
            {step.key === 'intro' ? (
              <>
                <h1 className={`${STEP_TITLE} text-display`}>{t('title')}</h1>
                <p className={`${STEP_BODY} mt-3`}>{t('body1')}</p>
                <p className={`${STEP_BODY} mt-3`}>{t('body2')}</p>
              </>
            ) : (
              <>
                <h1 className={`${STEP_TITLE} text-wordmark`}>{t(`steps.${step.key}.title`)}</h1>
                <p className={`${STEP_BODY} mt-3`}>{t(`steps.${step.key}.body`)}</p>
                <div className={`${STEP_BODY} mt-3 flex items-center justify-center gap-3 font-semibold text-text`} data-testid="welcome-how">
                  {step.swipe && <IconArrowRight size={24} aria-hidden="true" className={`shrink-0 ${step.swipe.arrow}`} />}
                  {step.tap && (
                    <motion.span aria-hidden="true" className="block" animate={reduce ? undefined : { scale: [1, 1.14, 1, 1] }} transition={{ duration: 2.4, times: [0, 0.2, 0.4, 1], ease: 'easeInOut', repeat: Infinity }} data-testid="welcome-defect" title={tc('glitch')}>
                      <AnswerFace big={false}>
                        <IconWarning size={28} />
                      </AnswerFace>
                    </motion.span>
                  )}
                  {t(`steps.${step.key}.how`)}
                </div>
              </>
            )}
          </motion.div>
        </div>
        <div className="shrink-0 px-5 pb-4">
          <button ref={primary} type="button" onClick={last ? onStart : () => setIndex(index + 1)} className={`${swapButton.primary} w-full`}>
            {last ? t('start', { n: count }) : t('next')}
          </button>
        </div>
      </div>
    </SwapShell>
  )
}
