'use client'

import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useOffsetLabel } from '@/components/classify/photo-viewer'
import { ANSWER_ICONS, AnswerFace, AnswerPanel, CardBehind, FrameBars, GestureHint, PhotoBar, photoFrame, photoInset, SwapStage, SwapStamps, SWIPE, swapButton, ToolsPanel } from '@/components/classify/swap-photo'
import { KnownSheet, PhotoSourceSheet, SwapHelpSheet, UnderstandSheet } from '@/components/classify/swap-sheets'
import { VoiceMark } from '@/components/classify/voices'
import { IconArrowRight, IconBack, IconCards, IconCheck, IconClose, IconInfo, IconMoves, IconQuestion, IconShare, IconTarget, IconUndo, IconWarning } from '@/components/icons'
import { usePlayback } from '@/components/player/use-playback'
import { LoginForm } from '@/components/shell/login-sheet'
import { ScreenTour } from '@/components/shell/onboarding'
import { Button, EmptyState, IconButton, Sheet, Skeleton, TopBar } from '@/components/ui/primitives'
import { api, ApiError, unwrap, type DeckCard } from '@/lib/api/client'
import { cx, formatDate } from '@/lib/format'
import { useCommunityOverview, useGoals, useGuideCard, useSession, useVote, type VotePosition } from '@/lib/api/hooks'
import type { CardHint } from '@/lib/explore/flashlight'
import { exploreQueue, isSkyCard, type SkyPlayCard } from '@/lib/explore/queue'
import { hasOutsideArea } from '@/lib/out-of-field'
import { knownName, verdictOf, type Answer } from '@/lib/swap-verdict'
import { useUi } from '@/lib/state/ui'
import { useShare } from '@/lib/share'
import { useFmt } from '@/lib/use-fmt'

type VoteResult = NonNullable<ReturnType<typeof useVote>['data']>
type Mark = { u: number; v: number }
type PlayCard = DeckCard | SkyPlayCard
type Lesson = 'moves' | 'still' | 'glitch'
type Mode = 'look' | 'tools' | 'confirm' | 'sending' | 'sent' | 'past' | 'failed' | 'result'
type Pending = { card: PlayCard; answer: Answer; spot: VotePosition | null; at: number; hints: boolean }
type GuideData = NonNullable<ReturnType<typeof useGuideCard>['data']>
type WelcomeExample = GuideData['examples'][number]
type WelcomeStepPlan = { key: 'intro' | 'still' | 'moves' | 'particle' | 'streak' | 'unsure'; example?: WelcomeExample['example']; swipe?: { x: number; up: boolean; arrow: string }; follow?: boolean; spot?: { u: number; v: number; r: number }; tap?: boolean; hold?: number }
type WelcomeStep = WelcomeStepPlan & { card: DeckCard; marks: Mark[] }
type Strip = { kind: 'known'; name: string } | { kind: 'badge'; name: string } | { kind: 'fast' } | { kind: 'failed'; answer: Answer }

const NOTICE_MS = 5000
const FRAME_MS = 700
const INTRO_FRAME_MS = 800
const EXAMPLE_FRAME_MS = 1000
const DEMO_WAIT_MS = 300
const DEMO_RESET_S = 0.2
const DEMO_TOP_CLEAR_PX = 4
const DEMO_STAMP_UP_PX = 24
const DEMO_GESTURE = { duration: 2.9, times: [0, 0.5 / 2.9, 0.9 / 2.9, 1.4 / 2.9, 1], ease: 'easeInOut' as const, repeat: Infinity }
const SPOT_RADIUS = 12
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
const SHEET_MAX = 'max-h-[calc(100dvh-80px-var(--swap-photo)-env(safe-area-inset-top))]'
const STEP_TITLE = 'font-[family-name:var(--font-display)] font-bold leading-tight [text-wrap:balance]'
const STEP_BODY = 'text-title-sm leading-[1.4] text-text-secondary [@media(min-height:700px)]:text-title-md'
const LEAVE_MS = 360
const SWING_PX = 64
const SWING_S = 1.3
const SWING_WAIT_MS = 2500
const SWAP_TOUR_TIP = 'swapTour'
const PAUSE_EVERY = 25
const NO_MARKS: Mark[] = []
const BLACK_EDGE_TIP = 'blackEdge'
const SHELL_STYLE = { '--swap-photo': 'max(200px, min(calc(min(100vw, var(--width-app)) - 24px), calc(100dvh - 330px - env(safe-area-inset-top) - env(safe-area-inset-bottom))))' } as CSSProperties

const preloaded = new Map<string, HTMLImageElement>()

function preloadSprite(src: string) {
  if (preloaded.has(src)) return
  const el = new Image()
  el.src = src
  preloaded.set(src, el)
}

function useSprite(src: string | undefined) {
  const [img, setImg] = useState<{ src: string; el: HTMLImageElement } | null>(null)
  useEffect(() => {
    if (!src) return
    const ready = preloaded.get(src)
    preloaded.delete(src)
    if (ready?.complete && ready.naturalHeight) {
      setImg({ src, el: ready })
      return
    }
    const el = ready ?? new Image()
    let live = true
    el.onload = () => live && setImg({ src, el })
    el.src = src
    return () => {
      live = false
    }
  }, [src])
  return img && img.src === src ? img.el : null
}

function SwapShell({ children }: { children: ReactNode }) {
  return (
    <div style={SHELL_STYLE} className="fixed inset-0 z-[45] mx-auto flex max-w-[var(--width-app)] flex-col overflow-hidden bg-bg pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]" data-testid="swap-screen">
      {children}
    </div>
  )
}

function SwapHeader({ step, top, leave = '/', onHelp, onToolsBack }: { step?: string | null; top?: ReactNode; leave?: string; onHelp: () => void; onToolsBack?: () => void }) {
  const t = useTranslations('classify')
  return (
    <header className="flex h-[52px] shrink-0 items-center gap-1 px-1">
      {onToolsBack ? (
        <IconButton label={t('tools.back')} onClick={onToolsBack} className="size-12">
          <IconBack size={28} />
        </IconButton>
      ) : (
        <Link href={leave} aria-label={t('leave')} className="flex size-12 shrink-0 items-center justify-center rounded-full text-text active:bg-surface">
          <IconClose size={28} />
        </Link>
      )}
      <div className="min-w-0 flex-1 text-center">
        {onToolsBack ? <h1 className="truncate text-[18px] font-bold leading-tight">{t('tools.open')}</h1> : (top ?? (step && <p className="truncate text-ui font-semibold leading-tight text-text-secondary">{step}</p>))}
      </div>
      <IconButton label={t('help.open')} onClick={onHelp} className="size-12">
        <IconQuestion size={26} />
      </IconButton>
    </header>
  )
}

