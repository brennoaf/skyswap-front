'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { Button, Wordmark } from '@/components/ui/primitives'
import { useUi } from '@/lib/state/ui'

const STEPS = ['blink', 'colours', 'mark', 'saturation'] as const

function Art({ step, tick }: { step: (typeof STEPS)[number]; tick: number }) {
  const on = tick % 2 === 0
  if (step === 'blink')
    return (
      <svg viewBox="0 0 240 180" className="w-full" aria-hidden="true">
        <rect x="20" y="10" width="200" height="160" rx="18" fill="var(--color-surface)" />
        {[[50, 40], [180, 60], [90, 140], [160, 130], [60, 100]].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="5" fill="var(--color-text)" opacity="0.8" />
        ))}
        <circle cx={on ? 112 : 128} cy={on ? 92 : 84} r="7" fill="var(--color-crosshair)" />
        <circle cx={on ? 128 : 112} cy={on ? 84 : 92} r="7" fill="none" stroke="var(--color-crosshair)" strokeDasharray="3 3" opacity="0.6" />
        <path d="M100 70H90V80M140 70H150V80M100 110H90V100M140 110H150V100" stroke="var(--color-accent)" strokeWidth="2.5" fill="none" />
      </svg>
    )
  if (step === 'colours')
    return (
      <svg viewBox="0 0 240 180" className="w-full" aria-hidden="true">
        {[1, 2, 3, 4, 5, 6].map((n) => `var(--color-band-d${n})`).map((c, i) => (
          <g key={c} transform={`translate(${24 + i * 33} ${tick % 6 === i ? 20 : 34})`}>
            <rect width="28" height="110" rx="10" fill={c} opacity={tick % 6 === i ? 1 : 0.55} />
            <text x="14" y="128" textAnchor="middle" fontSize="12" fill="var(--color-text-secondary)">{`D${i + 1}`}</text>
          </g>
        ))}
      </svg>
    )
  if (step === 'mark')
    return (
      <svg viewBox="0 0 240 180" className="w-full" aria-hidden="true">
        <rect x="20" y="10" width="200" height="160" rx="18" fill="var(--color-surface)" />
        {[0, 1, 2, 3].map((i) => (
          <circle key={i} cx={70 + i * 30} cy={120 - i * 18} r="6" fill={i <= tick % 4 ? 'var(--color-crosshair)' : 'var(--color-ring-seen)'} />
        ))}
        <path d="M70 120L160 66" stroke="var(--color-crosshair)" strokeWidth="2" strokeDasharray="4 4" opacity="0.6" />
        <g transform={`translate(${70 + (tick % 4) * 30} ${120 - (tick % 4) * 18})`} stroke="var(--color-accent)" strokeWidth="2.5" fill="none">
          <circle r="14" />
          <path d="M0 -22V-16M0 16V22M-22 0H-16M16 0H22" />
        </g>
      </svg>
    )
  return (
    <svg viewBox="0 0 240 180" className="w-full" aria-hidden="true">
      <rect x="20" y="10" width="200" height="160" rx="18" fill="var(--color-surface)" />
      <circle cx="120" cy="90" r={on ? 46 : 40} fill="var(--color-crosshair)" opacity="0.25" />
      <circle cx="120" cy="90" r="28" fill="var(--color-spot-star)" />
      <path d="M100 90H140M120 70V110" stroke="var(--color-on-warning)" strokeWidth="3" opacity="0.15" />
      <text x="120" y="160" textAnchor="middle" fontSize="12" fill="var(--color-text-secondary)">
        255 255 255
      </text>
    </svg>
  )
}

export function Onboarding({ force, onClose }: { force?: boolean; onClose?: () => void }) {
  const t = useTranslations('onboarding')
  const done = useUi((s) => s.onboardingDone)
  const language = useUi((s) => s.languageChosen)
  const finish = useUi((s) => s.finishOnboarding)
  const reduce = useReducedMotion()
  const [step, setStep] = useState(0)
  const [tick, setTick] = useState(0)
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])
  useEffect(() => {
    if (reduce) return
    const timer = setInterval(() => setTick((x) => x + 1), 700)
    return () => clearInterval(timer)
  }, [reduce])
  const visible = hydrated && (force || (language && !done))
  const close = () => {
    finish()
    setStep(0)
    onClose?.()
  }
  const key = STEPS[step] ?? 'blink'
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="onboarding-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[65] mx-auto flex max-w-[var(--width-app)] flex-col bg-bg px-6 pb-[max(20px,env(safe-area-inset-bottom))] pt-[max(16px,env(safe-area-inset-top))]"
        >
          <div className="flex items-center justify-between">
            <Wordmark className="text-wordmark-sm" />
            <button type="button" onClick={close} className="h-11 px-2 text-ui font-semibold text-text-secondary">
              {t('skip')}
            </button>
          </div>
          <div className="flex gap-1 pt-3" aria-hidden="true">
            {STEPS.map((s, i) => (
              <span key={s} className={i <= step ? 'h-[3px] flex-1 rounded-full bg-text' : 'h-[3px] flex-1 rounded-full bg-ring-seen'} />
            ))}
          </div>
          <motion.div key={key} initial={reduce ? false : { opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} className="flex flex-1 flex-col justify-center gap-6">
            <Art step={key} tick={tick} />
            <div>
              <p className="text-note font-semibold uppercase tracking-wide text-accent">{t('step', { n: step + 1, total: STEPS.length })}</p>
              <h2 id="onboarding-title" className="mt-1 font-[family-name:var(--font-display)] text-display font-bold leading-tight">
                {t(`${key}.title`)}
              </h2>
              <p className="mt-3 text-ui leading-relaxed text-text-secondary">{t(`${key}.body`)}</p>
            </div>
          </motion.div>
          <div className="flex gap-3">
            {step > 0 && (
              <Button className="h-12 flex-1" onClick={() => setStep((s) => s - 1)}>
                {t('back')}
              </Button>
            )}
            <Button variant="primary" className="h-12 flex-[2]" onClick={() => (step + 1 < STEPS.length ? setStep((s) => s + 1) : close())}>
              {step + 1 < STEPS.length ? t('next') : t('start')}
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
