'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { IconCheck } from '@/components/icons'
import { Button, useModal } from '@/components/ui/primitives'
import { defaultLocale, isLocale, type Locale } from '@/i18n/locales'
import { cx } from '@/lib/format'
import { useUi } from '@/lib/state/ui'
import { useSwitchLocale } from '@/lib/use-switch-locale'

export type LanguageOption = { locale: Locale; name: string; greeting: string; title: string; body: string; pick: string; action: string }

type Step = { id: 'language' | 'welcome' | 'help'; art?: 'sky' | 'blink' }

const STEPS: Step[] = [{ id: 'language' }, { id: 'welcome', art: 'sky' }, { id: 'help', art: 'blink' }]

const STARS = [
  [18, 22, 1.4, 'text'],
  [64, 12, 1, 'text'],
  [112, 30, 1.8, 'band-d2'],
  [150, 14, 1, 'text'],
  [196, 26, 1.3, 'text'],
  [244, 10, 2, 'band-d5'],
  [286, 34, 1, 'text'],
  [40, 50, 1, 'text'],
  [92, 46, 1.2, 'text'],
  [176, 50, 1, 'band-d1'],
  [226, 44, 1.4, 'text'],
  [270, 52, 1, 'text'],
] as const

type Box = { top: number; left: number; width: number; height: number }

function SkyField({ reduce }: { reduce: boolean }) {
  return (
    <svg viewBox="0 0 300 60" className="w-full" aria-hidden="true">
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

function Art({ kind, tick }: { kind: 'sky' | 'blink'; tick: number }) {
  const on = tick % 2 === 0
  if (kind === 'sky')
    return (
      <svg viewBox="0 0 240 120" className="w-full" aria-hidden="true">
        {[[30, 30, 2], [70, 80, 1.5], [110, 24, 2.5], [150, 70, 1.5], [200, 36, 2], [220, 92, 1.5], [52, 100, 1.2], [180, 104, 1.2]].map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} fill="var(--color-text)" opacity={(i + tick) % 3 === 0 ? 0.95 : 0.45} />
        ))}
        <circle cx="120" cy="62" r="26" fill="none" stroke="var(--color-accent)" strokeWidth="3" />
        <circle cx="120" cy="62" r="20" fill="var(--color-surface)" />
        <circle cx="120" cy="62" r="6" fill="var(--color-spot-star)" />
      </svg>
    )
  return (
    <svg viewBox="0 0 240 120" className="w-full" aria-hidden="true">
      <rect x="40" y="4" width="160" height="112" rx="16" fill="var(--color-surface)" />
      {[[66, 28], [176, 38], [92, 98], [160, 94], [72, 70]].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="4.5" fill="var(--color-text)" opacity="0.8" />
      ))}
      <circle cx={on ? 112 : 128} cy={on ? 64 : 56} r="6.5" fill="var(--color-crosshair)" />
      <circle cx={on ? 128 : 112} cy={on ? 56 : 64} r="6.5" fill="none" stroke="var(--color-crosshair)" strokeDasharray="3 3" opacity="0.6" />
      <path d="M100 44H92V52M140 44H148V52M100 76H92V68M140 76H148V68" stroke="var(--color-accent)" strokeWidth="2.5" fill="none" />
    </svg>
  )
}

function LanguageStep({ options, reduce, onDone }: { options: LanguageOption[]; reduce: boolean; onDone: () => void }) {
  const choose = useUi((s) => s.chooseLanguage)
  const { current, change, pending } = useSwitchLocale()
  const [selected, setSelected] = useState<Locale>(isLocale(current) ? current : defaultLocale)
  const [greet, setGreet] = useState(0)
  const [waiting, setWaiting] = useState(false)
  useEffect(() => {
    if (reduce || options.length < 2) return
    const timer = setInterval(() => setGreet((g) => (g + 1) % options.length), 2200)
    return () => clearInterval(timer)
  }, [reduce, options.length])
  useEffect(() => {
    if (!waiting || pending || current !== selected) return
    setWaiting(false)
    choose()
    onDone()
  }, [waiting, pending, current, selected, choose, onDone])

  const option = options.find((o) => o.locale === selected) ?? options[0]
  const hello = options[greet] ?? option
  if (!option || !hello) return null
  const confirm = () => {
    change(selected)
    setWaiting(true)
  }

  return (
    <div lang={selected}>
      <SkyField reduce={reduce} />
      <div className="relative mt-2 h-14 overflow-hidden" aria-hidden="true">
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
      <h2 id="tour-title" className="mt-1 font-[family-name:var(--font-display)] text-title-lg font-bold leading-tight">
        {option.title}
      </h2>
      <p className="mt-1 text-body leading-relaxed text-text-secondary">{option.body}</p>
      <div role="radiogroup" aria-labelledby="tour-title" className="mt-4 flex flex-col gap-2">
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
              className={cx('flex min-h-14 items-center gap-3 rounded-xl border px-3 text-left transition-colors active:bg-surface-pressed', on ? 'border-text bg-surface' : 'border-divider')}
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
      <Button variant="primary" className="mt-5 h-12 w-full" disabled={waiting} aria-busy={waiting} onClick={confirm}>
        {option.action}
      </Button>
    </div>
  )
}