function GuideRing({ mark }: { mark: Mark | undefined }) {
  if (!mark) return null
  return (
    <svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 100 100" aria-hidden="true" data-testid="guide-ring">
      <circle cx={mark.u * 100} cy={mark.v * 100} r="8" fill="none" stroke="var(--color-mark-halo)" strokeWidth="2" opacity="0.6" />
      <circle cx={mark.u * 100} cy={mark.v * 100} r="8" fill="none" stroke="var(--color-on-media)" strokeWidth="1.1" />
    </svg>
  )
}

function useSpriteSet(srcs: string[]) {
  const [loaded, setLoaded] = useState<Record<string, HTMLImageElement>>({})
  const key = srcs.join('|')
  useEffect(() => {
    let live = true
    for (const src of new Set(key.split('|'))) {
      const el = new Image()
      el.onload = () => live && setLoaded((now) => ({ ...now, [src]: el }))
      el.src = src
    }
    return () => {
      live = false
    }
  }, [key])
  return loaded
}

function Spotlight({ u, v, r }: { u: number; v: number; r: number }) {
  const id = useId().replace(/\W/g, '')
  const reduce = useReducedMotion()
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="pointer-events-none absolute inset-0 size-full" data-testid="spotlight">
      <defs>
        <mask id={id}>
          <rect width="100" height="100" fill="white" />
          <motion.circle initial={false} animate={{ cx: u * 100, cy: v * 100, r }} transition={{ duration: reduce ? 0 : 0.3, ease: 'easeInOut' }} fill="black" data-testid="spotlight-hole" />
        </mask>
      </defs>
      <rect width="100" height="100" fill="var(--color-media-scrim)" mask={`url(#${id})`} />
    </svg>
  )
}

function WelcomePhoto({ step, index, sprites }: { step: WelcomeStep; index: number; sprites: Record<string, HTMLImageElement> }) {
  const tp = useTranslations('player')
  const canvas = useRef<HTMLCanvasElement>(null)
  const gap = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const rotate = useTransform(x, [-240, 240], [-6, 6])
  const [frame, setFrame] = useState(0)
  const img = sprites[step.card.sprite]
  const frames = Math.max(1, step.card.offsets_s.length)
  const { swipe, hold = 0 } = step
  const frameMs = step.example ? EXAMPLE_FRAME_MS : INTRO_FRAME_MS
  useEffect(() => {
    if (reduce) {
      x.set(0)
      y.set(0)
      return
    }
    const moves = [animate(x, 0, { duration: DEMO_RESET_S }), animate(y, 0, { duration: DEMO_RESET_S })]
    const timer = swipe
      ? setTimeout(() => {
          const up = swipe.up ? (gap.current?.offsetHeight ?? 0) - DEMO_TOP_CLEAR_PX : 0
          moves.push(animate(x, [0, swipe.x, swipe.x, 0, 0], DEMO_GESTURE), animate(y, [0, -up, -up, 0, 0], DEMO_GESTURE))
        }, DEMO_WAIT_MS)
      : undefined
    return () => {
      clearTimeout(timer)
      moves.forEach((m) => m.stop())
    }
  }, [index, reduce, swipe, x, y])
  useEffect(() => {
    setFrame(0)
    if (reduce || frames < 2) return
    const timer = setInterval(() => setFrame((f) => f + 1), frameMs)
    return () => clearInterval(timer)
  }, [frameMs, frames, index, reduce])
  const at = (reduce ? hold : frame) % frames
  useEffect(() => {
    const c = canvas.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx || !img) return
    const tile = Math.round(img.naturalHeight / 2)
    if (c.width !== tile) c.width = tile
    if (c.height !== tile) c.height = tile
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(img, at * tile, 0, tile, tile, 0, 0, tile, tile)
  }, [at, img])
  const mark = step.marks[at] ?? step.marks[0]
  const spot = step.follow && mark ? { u: mark.u, v: mark.v, r: SPOT_RADIUS } : step.spot
  return (
    <>
      <div ref={gap} className="flex h-[var(--welcome-up)] shrink-0 items-center justify-center" data-testid="welcome-gap">
        {step.tap && (
          <p className="text-ui font-semibold leading-none" data-testid="welcome-counter">
            {tp('counter', { n: at + 1, total: frames })}
          </p>
        )}
      </div>
      <div className="relative flex shrink-0 justify-center overflow-x-clip pb-1.5" aria-hidden="true" data-testid="swipe-demo-slot">
        <CardBehind size="var(--welcome-photo)" />
        <motion.div style={{ x, y, rotate, width: 'var(--welcome-photo)', height: 'var(--welcome-photo)' }} className={cx(photoFrame, 'shrink-0')} data-testid="swipe-demo" data-sprite={step.card.sprite} data-frame={at}>
          <div className={photoInset}>
            <canvas ref={canvas} className="pixelated block size-full" />
            {spot && <Spotlight u={spot.u} v={spot.v} r={spot.r} />}
          </div>
          {swipe && !reduce && <GestureHint x={x} y={y} />}
          <SwapStamps x={x} y={y} upFull={DEMO_STAMP_UP_PX} />
        </motion.div>
      </div>
    </>
  )
}

