'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { IconCheck, IconFlask, IconTarget } from '@/components/icons'
import { Button, useModal } from '@/components/ui/primitives'
import { defaultLocale, isLocale, type Locale } from '@/i18n/locales'
import { useStories } from '@/lib/api/hooks'
import { cx } from '@/lib/format'
import { useUi } from '@/lib/state/ui'
import { useSwitchLocale } from '@/lib/use-switch-locale'

export type LanguageOption = { locale: Locale; name: string; greeting: string; title: string; body: string; pick: string; action: string }

export type TourStep = { id: string; target: string | string[]; text: string; body?: string; icon?: ReactNode }

type HomeStep = { id: 'language' | 'welcome' | 'stories' | 'colours' | 'tools' | 'photo' | 'cards' | 'community' | 'finish'; art?: 'sky' | 'blink'; target?: string }

const HOME_STEPS: HomeStep[] = [
  { id: 'language' },
  { id: 'welcome', art: 'sky' },
  { id: 'stories', target: '[data-tour="home-stories"] li:nth-child(2) button' },
  { id: 'colours', target: 'home-stories' },
  { id: 'tools', target: 'home-tools' },
  { id: 'photo', target: '[data-tour="home-feed"] article a[href^="/p/"] .aspect-square' },
  { id: 'cards', target: 'nav-classify' },
  { id: 'community', target: 'home-community' },
  { id: 'finish', art: 'blink' },
]
const CROSS_TIP = 'crossFeed'

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

const COLD_EXAMPLE = 'wise-0855-0714'

function ColourBars() {
  const t = useTranslations('onboarding.colours')
  const { data } = useStories()
  const screen = data?.stories.find((s) => s.object.id === COLD_EXAMPLE)?.screens.find((s) => s.kind === 'colours')
  if (screen?.kind !== 'colours') return null
  const max = Math.max(1, ...screen.signal.map((v) => v ?? 0))
  return (
    <div className="mt-3" data-testid="tour-colours">
      <div className="grid grid-cols-6 gap-1.5">
        {screen.signal.map((v, i) => (
          <div key={i} className="flex flex-col items-center gap-0.5 text-micro text-text-secondary">
            <span className="flex h-9 w-full items-end overflow-hidden rounded-md bg-surface">
              <span className="block w-full rounded-t-md bg-warning" style={{ height: `${Math.max(v ? 4 : 0, ((v ?? 0) / max) * 100)}%` }} />
            </span>
            {`D${i + 1}`}
          </div>
        ))}
      </div>
      <p className="mt-0.5 flex justify-between text-micro text-text-secondary">
        <span>{t('near')}</span>
        <span>{t('far')}</span>
      </p>
    </div>
  )
}

const TOOLS = [
  { id: 'spot', icon: <IconTarget size={24} /> },
  { id: 'lab', icon: <IconFlask size={24} /> },
] as const

function ToolRows() {
  const t = useTranslations('onboarding.tools')
  return (
    <ul className="mt-3 flex flex-col gap-3" data-testid="tour-tools">
      {TOOLS.map(({ id, icon }) => (
        <li key={id} className="flex items-start gap-3">
          <span className="inline-flex size-6 shrink-0 items-center justify-center" aria-hidden="true">
            {icon}
          </span>
          <p className="min-w-0 text-ui leading-snug">
            <span className="block font-semibold">{t(`${id}.name`)}</span>
            <span className="block text-text-secondary">{t(`${id}.body`)}</span>
          </p>
        </li>
      ))}
    </ul>
  )
}

function pinned(el: HTMLElement): boolean {
  for (let n: HTMLElement | null = el; n; n = n.parentElement) {
    const p = getComputedStyle(n).position
    if (p === 'fixed' || p === 'sticky') return true
  }
  return false
}

function findTarget(target: string | string[]): HTMLElement | null {
  for (const one of typeof target === 'string' ? [target] : target) {
    const el = document.querySelector<HTMLElement>(/^[\w-]+$/.test(one) ? `[data-tour="${one}"]` : one)
    if (el) return el
  }
  return null
}

