'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { IconCheck } from '@/components/icons'
import { Button, Wordmark } from '@/components/ui/primitives'
import { defaultLocale, type Locale } from '@/i18n/locales'
import { cx } from '@/lib/format'
import { useUi } from '@/lib/state/ui'
import { useSwitchLocale } from '@/lib/use-switch-locale'

export type LanguageOption = { locale: Locale; name: string; greeting: string; title: string; body: string; pick: string; action: string }

const STARS = [
  [18, 22, 1.4, 'text'],
  [64, 12, 1, 'text'],
  [112, 30, 1.8, 'band-d2'],
  [150, 14, 1, 'text'],
  [196, 26, 1.3, 'text'],
  [244, 10, 2, 'band-d5'],
  [286, 34, 1, 'text'],
  [40, 58, 1, 'text'],
  [92, 70, 1.2, 'text'],
  [176, 62, 1, 'band-d1'],
  [226, 74, 1.4, 'text'],
  [270, 64, 1, 'text'],
] as const

function SkyField() {
  const reduce = useReducedMotion()
  return (
    <svg viewBox="0 0 300 84" className="w-full" aria-hidden="true">
      {STARS.map(([x, y, r, tone], i) => (
        <motion.circle
          key={i}
          cx={x}
          cy={y}
          r={r * 1.8}
          fill={`var(--color-${tone})`}
          initial={{ opacity: 0.35 }}
          animate={reduce ? { opacity: 0.6 } : { opacity: [0.25, 0.9, 0.25] }}
          transition={reduce ? { duration: 0 } : { duration: 2.4 + (i % 4) * 0.7, repeat: Infinity, delay: (i % 5) * 0.4 }}
        />
      ))}
    </svg>
  )
}

export function LanguageSetup({ options }: { options: LanguageOption[] }) {
  const chosen = useUi((s) => s.languageChosen)
  const choose = useUi((s) => s.chooseLanguage)
  const { change } = useSwitchLocale()
  const reduce = useReducedMotion()
  const [hydrated, setHydrated] = useState(false)
  const [selected, setSelected] = useState<Locale>(defaultLocale)
  const [greet, setGreet] = useState(0)
  useEffect(() => setHydrated(true), [])
  useEffect(() => {
    if (reduce || options.length < 2) return
    const timer = setInterval(() => setGreet((g) => (g + 1) % options.length), 2200)
    return () => clearInterval(timer)
  }, [reduce, options.length])

  const current = options.find((o) => o.locale === selected) ?? options[0]
  const hello = options[greet] ?? current
  if (!current || !hello) return null
  const confirm = () => {
    change(selected)
    choose()
  }

  return (
    <AnimatePresence>
      {hydrated && !chosen && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="language-title"
          lang={selected}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[66] mx-auto flex max-w-[var(--width-app)] flex-col bg-bg px-6 pb-[max(20px,env(safe-area-inset-bottom))] pt-[max(16px,env(safe-area-inset-top))]"
        >
          <div className="flex h-11 items-center">
            <Wordmark className="text-wordmark-sm" />
          </div>
          <div className="flex flex-1 flex-col justify-center">
            <SkyField />
            <div className="relative mt-4 h-14 overflow-hidden" aria-hidden="true">
              <AnimatePresence initial={false} mode="popLayout">
                <motion.p
                  key={hello.locale}
                  lang={hello.locale}
                  initial={reduce ? false : { y: 40, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={reduce ? { opacity: 0 } : { y: -40, opacity: 0 }}
                  transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
                  className="absolute inset-x-0 font-[family-name:var(--font-wordmark)] text-wordmark-lg leading-[56px]"
                >
                  {hello.greeting}
                </motion.p>
              </AnimatePresence>
            </div>
            <h1 id="language-title" className="mt-4 font-[family-name:var(--font-display)] text-display font-bold leading-tight">
              {current.title}
            </h1>
            <p className="mt-2 text-ui leading-relaxed text-text-secondary">{current.body}</p>
            <div role="radiogroup" aria-labelledby="language-title" className="mt-6 flex flex-col gap-3">
              {options.map((o) => {
                const on = o.locale === selected
                return (
                  <button
                    key={o.locale}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    lang={o.locale}
                    onClick={() => setSelected(o.locale)}
                    className={cx(
                      'flex min-h-16 items-center gap-4 rounded-2xl border px-4 text-left transition-colors active:bg-surface-pressed',
                      on ? 'border-text bg-surface' : 'border-divider',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-ui font-semibold">{o.name}</span>
                      <span className="block text-note text-text-secondary">{o.pick}</span>
                    </span>
                    <span
                      className={cx('inline-flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors', on ? 'border-accent bg-accent text-on-accent' : 'border-ring-seen')}
                      aria-hidden="true"
                    >
                      {on && <IconCheck size={16} />}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
          <Button variant="primary" className="h-12 w-full" onClick={confirm}>
            {current.action}
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