function Welcome({ lesson, examples, count, onStart, onSkip }: { lesson: { card: DeckCard }; examples: WelcomeExample[]; count: number; onStart: () => void; onSkip: () => void }) {
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

function Trained({ onStart }: { onStart: () => void }) {
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

function HintRings({ hints, panel }: { hints: CardHint[]; panel: number }) {
  return (
    <>
      {hints.map((h, i) => (
        <VoiceMark key={i} voice="program" u={h.u} v={h.v} faint={h.visit !== panel} />
      ))}
    </>
  )
}

function useHintLine(hints: CardHint[] | null, panel: number): string | null {
  const t = useTranslations('classify.flashlight')
  if (!hints) return null
  const here = hints.find((h) => h.visit === panel)
  return here ? t(`kinds.${here.kind}`) : hints.length ? t('elsewhere') : t('none')
}

function useOutside(img: HTMLImageElement | null, n: number) {
  const [outside, setOutside] = useState<boolean[]>([])
  useEffect(() => {
    if (!img) return
    const tile = Math.round(img.naturalHeight / 2)
    setOutside(Array.from({ length: n }, (_, i) => hasOutsideArea(img, i * tile, 0, tile)))
  }, [img, n])
  return outside
}

function BottomSheet({ children, label, testId }: { children: ReactNode; label?: string; testId?: string }) {
  const reduce = useReducedMotion()
  return (
    <motion.section
      initial={reduce ? false : { y: '105%' }}
      animate={{ y: 0 }}
      transition={{ duration: 0.38, ease: [0.2, 0.9, 0.2, 1] }}
      aria-label={label}
      aria-labelledby={label ? undefined : 'confirm-title'}
      className={cx('absolute inset-x-0 bottom-0 z-20 flex flex-col overflow-y-auto rounded-t-[26px] bg-sheet px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-12px_40px_rgb(0_0_0/0.45)]', SHEET_MAX)}
      data-testid={testId}
    >
      <span aria-hidden="true" className="mx-auto mb-4 block h-1 w-9 shrink-0 rounded-sm bg-divider" />
      {children}
    </motion.section>
  )
}

function ConfirmSheet({ card, answer, busy, past, onUndo, onConfirm, onAbout, onShare, onSkip }: { card: PlayCard; answer: Answer; busy: boolean; past: boolean; onUndo: () => void; onConfirm: () => void; onAbout: () => void; onShare?: () => void; onSkip: () => void }) {
  const t = useTranslations('classify')
  const fmt = useFmt()
  const Icon = ANSWER_ICONS[answer]
  const sky = isSkyCard(card) ? card : null
  return (
    <BottomSheet testId="swap-confirm">
      <div className="flex shrink-0 items-center gap-3.5">
        <span className={cx('grid size-[52px] shrink-0 place-items-center rounded-full', answer === 'moves' ? 'bg-accent text-on-accent' : 'bg-text text-bg')} data-testid="confirm-badge">
          <Icon size={28} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-ui leading-tight text-text-secondary">{t('confirm.yours')}</p>
          <h2 id="confirm-title" className="text-title-lg font-bold leading-tight tracking-[-0.01em]">
            {t(`confirm.${answer}`)}
          </h2>
        </div>
        {onShare && (
          <IconButton label={t('share.label')} onClick={onShare} className="size-12" data-testid="share-card">
            <IconShare size={24} />
          </IconButton>
        )}
      </div>
      {past && (
        <p role="status" className="mt-3 shrink-0 text-ui font-semibold leading-snug">
          {t('share.already')}
        </p>
      )}
      <button type="button" onClick={onAbout} className="mt-3.5 flex w-full shrink-0 items-center gap-2.5 border-t border-divider py-2.5 text-left text-ui leading-[1.35] text-text-secondary" data-testid="confirm-source">
        <IconInfo size={20} className="shrink-0" />
        <span className="min-w-0">
          <span className="block truncate">{sky ? t('confirm.source', { date: formatDate(sky.t0, fmt.locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) }) : t('confirm.sourceShort')}</span>
          {sky && <span className="block truncate tabular-nums">{t('confirm.where', { ra: fmt.fixed(sky.ra, 4), dec: `${sky.dec >= 0 ? '+' : ''}${fmt.fixed(sky.dec, 4)}` })}</span>}
        </span>
      </button>
      <div className="mt-2 flex shrink-0 gap-2.5">
        {past ? (
          <button type="button" onClick={onSkip} className="flex h-[54px] flex-1 items-center justify-center rounded-2xl bg-accent text-[17px] font-semibold text-on-accent active:bg-accent-pressed">
            {t('next')}
          </button>
        ) : (
          <>
            <button type="button" disabled={busy} onClick={onUndo} className="flex h-[54px] flex-1 items-center justify-center gap-2 rounded-2xl bg-surface text-[17px] font-semibold active:bg-surface-pressed disabled:opacity-50">
              <IconUndo size={22} />
              {t('undo')}
            </button>
            <button type="button" disabled={busy} aria-busy={busy} onClick={onConfirm} className="flex h-[54px] flex-[1.5] items-center justify-center rounded-2xl bg-accent text-[17px] font-semibold text-on-accent active:bg-accent-pressed disabled:opacity-45">
              {t('confirm.confirm')}
            </button>
          </>
        )}
      </div>
    </BottomSheet>
  )
}

function SpotMark({ u, v, faint }: { u: number; v: number; faint: boolean }) {
  const reduce = useReducedMotion()
  return (
    <span aria-hidden="true" className={cx('pointer-events-none absolute size-11 -translate-x-1/2 -translate-y-1/2', faint && 'opacity-50')} style={{ left: `${u * 100}%`, top: `${v * 100}%` }} data-testid="spot-mark">
      <motion.span
        initial={reduce ? false : { scale: 0.3, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 520, damping: 16 }}
        className="absolute inset-0 rounded-full border-[2.5px] border-accent shadow-[0_0_0_2px_color-mix(in_srgb,var(--color-mark-halo)_60%,transparent),inset_0_0_0_2px_color-mix(in_srgb,var(--color-mark-halo)_60%,transparent)]"
      />
      {!reduce && <motion.span className="absolute -inset-2.5 rounded-full border-2 border-accent" initial={{ scale: 0.6, opacity: 0.8 }} animate={{ scale: [0.6, 1.3], opacity: [0.8, 0] }} transition={{ duration: 1.6, ease: 'easeOut', repeat: Infinity }} />}
    </span>
  )
}

function SwapCard({
  card,
  img,
  step,
  lesson,
  lessonMarks,
  lastLesson,
  firstLesson,
  top,
  leave,
  past,
  onHelp,
  onAnswer,
  onShare,
  onSkip,
  onLessonStale,
  onLessonNext,
}: {
  card: PlayCard
  img: HTMLImageElement | null
  step: string | null
  lesson: Lesson | null
  lessonMarks: Mark[]
  lastLesson: boolean
  firstLesson: boolean
  top?: ReactNode
  leave?: string
  past?: Answer | null
  onHelp: () => void
  onShare?: () => void
  onSkip?: () => void
  onAnswer: (answer: Answer, spot: VotePosition | null, at: number, hints: boolean) => void
  onLessonStale: () => void
  onLessonNext: () => void
}) {
  const t = useTranslations('classify')
  const tw = useTranslations('classify.welcome')
  const tp = useTranslations('player')
  const label = useOffsetLabel()
  const reduce = useReducedMotion()
  const vote = useVote()
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const [mode, setMode] = useState<Mode>(past ? 'past' : 'look')
  const [answer, setAnswer] = useState<Answer | null>(past ?? null)
  const [chosenAt, setChosenAt] = useState(0)
  const [aboutOpen, setAboutOpen] = useState(false)
  const sentOnce = useRef(false)
  const [spot, setSpot] = useState<VotePosition | null>(null)
  const [saved, setSaved] = useState<VoteResult | null>(null)
  const [frozen, setFrozen] = useState(false)
  const [row, setRow] = useState<0 | 1>(0)
  const [understand, setUnderstand] = useState(false)
  const [sawIt, setSawIt] = useState(false)
  const [shownIt, setShownIt] = useState(false)
  const [retry, setRetry] = useState(false)
  const [swingOver, setSwingOver] = useState(false)
  const [leaving, setLeaving] = useState<Answer | null>(null)
  const sky = isSkyCard(card) ? card : null
  const [hintsOn, setHintsOn] = useState(false)
  const [hintsUsed, setHintsUsed] = useState(false)
  const offsets = card.offsets_s
  const n = Math.max(1, offsets.length)
  const playback = usePlayback(n, { baseMs: FRAME_MS, autoplay: !reduce || !!lesson, frozen })
  const panel = playback.index
  const { setPlaying, stopBlink } = playback
  const hints = sky && hintsOn ? sky.hints : null
  const outside = useOutside(img, n)
  const blackSeen = useUi((s) => s.tipsSeen.includes(BLACK_EDGE_TIP))
  const markTip = useUi((s) => s.markTip)
  const tourSeen = useUi((s) => s.tipsSeen.includes(SWAP_TOUR_TIP))
  const touring = firstLesson && !tourSeen && !!img
  const [blackNote, setBlackNote] = useState(false)
  const hintLine = useHintLine(hints, panel)
  const verdict = lesson && saved && answer ? verdictOf(saved.reveal, answer, true) : null

  const settle = useCallback(() => {
    animate(x, 0, { type: 'spring', stiffness: 500, damping: 32 })
    animate(y, 0, { type: 'spring', stiffness: 500, damping: 32 })
  }, [x, y])

  const undoChoice = () => {
    settle()
    setAnswer(null)
    setSpot(null)
    setMode('look')
    setPlaying(!reduce || !!lesson)
  }

  const sendLesson = useCallback(
    async (a: Answer) => {
      setMode('sending')
      try {
        const r = await vote.mutateAsync({ card_id: card.id, choice: a === 'glitch' ? 'still' : a, ...(a === 'glitch' ? { glitch: true } : {}) })
        setSaved(r)
        setMode('result')
        setPlaying(true)
      } catch (err) {
        if (err instanceof ApiError && (err.code === 'already_voted' || err.code === 'card_not_issued')) {
          onLessonStale()
          return
        }
        setMode('failed')
      }
    },
    [card.id, onLessonStale, setPlaying, vote],
  )

  useEffect(() => {
    if (mode !== 'tools') stopBlink()
  }, [mode, stopBlink])

  const choose = (a: Answer) => {
    if (!img || mode === 'sending' || mode === 'sent' || mode === 'past') return
    settle()
    setRow(0)
    setSpot(null)
    setAnswer(a)
    if (lesson && saved) {
      setMode('result')
      setPlaying(true)
      return
    }
    if (mode !== 'confirm') setChosenAt(performance.now())
    setMode('confirm')
  }

  const confirm = () => {
    if (!answer || mode !== 'confirm' || sentOnce.current) return
    if (lesson) {
      void sendLesson(answer)
      return
    }
    sentOnce.current = true
    setMode('sent')
    setLeaving(answer)
    onAnswer(answer, answer === 'moves' ? spot : null, chosenAt, hintsUsed)
  }

  useEffect(() => {
    if (lesson || !outside[panel] || blackSeen) return
    setBlackNote(true)
    markTip(BLACK_EDGE_TIP)
  }, [blackSeen, lesson, markTip, outside, panel])

  const looking = mode === 'look' || mode === 'tools'
  const mustLookFirst = lesson === 'moves' && !sawIt && !retry
  const canSwipe = looking && !!img && !mustLookFirst && !touring
  const swinging = !!lesson && !reduce && !swingOver && mode === 'look' && !!img && !mustLookFirst && !touring

  useEffect(() => {
    if (!swinging) return
    let side = -1
    let timer: ReturnType<typeof setTimeout> | undefined
    let move: ReturnType<typeof animate> | undefined
    const queue = () => {
      timer = setTimeout(() => {
        const to = side * SWING_PX
        move = animate(x, [0, to, to, 0], {
          duration: SWING_S,
          times: [0, 0.35, 0.65, 1],
          ease: 'easeInOut',
          onComplete: () => {
            side = -side
            queue()
          },
        })
      }, SWING_WAIT_MS)
    }
    queue()
    const stop = () => setSwingOver(true)
    window.addEventListener('pointerdown', stop, { capture: true })
    return () => {
      clearTimeout(timer)
      move?.stop()
      window.removeEventListener('pointerdown', stop, { capture: true })
      settle()
    }
  }, [settle, swinging, x])

  const onRelease = (dx: number, dy: number, vx: number, vy: number) => {
    const sideways = Math.abs(dx) >= Math.abs(dy)
    if (sideways && (dx > SWIPE || vx > 700)) choose('moves')
    else if (sideways && (dx < -SWIPE || vx < -700)) choose('still')
    else if (!sideways && (dy < -SWIPE || vy < -700)) choose('unsure')
    else settle()
  }

  const marking = !lesson && mode === 'confirm' && answer === 'moves'
  const onTap = (u: number, v: number) => {
    if (marking) {
      setSpot({ frame: panel, x: Math.round(u * 1e4) / 1e4, y: Math.round(v * 1e4) / 1e4 })
      setPlaying(false)
    } else if (looking || mode === 'result' || mode === 'confirm') setPlaying(!playback.playing)
  }

  const mark = saved?.reveal.marks[panel]
  const ringOn = looking && (lesson === 'glitch' || (lesson === 'moves' && (shownIt || retry)))
  const overlay = (
    <>
      {ringOn && <GuideRing mark={lessonMarks[panel] ?? lessonMarks[0]} />}
      {hints && <HintRings hints={hints} panel={panel} />}
      {mode === 'result' && mark && verdict?.mark && <VoiceMark voice="known" u={mark.u} v={mark.v} />}
      {spot && <SpotMark u={spot.x} v={spot.y} faint={spot.frame !== panel} />}
    </>
  )

  const labels = { still: t('still'), moves: t('moves'), glitch: t('glitch'), unsure: t('unsure') }
  const note = hintLine ?? (blackNote && outside[panel] ? tp('outside') : null)

  const deciding = !!answer && (mode === 'confirm' || mode === 'sending' || mode === 'sent' || mode === 'past')
  const sheetOpen = deciding || mode === 'result' || mode === 'failed'
  const dim = cx('shrink-0 transition-opacity duration-200', sheetOpen && 'pointer-events-none opacity-30')
  const coach = lesson ? (mustLookFirst ? t('guide.look') : lesson === 'moves' ? t('guide.answer') : t(`guide.${lesson}`)) : null

  return (
    <SwapShell>
      <div className={dim} aria-hidden={sheetOpen || undefined}>
        <div className="px-1 pt-2.5">
          <FrameBars n={n} index={panel} />
        </div>
        <SwapHeader step={step} top={marking ? null : top} leave={leave} onHelp={onHelp} onToolsBack={mode === 'tools' ? () => setMode('look') : undefined} />
      </div>
      {marking && (
        <p role="status" aria-live="polite" className="pointer-events-none absolute inset-x-14 top-[calc(env(safe-area-inset-top)+22px)] z-30 flex h-[52px] items-center justify-center gap-2 whitespace-nowrap text-title-sm font-semibold leading-tight" data-testid="mark-hint">
          <IconTarget size={22} className="shrink-0 text-accent" />
          {spot ? t('mark.marked') : t('mark.where')}
        </p>
      )}
      <SwapStage
        img={img}
        sprite={card.sprite}
        panel={panel}
        row={row}
        alt={t('photoAlt', { n: panel + 1, total: n, when: label(offsets[panel] ?? 0) })}
        x={x}
        y={y}
        canSwipe={canSwipe}
        onRelease={onRelease}
        onCancel={settle}
        onTap={onTap}
        onHold={setFrozen}
        overlay={overlay}
        hint={swinging}
        ring={deciding && !leaving ? (answer === 'moves' ? 'yes' : 'chosen') : 'rest'}
        leaving={leaving}
      />
      {mode === 'tools' ? (
        <ToolsPanel
          playback={playback}
          sprite={card.sprite}
          offsets={offsets}
          row={row}
          onRow={setRow}
          hints={
            sky
              ? {
                  on: hintsOn,
                  onChange: (on) => {
                    if (on) setHintsUsed(true)
                    setHintsOn(on)
                  },
                }
              : undefined
          }
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-testid="swap-lower">
          <div className={dim} aria-hidden={sheetOpen || undefined}>
            <PhotoBar playback={playback} offsets={offsets} onTools={() => mode === 'look' && setMode('tools')} />
          </div>
          <div className="min-h-0 flex-1" />
          <div className={cx('shrink-0 px-4 transition-[transform,opacity] duration-300', lesson ? 'pb-4' : 'pb-5', sheetOpen && 'pointer-events-none translate-y-6 opacity-0')} aria-hidden={sheetOpen || undefined} inert={sheetOpen || undefined} data-testid="swap-ask">
            <h1 className={coach || note ? 'sr-only' : 'mb-[18px] text-center text-title-lg font-bold leading-tight tracking-[-0.01em]'}>{t('question')}</h1>
            {coach ? (
              <p role="note" className="mb-3 text-center text-title-sm font-semibold leading-snug [text-wrap:balance]">
                {coach}
              </p>
            ) : (
              note && (
                <p role="status" className="mb-[18px] text-center text-ui leading-snug text-text-secondary [text-wrap:balance]">
                  {note}
                </p>
              )
            )}
            {lesson && mustLookFirst && !touring ? (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSawIt(true)
                    setShownIt(false)
                  }}
                  className={`${swapButton.primary} flex-none`}
                >
                  {t('guide.saw')}
                </button>
                <button type="button" disabled={shownIt} onClick={() => setShownIt(true)} className={`${swapButton.mid} flex-none`}>
                  {shownIt ? t('guide.shown') : t('guide.show')}
                </button>
              </div>
            ) : (
              <AnswerPanel labels={labels} disabled={!img || sheetOpen} x={x} y={y} onChoose={choose} />
            )}
          </div>
        </div>
      )}
      {deciding && answer && !leaving && <ConfirmSheet card={card} answer={answer} busy={mode !== 'confirm'} past={mode === 'past'} onUndo={undoChoice} onConfirm={confirm} onAbout={() => setAboutOpen(true)} onShare={onShare} onSkip={() => onSkip?.()} />}
      {mode === 'failed' && answer && (
        <BottomSheet label={t('failed')}>
          <p role="status" className="text-[16px] font-medium leading-snug text-danger">
            {t('failed')}
          </p>
          <button type="button" onClick={() => void sendLesson(answer)} className={`${swapButton.primary} mt-3 flex-none`}>
            {t('retry')}
          </button>
        </BottomSheet>
      )}
      {mode === 'result' && saved && answer && verdict && (
        <BottomSheet label={t('result.label')} testId="swap-panel">
          <div className="flex shrink-0 flex-col gap-1.5">
            <h2 id="reveal-title" className="text-[21px] font-bold leading-tight [text-wrap:balance]">
              {t(`result.${verdict.title}`, { name: verdict.name ?? '' })}
            </h2>
            <p className="text-[16px] leading-snug text-text-secondary">{t(`result.${verdict.body}`)}</p>
            <p className="text-[15px] font-semibold leading-snug">{t('practice')}</p>
            <div className="mt-1 flex gap-2">
              {verdict.again ? (
                <button
                  type="button"
                  onClick={() => {
                    setRetry(true)
                    setAnswer(null)
                    setSpot(null)
                    setMode('look')
                  }}
                  className={swapButton.big}
                >
                  {t('again')}
                </button>
              ) : (
                <button type="button" onClick={() => setUnderstand(true)} className={swapButton.big}>
                  {t('understand.open')}
                </button>
              )}
              <button type="button" onClick={onLessonNext} className={swapButton.primary}>
                {lastLesson ? t('finish') : t('next')}
              </button>
            </div>
          </div>
        </BottomSheet>
      )}
      <PhotoSourceSheet open={aboutOpen} onClose={() => setAboutOpen(false)} offsets={offsets} sky={sky} />
      {saved && answer && verdict && <UnderstandSheet open={understand} onClose={() => setUnderstand(false)} reveal={saved.reveal} answer={answer} verdict={verdict} />}
      {touring && (
        <ScreenTour
          steps={[
            { id: 'photo', target: 'swap-photo', text: t('tour.photo') },
            { id: 'play', target: 'swap-play', text: t('tour.play') },
            { id: 'tools', target: 'swap-tools', text: t('tour.tools') },
            { id: 'answers', target: 'swap-answers', text: t('tour.answers') },
          ]}
          labels={{ skip: tw('skip'), back: tw('back'), next: tw('next') }}
          onClose={() => markTip(SWAP_TOUR_TIP)}
        />
      )}
    </SwapShell>
  )
}