const TOUR_CARD = 'pointer-events-auto rounded-2xl bg-sheet shadow-[0_12px_40px_rgb(0_0_0/0.35)] ring-1 ring-divider'
const TOUR_PAD = 6
const TOUR_GAP = 10
const TOUR_EDGE = 12
const TOUR_TOP = 60
const TOUR_WAIT_FRAMES = 45

function useTargetBox(target: string | string[] | undefined, reduce: boolean, follow: boolean, reserve: number) {
  const [box, setBox] = useState<Box | null>(null)
  const [missing, setMissing] = useState(false)
  const key = typeof target === 'string' ? target : target?.join('|')
  const room = useRef(reserve)
  useEffect(() => {
    room.current = reserve
  }, [reserve])
  useLayoutEffect(() => {
    setBox(null)
    setMissing(false)
    if (!key) return
    const wanted = key.split('|')
    let raf = 0
    let tries = 0
    let el: HTMLElement | null = null
    let lastScroll = 0
    const measure = () => {
      if (el && !el.isConnected) el = findTarget(wanted)
      if (!el) return
      const r = el.getBoundingClientRect()
      setBox((b) => (b && b.top === r.top && b.left === r.left && b.width === r.width && b.height === r.height ? b : { top: r.top, left: r.left, width: r.width, height: r.height }))
    }
    const keepInView = () => {
      if (!follow || !el || pinned(el)) return
      const r = el.getBoundingClientRect()
      const delta = r.top - TOUR_TOP
      const hidden = r.top < TOUR_TOP - TOUR_PAD * 2 || r.bottom > window.innerHeight - room.current - TOUR_PAD - TOUR_GAP - TOUR_EDGE
      if (!hidden || Math.abs(delta) < 4) return
      const end = document.documentElement.scrollHeight - window.innerHeight
      if ((delta < 0 && window.scrollY <= 0) || (delta > 0 && window.scrollY >= end - 1)) return
      window.scrollBy({ top: delta, behavior: reduce ? 'auto' : 'smooth' })
    }
    const find = () => {
      el = findTarget(wanted)
      if (!el) {
        if (++tries > TOUR_WAIT_FRAMES) setMissing(true)
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
  }, [key, reduce, follow])
  return { box, missing }
}

const ignoreEscape = () => undefined

function TourLayer({ spot, reduce, onEscape = ignoreEscape, onHeight, children }: { spot: Box | null; reduce: boolean; onEscape?: () => void; onHeight?: (h: number) => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(0)
  useModal(ref, true, onEscape)
  useLayoutEffect(() => {
    const el = card.current
    if (!el) return
    const read = () => {
      setHeight(el.offsetHeight)
      if (el.offsetHeight) onHeight?.(el.offsetHeight)
    }
    read()
    const observer = new ResizeObserver(read)
    observer.observe(el)
    return () => observer.disconnect()
  }, [onHeight])
  const screen = typeof window === 'undefined' ? { w: 0, h: 0 } : { w: window.innerWidth, h: window.innerHeight }
  const hole = spot && {
    top: Math.max(TOUR_PAD / 2, spot.top - TOUR_PAD),
    bottom: Math.min(screen.h - TOUR_PAD / 2, spot.top + spot.height + TOUR_PAD),
    left: Math.max(TOUR_PAD / 2, spot.left - TOUR_PAD),
    right: Math.min(screen.w - TOUR_PAD / 2, spot.left + spot.width + TOUR_PAD),
  }
  let top = TOUR_EDGE
  if (hole) {
    const below = hole.bottom + TOUR_GAP
    const above = hole.top - TOUR_GAP - height
    if (below + height + TOUR_EDGE <= screen.h) top = below
    else if (above >= TOUR_EDGE) top = above
    else if (screen.h - hole.bottom > hole.top) top = screen.h - height - TOUR_EDGE
  }
  return (
    <motion.div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="tour-title" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[65] outline-none">
      {hole ? (
        <motion.div
          aria-hidden="true"
          className="absolute rounded-2xl shadow-[0_0_0_9999px_var(--color-media-scrim)] ring-2 ring-accent"
          initial={false}
          animate={{ top: hole.top, left: hole.left, width: Math.max(0, hole.right - hole.left), height: Math.max(0, hole.bottom - hole.top) }}
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 36 }}
        />
      ) : (
        <div aria-hidden="true" className="absolute inset-0 bg-media-scrim" />
      )}
      <div className="pointer-events-none relative mx-auto h-full max-w-[var(--width-app)] px-4">
        <div ref={card} aria-live="polite" className={cx('absolute inset-x-4', !hole && 'top-1/2 -translate-y-1/2')} style={hole ? { top } : undefined}>
          {children}
        </div>
      </div>
    </motion.div>
  )
}

function StepDots({ index, total, label }: { index: number; total: number; label: string }) {
  return (
    <p className="mb-3 flex items-center gap-1.5" role="img" aria-label={label}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={cx('h-1.5 rounded-full transition-all', i === index ? 'w-5 bg-text' : 'w-1.5 bg-divider')} />
      ))}
    </p>
  )
}