function findTarget(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-tour="${id}"]`)
}

function useTargetBox(target: string | undefined, reduce: boolean, follow = true) {
  const [box, setBox] = useState<Box | null>(null)
  const [missing, setMissing] = useState(false)
  useLayoutEffect(() => {
    setBox(null)
    setMissing(false)
    if (!target) return
    let raf = 0
    let tries = 0
    let el: HTMLElement | null = null
    let lastScroll = 0
    const measure = () => {
      if (!el) return
      const r = el.getBoundingClientRect()
      setBox({ top: r.top, left: r.left, width: r.width, height: r.height })
    }
    const keepInView = () => {
      if (!follow || !el || el.closest('header, nav')) return
      const r = el.getBoundingClientRect()
      if (r.top < 64 || r.bottom > window.innerHeight - 220) el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
    }
    const find = () => {
      el = findTarget(target)
      if (!el) {
        if (++tries > 90) setMissing(true)
        else raf = requestAnimationFrame(find)
        return
      }
      keepInView()
      measure()
    }
    const onScroll = () => {
      lastScroll = performance.now()
      measure()
    }
    find()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', measure)
    const timer = setInterval(() => {
      if (performance.now() - lastScroll > 400) keepInView()
      measure()
    }, 250)
    return () => {
      cancelAnimationFrame(raf)
      clearInterval(timer)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', measure)
    }
  }, [target, reduce, follow])
  return { box, missing }
}

const TOUR_CARD = 'pointer-events-auto rounded-2xl bg-sheet p-5 shadow-[0_12px_40px_rgb(0_0_0/0.35)] ring-1 ring-divider'
const TOUR_PAD = 6

function roomBelow(spot: Box | null) {
  return spot ? window.innerHeight - (spot.top + spot.height) > spot.top : false
}

const ignoreEscape = () => undefined

function TourLayer({ spot, below, reduce, reserve, onEscape = ignoreEscape, children }: { spot: Box | null; below: boolean; reduce: boolean; reserve: number; onEscape?: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useModal(ref, true, onEscape)
  return (
    <motion.div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="tour-title" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[65] outline-none">
      {spot ? (
        <motion.div
          aria-hidden="true"
          className="absolute rounded-2xl shadow-[0_0_0_9999px_var(--color-media-scrim)] ring-2 ring-accent"
          initial={false}
          animate={{ top: spot.top - TOUR_PAD, left: spot.left - TOUR_PAD, width: spot.width + TOUR_PAD * 2, height: spot.height + TOUR_PAD * 2 }}
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 36 }}
        />
      ) : (
        <div aria-hidden="true" className="absolute inset-0 bg-media-scrim" />
      )}
      <div className="pointer-events-none relative mx-auto h-full max-w-[var(--width-app)] px-4">
        <div
          className={cx('absolute inset-x-4', !spot && 'top-1/2 -translate-y-1/2')}
          style={spot ? (below ? { top: Math.max(12, Math.min(spot.top + spot.height + TOUR_PAD + 12, window.innerHeight - reserve)) } : { bottom: Math.min(window.innerHeight - spot.top + TOUR_PAD + 12, window.innerHeight - reserve) }) : undefined}
        >
          {children}
        </div>
      </div>
    </motion.div>
  )
}

export function ScreenTour({ steps, labels, onClose }: { steps: { id: string; target: string; text: string }[]; labels: { skip: string; back: string; next: string }; onClose: () => void }) {
  const reduce = useReducedMotion() ?? false
  const [index, setIndex] = useState(0)
  const step = steps[index]
  const { box, missing } = useTargetBox(step?.target, reduce, false)
  const next = useCallback(() => {
    if (index + 1 < steps.length) setIndex(index + 1)
    else onClose()
  }, [index, onClose, steps.length])
  useEffect(() => {
    if (missing) next()
  }, [missing, next])
  if (!step) return null
  const below = roomBelow(box)
  return (
    <TourLayer spot={box} below={below} reduce={reduce} reserve={170} onEscape={onClose}>
      {box && (
        <motion.div key={step.id} initial={reduce ? false : { opacity: 0, y: below ? -8 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className={TOUR_CARD} data-testid="screen-tour" data-step={step.id}>
          <p id="tour-title" className="text-title-sm font-semibold leading-snug">
            {step.text}
          </p>
          <div className="mt-4 flex items-center gap-2">
            <button type="button" onClick={onClose} className="h-11 px-1 text-ui font-semibold text-text-secondary">
              {labels.skip}
            </button>
            <span className="flex-1" />
            {index > 0 && (
              <Button className="h-11 px-4" onClick={() => setIndex(index - 1)}>
                {labels.back}
              </Button>
            )}
            <Button variant="primary" className="h-11 px-5" onClick={next}>
              {labels.next}
            </Button>
          </div>
        </motion.div>
      )}
    </TourLayer>
  )
}

export function Onboarding({ options }: { options: LanguageOption[] }) {
  const t = useTranslations('onboarding')
  const path = usePathname()
  const done = useUi((s) => s.onboardingDone)
  const language = useUi((s) => s.languageChosen)
  const finish = useUi((s) => s.finishOnboarding)
  const reduce = useReducedMotion() ?? false
  const [index, setIndex] = useState(0)
  const [tick, setTick] = useState(0)
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    if (useUi.getState().languageChosen) setIndex(1)
    setHydrated(true)
  }, [])
  const visible = hydrated && (!language || (!done && path === '/'))
  useEffect(() => {
    if (reduce || !visible) return
    const timer = setInterval(() => setTick((x) => x + 1), 700)
    return () => clearInterval(timer)
  }, [reduce, visible])

  const step = STEPS[index] ?? STEPS[0]!
  const last = index === STEPS.length - 1
  const go = useCallback((d: number) => setIndex((i) => Math.max(0, Math.min(STEPS.length - 1, i + d))), [])
  const next = useCallback(() => go(1), [go])
  const close = () => {
    finish()
    setIndex(0)
  }

  const card = (
    <motion.div key={step.id} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className={TOUR_CARD}>
      {step.id === 'language' ? (
        <LanguageStep options={options} reduce={reduce} onDone={next} />
      ) : (
        <>
          {step.art && (
            <div className="mb-4">
              <Art kind={step.art} tick={tick} />
            </div>
          )}
          <p className="flex items-center gap-1.5" role="img" aria-label={t('step', { n: index, total: STEPS.length - 1 })}>
            {STEPS.slice(1).map((s, i) => (
              <span key={s.id} className={cx('h-1.5 rounded-full transition-all', i + 1 === index ? 'w-5 bg-text' : 'w-1.5 bg-divider')} />
            ))}
          </p>
          <h2 id="tour-title" className="mt-4 font-[family-name:var(--font-display)] text-title-lg font-bold leading-tight">
            {t(`${step.id}.title`)}
          </h2>
          <p className="mt-2 text-ui leading-relaxed text-text-secondary">{t(`${step.id}.body`)}</p>
          {last ? (
            <div className="mt-5 flex flex-col gap-2">
              <Link href="/classify" onClick={close} className="inline-flex h-12 items-center justify-center rounded-[var(--radius-button)] bg-accent text-ui font-semibold text-on-accent active:bg-accent-pressed">
                {t('finish.classify')}
              </Link>
              <Button className="h-12" onClick={close}>
                {t('finish.explore')}
              </Button>
            </div>
          ) : (
            <div className="mt-5 flex items-center gap-2">
              <button type="button" onClick={close} className="h-11 px-1 text-ui font-semibold text-text-secondary">
                {t('skip')}
              </button>
              <span className="flex-1" />
              {index > 0 && (
                <Button className="h-11 px-4" onClick={() => go(-1)}>
                  {t('back')}
                </Button>
              )}
              <Button variant="primary" className="h-11 px-5" onClick={next}>
                {t('next')}
              </Button>
            </div>
          )}
        </>
      )}
    </motion.div>
  )

  return (
    <AnimatePresence>
      {visible && (
        <TourLayer spot={null} below={false} reduce={reduce} reserve={300}>
          {card}
        </TourLayer>
      )}
    </AnimatePresence>
  )
}