function DeckSkeleton({ onHelp, line, notice }: { onHelp: () => void; line?: string; notice?: ReactNode }) {
  return (
    <SwapShell>
      <div className="h-[22px] shrink-0" />
      <SwapHeader onHelp={onHelp} />
      <div className="flex shrink-0 justify-center pb-1.5" aria-hidden="true">
        <Skeleton className="rounded-[20px]" style={{ width: 'var(--swap-photo)', height: 'var(--swap-photo)' }} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col" aria-live="polite">
        {notice}
        {line && <p className="my-auto px-6 text-center text-[15px] text-text-secondary">{line}</p>}
      </div>
    </SwapShell>
  )
}

type DeckState = { status: 'loading' | 'searching' | 'ready' | 'done' | 'error'; card: PlayCard | null; past?: Answer | null }

function takeSharedCard(): string | null {
  const url = new URL(window.location.href)
  const id = url.searchParams.get('card')
  if (!id) return null
  url.searchParams.delete('card')
  window.history.replaceState(window.history.state, '', url)
  return id
}

let sharedTask: Promise<DeckState | null> | null = null

function sharedCard(): Promise<DeckState | null> | null {
  const id = takeSharedCard()
  if (id) {
    const task = fetchShared(id)
    sharedTask = task
    void task.finally(() => {
      if (sharedTask === task) sharedTask = null
    })
  }
  return sharedTask
}