function TourButtons({ labels, back, onSkip, onBack, onNext }: { labels: { skip: string; back: string; next: string }; back: boolean; onSkip: () => void; onBack: () => void; onNext: () => void }) {
  return (
    <div className="mt-4 flex items-center gap-2">
      <button type="button" onClick={onSkip} className="h-11 px-1 text-ui font-semibold text-text-secondary">
        {labels.skip}
      </button>
      <span className="flex-1" />
      {back && (
        <Button className="h-11 px-4" onClick={onBack}>
          {labels.back}
        </Button>
      )}
      <Button variant="primary" className="h-11 px-5" onClick={onNext}>
        {labels.next}
      </Button>
    </div>
  )
}

function StepText({ title, body, icon }: { title: string; body?: string; icon?: ReactNode }) {
  if (!body)
    return (
      <p id="tour-title" className="text-title-sm font-semibold leading-snug">
        {title}
      </p>
    )
  return (
    <>
      <h2 id="tour-title" className="flex items-center gap-2 font-[family-name:var(--font-display)] text-title-md font-bold leading-tight">
        {icon && (
          <span className="shrink-0" aria-hidden="true">
            {icon}
          </span>
        )}
        {title}
      </h2>
      <p className="mt-1.5 text-ui leading-snug text-text-secondary">{body}</p>
    </>
  )
}