async function fetchShared(id: string): Promise<DeckState | null> {
  const r = await api.GET('/api/classify/shared/{id}', { params: { path: { id } } }).catch(() => null)
  return r?.data ? { status: 'ready', card: r.data.card, past: r.data.answered } : null
}

let sessionLooks = 0
let fastWarned = false

async function fetchNext(not: string[]): Promise<DeckState> {
  const skip = not.length ? { not: not.join(',') } : {}
  const query = new URLSearchParams(window.location.search).has('open') ? { explore: true, open: true, ...skip } : { explore: true, ...skip }
  let r = await api
    .GET('/api/classify/next', { params: { query } })
    .then(unwrap)
    .catch(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1200))
      return unwrap(await api.GET('/api/classify/next', { params: { query } }))
    })
  if (r.interesting) {
    const strong = exploreQueue.takeStrong()
    if (strong) return { status: 'ready', card: strong }
  }
  if (r.sky) {
    const sky = exploreQueue.take()
    if (sky) return { status: 'ready', card: sky }
    r = unwrap(await api.GET('/api/classify/next', { params: { query: { explore: true, known: true, ...skip } } }))
  }
  if (r.card) return { status: 'ready', card: r.card }
  return { status: r.sky ? 'searching' : 'done', card: null }
}

function useDeckFlow(enabled: boolean) {
  const [state, setState] = useState<DeckState>({ status: 'loading', card: null })
  const live = useRef(true)
  const next = useRef<{ work: Promise<DeckState>; done: DeckState | null } | null>(null)
  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])

  const prepare = useCallback((not: string[]) => {
    if (next.current) return
    const entry: { work: Promise<DeckState>; done: DeckState | null } = { work: fetchNext(not), done: null }
    next.current = entry
    entry.work.then(
      (s) => {
        entry.done = s
        if (s.card) preloadSprite(s.card.sprite)
      },
      () => {
        if (next.current === entry) next.current = null
      },
    )
  }, [])

  const load = useCallback(async (not: string[] = []) => {
    const sharedLoad = sharedCard()
    const shared = sharedLoad ? await sharedLoad : null
    if (shared) {
      if (live.current) setState(shared)
      return
    }
    const prepared = next.current
    next.current = null
    if (prepared?.done?.status === 'ready') {
      setState(prepared.done)
      return
    }
    setState({ status: 'loading', card: null })
    try {
      const s = prepared ? await prepared.work.catch(() => fetchNext(not)) : await fetchNext(not)
      if (s.status !== 'searching') {
        if (live.current) setState(s)
        return
      }
      if (live.current) setState({ status: 'searching', card: null })
      const sky = await exploreQueue.wait(30_000)
      if (live.current) setState(sky ? { status: 'ready', card: sky } : { status: 'done', card: null })
    } catch {
      if (live.current) setState({ status: 'error', card: null })
    }
  }, [])

  useEffect(() => {
    if (enabled) void load()
  }, [enabled, load])

  return { ...state, reload: load, prepare }
}

function PauseCard({ looks, onContinue }: { looks: number; onContinue: () => void }) {
  const t = useTranslations('classify.rest')
  return (
    <section aria-labelledby="pause-title" className="rounded-2xl border-[0.5px] border-divider bg-bg-elevated px-5 py-6 text-center">
      <h2 id="pause-title" className="font-[family-name:var(--font-display)] text-title-md font-bold">
        {t('title', { n: looks })}
      </h2>
      <p className="mx-auto mt-2 max-w-80 text-body leading-snug text-text-secondary">{t('body')}</p>
      <div className="mt-5 flex flex-col gap-2">
        <Button variant="primary" full className="h-11" onClick={onContinue}>
          {t('continue')}
        </Button>
        <Link href="/me#explored" className="inline-flex h-11 items-center justify-center rounded-[var(--radius-button)] text-ui font-semibold text-link">
          {t('map')}
        </Link>
      </div>
    </section>
  )
}

function useDelayedVotes(onNotice: (strips: Strip[]) => void, onFailed: (answer: Answer) => void) {
  const vote = useVote()
  const tb = useTranslations('badges.items')
  const failed = useRef<Pending[]>([])

  const send = useCallback(
    async (p: Pending, keepalive = false) => {
      try {
        const r = await vote.mutateAsync({
          keepalive,
          card_id: p.card.id,
          choice: p.answer === 'glitch' ? 'still' : p.answer,
          ...(p.answer === 'glitch' ? { glitch: true } : {}),
          hints: p.hints,
          held_ms: Math.min(600000, Math.round(performance.now() - p.at)),
          ...(p.spot ? { position: p.spot } : {}),
        })
        exploreQueue.release(isSkyCard(p.card) ? p.card : null)
        const known = r.reveal.known
        const strips: Strip[] = [...(known ? [{ kind: 'known' as const, name: knownName(known.name) }] : []), ...r.new_badges.map((b) => ({ kind: 'badge' as const, name: tb(`${b}.name`) }))]
        if (r.xp.reason === 'too_fast' && !fastWarned) {
          fastWarned = true
          strips.push({ kind: 'fast' })
        }
        if (strips.length) onNotice(strips)
      } catch (err) {
        if (err instanceof ApiError && (err.code === 'already_voted' || err.code === 'card_not_issued')) return
        failed.current.push(p)
        onFailed(p.answer)
      }
    },
    [onFailed, onNotice, tb, vote],
  )

  const retryFailed = useCallback(
    (keepalive = false) => {
      for (const p of failed.current.splice(0)) void send(p, keepalive)
    },
    [send],
  )

  return { send, retryFailed }
}