export function ScreenTour({
  steps,
  labels,
  onClose,
  onStep,
}: {
  steps: TourStep[]
  labels: { skip: string; back: string; next: string; done?: string; step?: (n: number, total: number) => string }
  onClose: () => void
  onStep?: (id: string) => void
}) {
  const reduce = useReducedMotion() ?? false
  const [index, setIndex] = useState(0)
  const forward = useRef(true)
  const step = steps[index]
  const { box, missing } = useTargetBox(step?.target, reduce, false, 0)
  const move = useCallback(
    (d: number) => {
      forward.current = d > 0
      const to = index + d
      if (to >= steps.length) onClose()
      else if (to >= 0) setIndex(to)
      else {
        forward.current = true
        setIndex(index + 1)
      }
    },
    [index, onClose, steps.length],
  )
  useEffect(() => {
    if (missing) move(forward.current ? 1 : -1)
  }, [missing, move])
  const id = step?.id
  const enter = useRef(onStep)
  useEffect(() => {
    enter.current = onStep
  }, [onStep])
  useEffect(() => {
    if (id) enter.current?.(id)
  }, [id])
  if (!step) return null
  const last = index === steps.length - 1
  return (
    <TourLayer spot={box} reduce={reduce} onEscape={onClose}>
      {box && (
        <motion.div key={step.id} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className={cx(TOUR_CARD, step.body ? 'p-4' : 'p-5')} data-testid="screen-tour" data-step={step.id}>
          {labels.step && <StepDots index={index} total={steps.length} label={labels.step(index + 1, steps.length)} />}
          <StepText title={step.text} body={step.body} icon={step.icon} />
          <TourButtons labels={{ ...labels, next: last && labels.done ? labels.done : labels.next }} back={index > 0} onSkip={onClose} onBack={() => move(-1)} onNext={() => move(1)} />
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
  const markTip = useUi((s) => s.markTip)
  const reduce = useReducedMotion() ?? false
  const [at, setAt] = useState(0)
  const [tick, setTick] = useState(0)
  const [reserve, setReserve] = useState(190)
  const [hydrated, setHydrated] = useState(false)
  const forward = useRef(true)
  useEffect(() => setHydrated(true), [])
  const visible = hydrated && (!language || (!done && path === '/'))
  const index = language ? Math.max(1, at) : 0
  const step = HOME_STEPS[index] ?? HOME_STEPS[0]!
  const { box, missing } = useTargetBox(visible ? step.target : undefined, reduce, true, reserve)
  useEffect(() => {
    if (reduce || !visible || !step.art) return
    const timer = setInterval(() => setTick((x) => x + 1), 700)
    return () => clearInterval(timer)
  }, [reduce, visible, step.art])

  const go = useCallback(
    (d: number) => {
      forward.current = d > 0
      setAt(Math.max(1, Math.min(HOME_STEPS.length - 1, index + d)))
    },
    [index],
  )
  const next = useCallback(() => go(1), [go])
  useEffect(() => {
    if (missing) go(forward.current ? 1 : -1)
  }, [missing, go])
  useEffect(() => {
    if (visible && step.id === 'photo' && box) markTip(CROSS_TIP)
  }, [visible, step.id, box, markTip])
  const close = () => {
    finish()
    setAt(0)
    window.scrollTo({ top: 0 })
  }

  const labels = { skip: t('skip'), back: t('back'), next: t('next') }
  const dots = <StepDots index={index - 1} total={HOME_STEPS.length - 1} label={t('step', { n: index, total: HOME_STEPS.length - 1 })} />
  const enter = { initial: reduce ? (false as const) : { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.25 } }
  const card =
    step.id === 'language' ? (
      <motion.div key="language" {...enter} className={cx(TOUR_CARD, 'p-5')}>
        <LanguageStep options={options} reduce={reduce} onDone={next} />
      </motion.div>
    ) : step.target ? (
      box && (
        <motion.div key={step.id} {...enter} className={cx(TOUR_CARD, 'p-4')} data-testid="home-tour" data-step={step.id}>
          {dots}
          {step.id === 'tools' ? (
            <>
              <h2 id="tour-title" className="font-[family-name:var(--font-display)] text-title-md font-bold leading-tight">
                {t('tools.title')}
              </h2>
              <ToolRows />
            </>
          ) : (
            <StepText title={t(`${step.id}.title`)} body={t(`${step.id}.body`)} />
          )}
          {step.id === 'colours' && <ColourBars />}
          <TourButtons labels={labels} back onSkip={close} onBack={() => go(-1)} onNext={next} />
        </motion.div>
      )
    ) : (
      <motion.div key={step.id} {...enter} className={cx(TOUR_CARD, 'p-5')} data-testid="home-tour" data-step={step.id}>
        {step.art && (
          <div className="mb-4">
            <Art kind={step.art} tick={tick} />
          </div>
        )}
        {dots}
        <h2 id="tour-title" className="font-[family-name:var(--font-display)] text-title-lg font-bold leading-tight">
          {t(`${step.id}.title`)}
        </h2>
        <p className="mt-2 text-ui leading-relaxed text-text-secondary">{t(`${step.id}.body`)}</p>
        {step.id === 'finish' ? (
          <div className="mt-5 flex flex-col gap-2">
            <Link href="/classify" onClick={close} className="inline-flex h-12 items-center justify-center rounded-[var(--radius-button)] bg-accent text-ui font-semibold text-on-accent active:bg-accent-pressed">
              {t('finish.classify')}
            </Link>
            <Button className="h-12" onClick={close}>
              {t('finish.explore')}
            </Button>
            <button type="button" onClick={() => go(-1)} className="h-11 text-ui font-semibold text-text-secondary">
              {t('back')}
            </button>
          </div>
        ) : (
          <TourButtons labels={labels} back={false} onSkip={close} onBack={() => go(-1)} onNext={next} />
        )}
      </motion.div>
    )

  return (
    <AnimatePresence>
      {visible && (
        <TourLayer spot={step.target ? box : null} reduce={reduce} onHeight={setReserve}>
          {card}
        </TourLayer>
      )}
    </AnimatePresence>
  )
}