function Deck({ onHelp }: { onHelp: () => void }) {
  const t = useTranslations('classify')
  const tc = useTranslations('common')
  const guideDone = useUi((s) => s.classifyGuideDone)
  const finishGuide = useUi((s) => s.finishClassifyGuide)
  const [phase, setPhase] = useState<'welcome' | 'lessons' | 'trained' | 'cards'>(guideDone ? 'cards' : 'welcome')
  const guideQuery = useGuideCard(!guideDone || phase !== 'cards')
  const [lessonIndex, setLessonIndex] = useState(0)
  const lessons = guideQuery.data?.lessons ?? []
  const nothingToPractice = guideQuery.isFetched && !lessons.length
  const lesson = phase === 'lessons' ? lessons[lessonIndex] : undefined
  const guiding = !!lesson
  const flow = useDeckFlow(phase === 'cards' || nothingToPractice)
  const [pause, setPause] = useState(false)
  const [strip, setStrip] = useState<Strip | null>(null)
  const [knownOpen, setKnownOpen] = useState<string | null>(null)
  const [shown, setShown] = useState<{ card: PlayCard; img: HTMLImageElement } | null>(null)
  const [openMode, setOpenMode] = useState(false)
  const [savedAt, setSavedAt] = useState(0)
  const [introSeen, setIntroSeen] = useState(false)
  const overview = useCommunityOverview(openMode)
  const goals = useGoals()
  const share = useShare()
  const reduce = useReducedMotion()
  const tcom = useTranslations('community')
  useEffect(() => {
    setOpenMode(new URLSearchParams(window.location.search).has('open'))
  }, [])
  useEffect(() => {
    if (!savedAt) return
    const timer = setTimeout(() => setSavedAt(0), 1400)
    return () => clearTimeout(timer)
  }, [savedAt])
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const notices = useRef<Strip[]>([])
  const card: PlayCard | null = lesson ? lesson.card : flow.card
  const img = useSprite(card?.sprite)
  const cardId = card?.id
  if (!lesson && card && img && shown?.card !== card) setShown({ card, img })

  const pumpNotices = useCallback(() => {
    if (noticeTimer.current) return
    const notice = notices.current.shift()
    if (!notice) return
    setStrip(notice)
    noticeTimer.current = setTimeout(() => {
      noticeTimer.current = null
      setStrip(null)
      pumpNotices()
    }, NOTICE_MS)
  }, [])

  const showNotices = useCallback(
    (strips: Strip[]) => {
      notices.current.push(...strips)
      pumpNotices()
    },
    [pumpNotices],
  )

  const onVoteFailed = useCallback((answer: Answer) => setStrip({ kind: 'failed', answer }), [])
  const { send, retryFailed } = useDelayedVotes(showNotices, onVoteFailed)

  const retryOnLeave = useRef(retryFailed)
  useEffect(() => {
    retryOnLeave.current = retryFailed
  }, [retryFailed])

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') retryOnLeave.current(true)
    }
    const onPageHide = () => retryOnLeave.current(true)
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onPageHide)
      retryOnLeave.current(true)
      if (noticeTimer.current) clearTimeout(noticeTimer.current)
    }
  }, [])

  useEffect(() => {
    if (cardId && !lesson) void api.POST('/api/classify/shown', { body: { card_id: cardId } })
  }, [cardId, lesson])

  const { prepare } = flow
  useEffect(() => {
    if (!cardId || guiding || (phase !== 'cards' && !nothingToPractice)) return
    prepare([cardId])
  }, [cardId, guiding, nothingToPractice, phase, prepare])

  useEffect(() => {
    exploreQueue.start()
    return () => exploreQueue.stop()
  }, [])

  const endGuide = useCallback(() => {
    finishGuide()
    setPhase('trained')
  }, [finishGuide])

  useEffect(() => {
    if (phase !== 'cards' && nothingToPractice) {
      finishGuide()
      setPhase('cards')
    }
  }, [finishGuide, nothingToPractice, phase])

  const onAnswer = useCallback(
    (answer: Answer, spot: VotePosition | null, at: number, hints: boolean) => {
      if (!card) return
      retryFailed()
      void send({ card, answer, spot, at, hints })
      setSavedAt(Date.now())
      sessionLooks++
      const after = (go: () => void) => {
        if (reduce) go()
        else setTimeout(go, LEAVE_MS)
      }
      if (sessionLooks % PAUSE_EVERY === 0) {
        after(() => setPause(true))
        return
      }
      after(() => void flow.reload([card.id]))
    },
    [card, flow, reduce, retryFailed, send],
  )

  const nextLesson = useCallback(() => {
    if (lessonIndex + 1 < lessons.length) setLessonIndex(lessonIndex + 1)
    else endGuide()
  }, [endGuide, lessonIndex, lessons.length])

  const pill: { key: string; text: string; saved?: boolean; action?: string; onAction?: () => void } | null = savedAt
    ? { key: `saved-${savedAt}`, text: t('confirm.saved'), saved: true }
    : strip?.kind === 'known'
      ? { key: `known-${strip.name}`, text: t('strip.known', { name: strip.name }), action: t('strip.see'), onAction: () => setKnownOpen(strip.name) }
      : strip?.kind === 'badge'
        ? { key: `badge-${strip.name}`, text: t('strip.badge', { name: strip.name }) }
        : strip?.kind === 'fast'
          ? { key: 'fast', text: t('strip.fast') }
          : strip?.kind === 'failed'
            ? {
                key: 'failed',
                text: t('failed'),
                action: t('retry'),
                onAction: () => {
                  setStrip(null)
                  retryFailed()
                },
              }
            : null
  const noticeView = pill && !openMode && (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+28px)] z-[46] mx-auto flex max-w-[var(--width-app)] justify-center px-3">
      <motion.div
        key={pill.key}
        role="status"
        initial={reduce ? false : { y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 420, damping: 22 }}
        className="pointer-events-auto flex min-h-10 items-center gap-2 rounded-full bg-text py-1.5 pl-4 pr-1.5 text-ui font-semibold leading-tight text-bg shadow-[0_8px_24px_rgb(0_0_0/0.25)]"
        data-testid={pill.saved ? 'saved-pill' : 'swap-strip'}
      >
        {pill.saved && <IconCheck size={18} className="shrink-0" />}
        <span className={cx('min-w-0', !pill.action && 'pr-2.5')}>{pill.text}</span>
        {pill.action && (
          <button type="button" onClick={pill.onAction} className="h-8 shrink-0 rounded-full bg-bg px-3 text-ui font-semibold text-text">
            {pill.action}
          </button>
        )}
      </motion.div>
    </div>
  )

  const known = <KnownSheet name={knownOpen} onClose={() => setKnownOpen(null)} />

  const plain = (body: ReactNode) => (
    <SwapShell>
      <SwapHeader onHelp={onHelp} />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{body}</div>
      {known}
    </SwapShell>
  )
  if (phase === 'trained') return <Trained onStart={() => setPhase('cards')} />
  if (phase === 'welcome' && lessons[0])
    return (
      <Welcome
        lesson={lessons[0]}
        examples={guideQuery.data?.examples ?? []}
        count={lessons.length}
        onStart={() => setPhase('lessons')}
        onSkip={() => {
          finishGuide()
          setPhase('cards')
        }}
      />
    )
  if (pause)
    return plain(
      <div className="px-4 pb-4">
        <PauseCard
          looks={sessionLooks}
          onContinue={() => {
            setPause(false)
            void flow.reload([])
          }}
        />
      </div>,
    )
  if (phase === 'welcome' && !nothingToPractice) return <DeckSkeleton onHelp={onHelp} />
  const holding = !guiding && !!shown && (flow.status === 'loading' || (flow.status === 'ready' && !img))
  if (!guiding && flow.status === 'searching') return <DeckSkeleton onHelp={onHelp} line={t('searching')} notice={noticeView} />
  if (!guiding && flow.status === 'loading' && !holding) return <DeckSkeleton onHelp={onHelp} notice={noticeView} />
  if (!guiding && flow.status === 'error')
    return plain(
      <EmptyState
        title={tc('retry')}
        action={
          <Button variant="primary" onClick={() => flow.reload()}>
            {tc('retry')}
          </Button>
        }
      />,
    )
  if (!card && !holding) return plain(<EmptyState art={<IconCards size={56} className="text-accent" />} title={t('done')} body={t('doneBody')} />)
  const view = holding && shown ? shown : card ? { card, img } : null
  if (!view) return null
  const left = openMode ? overview.data?.open_cards : undefined
  const goal = goals.data?.find((g) => g.key === 'classifications')
  if (openMode && !lesson && left === 0)
    return (
      <SwapShell>
        <div className="flex min-h-0 flex-1 flex-col" data-testid="open-done">
          <div className="flex min-h-0 flex-1 overflow-y-auto px-5 py-6">
            <div className="m-auto w-full text-center">
              <h1 className={`${STEP_TITLE} text-display`}>{t('open.doneTitle')}</h1>
              {goal && <p className={`${STEP_BODY} mt-3`}>{tcom('goalLine', { count: goal.count, target: goal.target })}</p>}
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-2 px-5 pb-4">
            <button
              type="button"
              onClick={() => {
                window.history.replaceState(window.history.state, '', '/classify')
                setOpenMode(false)
              }}
              className={`${swapButton.primary} w-full flex-none`}
            >
              {t('open.more')}
            </button>
            <Link href="/community" className={`${swapButton.big} w-full flex-none`}>
              {t('open.back')}
            </Link>
          </div>
        </div>
      </SwapShell>
    )
  const openTop =
    openMode && !lesson && left !== undefined ? (
      <p role="status" className="flex items-center justify-center gap-1 text-ui font-semibold leading-tight text-accent" data-testid="open-line">
        {pill?.saved ? <IconCheck size={16} className="shrink-0" /> : <IconCards size={16} className="shrink-0" />}
        <motion.span key={pill?.key ?? left} initial={reduce ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="min-w-0 truncate">
          {pill ? pill.text : t('open.line', { n: left })}
        </motion.span>
        {pill?.action && (
          <button type="button" onClick={pill.onAction} className="pointer-events-auto shrink-0 underline underline-offset-2">
            {pill.action}
          </button>
        )}
      </p>
    ) : null
  const shareCard = !lesson && !isSkyCard(view.card) ? () => void share({ title: t('share.title'), path: `/classify?card=${view.card.id}` }) : undefined

  return (
    <>
      <SwapCard
        key={view.card.id}
        card={view.card}
        img={view.img}
        step={lesson ? t('guide.step', { n: lessonIndex + 1, total: lessons.length }) : null}
        lesson={lesson?.lesson ?? null}
        lessonMarks={lesson?.marks ?? NO_MARKS}
        lastLesson={!!lesson && lessonIndex + 1 === lessons.length}
        firstLesson={!!lesson && lessonIndex === 0}
        top={openTop}
        leave={openMode ? '/community' : '/'}
        past={!lesson && view.card === flow.card ? flow.past : null}
        onHelp={onHelp}
        onAnswer={onAnswer}
        onShare={shareCard}
        onSkip={() => void flow.reload([view.card.id])}
        onLessonStale={nextLesson}
        onLessonNext={nextLesson}
      />
      {known}
      {noticeView}
      {openMode && !lesson && !introSeen && !!left && (
        <Sheet open onClose={() => setIntroSeen(true)} labelledBy="open-intro-title">
          <div className="flex flex-col px-4 pb-1 pt-2" data-testid="open-intro">
            <div className="flex items-center gap-3.5">
              <span className="grid size-[52px] shrink-0 place-items-center rounded-full bg-accent text-on-accent">
                <IconCards size={28} />
              </span>
              <h2 id="open-intro-title" className="min-w-0 text-title-lg font-bold leading-tight tracking-[-0.01em]">
                {t('open.title')}
              </h2>
            </div>
            <p className="mt-3.5 text-title-sm leading-[1.4] text-text-secondary">{t('open.body', { n: overview.data?.close_votes ?? 0 })}</p>
            <p className="mt-3 text-title-sm font-semibold leading-snug text-accent">{t('open.left', { n: left })}</p>
            <button type="button" onClick={() => setIntroSeen(true)} className="mt-4 flex h-[54px] w-full items-center justify-center rounded-2xl bg-accent text-[17px] font-semibold text-on-accent active:bg-accent-pressed">
              {t('open.start')}
            </button>
          </div>
        </Sheet>
      )}
    </>
  )
}

function LoginIntro() {
  const t = useTranslations('classify')
  return (
    <div className="pt-6">
      <div className="flex flex-col items-center px-6 text-center">
        <span className="mb-4 inline-flex size-16 items-center justify-center rounded-full border-[0.5px] border-divider bg-bg-elevated text-text" aria-hidden="true">
          <IconMoves size={40} />
        </span>
        <h2 className="font-[family-name:var(--font-display)] text-title-lg font-bold leading-tight">{t('loginTitle')}</h2>
        <p className="mt-2 max-w-80 text-text-secondary">{t('loginBody')}</p>
      </div>
      <div className="mx-auto mt-4 max-w-96">
        <LoginForm />
      </div>
    </div>
  )
}

export default function ClassifyPage() {
  const t = useTranslations('classify')
  const { data: user, isLoading } = useSession()
  const [help, setHelp] = useState(false)
  const openHelp = () => setHelp(true)
  return (
    <main className="flex h-[calc(100dvh-var(--height-bottomnav)-env(safe-area-inset-bottom))] flex-col overflow-hidden">
      {isLoading ? (
        <DeckSkeleton onHelp={openHelp} />
      ) : !user ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <TopBar
            title={t('title')}
            back={false}
            actions={
              <IconButton label={t('help.open')} onClick={openHelp}>
                <IconQuestion size={26} />
              </IconButton>
            }
          />
          <LoginIntro />
        </div>
      ) : (
        <Deck onHelp={openHelp} />
      )}
      <SwapHelpSheet open={help} onClose={() => setHelp(false)} />
    </main>
  )
}
