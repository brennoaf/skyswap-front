'use client'

import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useOffsetLabel } from '@/components/classify/photo-viewer'
import { AnswerPanel, FrameBars, PhotoBar, SwapPanel, SwapStage, SwapStamps, SwapStrip, SWIPE, swapButton, ToolsPanel } from '@/components/classify/swap-photo'
import { KnownSheet, SwapHelpSheet, UnderstandSheet } from '@/components/classify/swap-sheets'
import { VoiceMark } from '@/components/classify/voices'
import { IconArrowRight, IconBack, IconCards, IconClose, IconMoves, IconQuestion } from '@/components/icons'
import { usePlayback } from '@/components/player/use-playback'
import { LoginForm } from '@/components/shell/login-sheet'
import { Button, EmptyState, IconButton, Skeleton, TopBar } from '@/components/ui/primitives'
import { api, ApiError, unwrap, type DeckCard } from '@/lib/api/client'
import { useGuideCard, useSession, useVote, type VotePosition } from '@/lib/api/hooks'
import type { CardHint } from '@/lib/explore/flashlight'
import { exploreQueue, isSkyCard, type SkyPlayCard } from '@/lib/explore/queue'
import { hasOutsideArea } from '@/lib/out-of-field'
import { knownName, verdictOf, type Answer } from '@/lib/swap-verdict'
import { useUi } from '@/lib/state/ui'

type VoteResult = NonNullable<ReturnType<typeof useVote>['data']>
type Mark = { u: number; v: number }
type PlayCard = DeckCard | SkyPlayCard
type Lesson = 'moves' | 'still' | 'glitch'
type Mode = 'look' | 'tools' | 'mark' | 'sending' | 'failed' | 'result'
type Pending = { card: PlayCard; answer: Answer; spot: VotePosition | null; at: number; hints: boolean }
type Strip = { kind: 'saved'; answer: Answer } | { kind: 'known'; name: string } | { kind: 'badge'; name: string } | { kind: 'fast' } | { kind: 'failed'; answer: Answer }

const UNDO_MS = 3000
const NOTICE_MS = 5000
const FRAME_MS = 700
const INTRO_FRAME_MS = 800
const DEMO_WAIT_MS = 300
const DEMO_RESET_S = 0.2
const DEMO_TOP_CLEAR_PX = 4
const DEMO_STAMP_UP_PX = 24
const DEMO_GESTURE = { duration: 2.2, times: [0, 0.5 / 2.2, 0.9 / 2.2, 1.4 / 2.2, 1], ease: 'easeInOut' as const, repeat: Infinity }
const WELCOME_SWIPES = [
  { key: 'left', x: -SWIPE, up: false, arrow: 'rotate-180' },
  { key: 'right', x: SWIPE, up: false, arrow: '' },
  { key: 'up', x: 0, up: true, arrow: '-rotate-90' },
] as const
const WELCOME_STEPS = WELCOME_SWIPES.length + 1
const WELCOME_STYLE = {
  '--welcome-up': 'clamp(28px, calc((100dvh - 560px) * 0.15 + 28px), 72px)',
  '--welcome-photo': 'max(120px, min(calc(min(100vw, var(--width-app)) - 40px), calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - var(--welcome-up) - var(--welcome-text) - 192px)))',
} as CSSProperties
const STEP_TITLE = 'font-[family-name:var(--font-display)] font-bold leading-tight [text-wrap:balance]'
const STEP_BODY = 'text-title-sm leading-[1.4] text-text-secondary [@media(min-height:700px)]:text-title-md'
const NUDGE_PX = 44
const NUDGE_S = 0.7
const NUDGE_WAIT_MS = 700
const PAUSE_EVERY = 25
const NO_MARKS: Mark[] = []
const BLACK_EDGE_TIP = 'blackEdge'
const SHELL_STYLE = { '--swap-photo': 'max(200px, min(min(100vw, var(--width-app)), calc(100dvh - 312px - env(safe-area-inset-top) - env(safe-area-inset-bottom))))' } as CSSProperties

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

function SwapHeader({ step, onHelp }: { step?: string | null; onHelp: () => void }) {
  const t = useTranslations('classify')
  return (
    <header className="flex h-14 shrink-0 items-center gap-1 px-1">
      <Link href="/" aria-label={t('leave')} className="flex size-12 shrink-0 items-center justify-center rounded-full text-text active:bg-surface">
        <IconClose size={28} />
      </Link>
      <div className="min-w-0 flex-1 text-center">
        {step && <p className="truncate text-[14px] leading-tight text-text-secondary">{step}</p>}
        <h1 className="truncate text-[18px] font-bold leading-tight">{t('question')}</h1>
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

function Coach({ children }: { children: ReactNode }) {
  return (
    <div role="note" className="flex shrink basis-[60px] items-center gap-2.5 px-4 text-[16px] font-medium leading-tight">
      <span aria-hidden="true" className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-accent text-[18px] font-bold text-on-accent">
        !
      </span>
      <span>{children}</span>
    </div>
  )
}

function WelcomePhoto({ sprite, frames, step }: { sprite: string; frames: number; step: number }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const gap = useRef<HTMLDivElement>(null)
  const img = useSprite(sprite)
  const reduce = useReducedMotion()
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const rotate = useTransform(x, [-240, 240], [-6, 6])
  useEffect(() => {
    if (reduce) {
      x.set(0)
      y.set(0)
      return
    }
    const moves = [animate(x, 0, { duration: DEMO_RESET_S }), animate(y, 0, { duration: DEMO_RESET_S })]
    const swipe = WELCOME_SWIPES[step - 1]
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
  }, [reduce, step, x, y])
  useEffect(() => {
    const c = canvas.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx || !img) return
    const tile = Math.round(img.naturalHeight / 2)
    c.width = tile
    c.height = tile
    ctx.imageSmoothingEnabled = false
    let at = 0
    const draw = () => {
      ctx.drawImage(img, at * tile, 0, tile, tile, 0, 0, tile, tile)
      at = (at + 1) % frames
    }
    draw()
    if (reduce) return
    const timer = setInterval(draw, INTRO_FRAME_MS)
    return () => clearInterval(timer)
  }, [frames, img, reduce])
  return (
    <>
      <div ref={gap} className="h-[var(--welcome-up)] shrink-0" data-testid="welcome-gap" />
      <div className="flex shrink-0 justify-center overflow-x-clip" aria-hidden="true" data-testid="swipe-demo-slot">
        <motion.div style={{ x, y, rotate, width: 'var(--welcome-photo)', height: 'var(--welcome-photo)' }} className="relative shrink-0 overflow-hidden bg-media-bg" data-testid="swipe-demo">
          <canvas ref={canvas} className="pixelated block size-full" />
          <SwapStamps x={x} y={y} upFull={DEMO_STAMP_UP_PX} />
        </motion.div>
      </div>
    </>
  )
}

function Welcome({ lesson, count, onStart, onSkip }: { lesson: { card: DeckCard }; count: number; onStart: () => void; onSkip: () => void }) {
  const t = useTranslations('classify.welcome')
  const reduce = useReducedMotion()
  const [step, setStep] = useState(0)
  const primary = useRef<HTMLButtonElement>(null)
  const swipe = WELCOME_SWIPES[step - 1]
  const last = step === WELCOME_STEPS - 1
  const back = () => {
    setStep(step - 1)
    if (step === 1) primary.current?.focus()
  }
  return (
    <SwapShell>
      <div style={WELCOME_STYLE} className="flex min-h-0 flex-1 flex-col pt-2 [--welcome-text:184px] [@media(min-height:700px)]:[--welcome-text:200px]" data-testid="swap-welcome">
        <div className="shrink-0 px-2">
          <FrameBars n={WELCOME_STEPS} index={step} />
        </div>
        <div className="flex h-12 shrink-0 items-center px-2" data-testid="welcome-top">
          {step > 0 && (
            <IconButton label={t('back')} onClick={back} className="size-12">
              <IconBack size={28} />
            </IconButton>
          )}
          <button type="button" onClick={onSkip} className="ml-auto flex h-12 items-center px-3 text-title-sm font-semibold text-text-secondary">
            {t('skip')}
          </button>
        </div>
        <WelcomePhoto sprite={lesson.card.sprite} frames={Math.max(1, lesson.card.offsets_s.length)} step={step} />
        <div aria-live="polite" className="flex min-h-0 flex-1 overflow-y-auto px-5 py-6" data-testid="welcome-text-area">
          <motion.div key={step} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="m-auto w-full text-center" data-testid="welcome-text" data-step={step + 1}>
            <p className="sr-only">{t('stepRead', { n: step + 1, total: WELCOME_STEPS })}</p>
            {swipe ? (
              <>
                <h1 className={`${STEP_TITLE} text-wordmark`}>{t(`swipe.${swipe.key}`)}</h1>
                <p className={`${STEP_BODY} mt-3 flex items-center justify-center gap-2`}>
                  <IconArrowRight size={24} aria-hidden="true" className={`shrink-0 ${swipe.arrow}`} />
                  {t(`drag.${swipe.key}`)}
                </p>
              </>
            ) : (
              <>
                <h1 className={`${STEP_TITLE} text-display`}>{t('title')}</h1>
                <p className={`${STEP_BODY} mt-3`}>{t('body1')}</p>
                <p className={`${STEP_BODY} mt-3`}>{t('body2')}</p>
              </>
            )}
          </motion.div>
        </div>
        <div className="shrink-0 px-5 pb-4">
          <button ref={primary} type="button" onClick={last ? onStart : () => setStep(step + 1)} className={`${swapButton.primary} w-full`}>
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

function SwapCard({
  card,
  img,
  step,
  lesson,
  lessonMarks,
  lastLesson,
  strip,
  onHelp,
  onChoosing,
  onAnswer,
  onLessonStale,
  onLessonNext,
}: {
  card: PlayCard
  img: HTMLImageElement | null
  step: string | null
  lesson: Lesson | null
  lessonMarks: Mark[]
  lastLesson: boolean
  strip: ReactNode
  onHelp: () => void
  onChoosing: () => void
  onAnswer: (answer: Answer, spot: VotePosition | null, at: number, hints: boolean) => void
  onLessonStale: () => void
  onLessonNext: () => void
}) {
  const t = useTranslations('classify')
  const tp = useTranslations('player')
  const label = useOffsetLabel()
  const reduce = useReducedMotion()
  const vote = useVote()
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const [mode, setMode] = useState<Mode>('look')
  const [answer, setAnswer] = useState<Answer | null>(null)
  const [markAt, setMarkAt] = useState(0)
  const [spot, setSpot] = useState<VotePosition | null>(null)
  const [saved, setSaved] = useState<VoteResult | null>(null)
  const [frozen, setFrozen] = useState(false)
  const [row, setRow] = useState<0 | 1>(0)
  const [understand, setUnderstand] = useState(false)
  const [sawIt, setSawIt] = useState(false)
  const [shownIt, setShownIt] = useState(false)
  const [retry, setRetry] = useState(false)
  const sky = isSkyCard(card) ? card : null
  const [hintsOn, setHintsOn] = useState(false)
  const [hintsUsed, setHintsUsed] = useState(false)
  const offsets = card.offsets_s
  const n = Math.max(1, offsets.length)
  const playback = usePlayback(n, { baseMs: FRAME_MS, autoplay: !reduce || !!lesson, frozen })
  const panel = playback.index
  const { setPlaying } = playback
  const hints = sky && hintsOn ? sky.hints : null
  const outside = useOutside(img, n)
  const blackSeen = useUi((s) => s.tipsSeen.includes(BLACK_EDGE_TIP))
  const markTip = useUi((s) => s.markTip)
  const [blackNote, setBlackNote] = useState(false)
  const hintLine = useHintLine(hints, panel)
  const verdict = lesson && saved && answer ? verdictOf(saved.reveal, answer, true) : null

  const settle = useCallback(() => {
    animate(x, 0, { type: 'spring', stiffness: 500, damping: 32 })
    animate(y, 0, { type: 'spring', stiffness: 500, damping: 32 })
  }, [x, y])

  const nudge = useCallback(
    (direction: 1 | -1) => {
      if (!reduce) animate(x, [0, direction * NUDGE_PX, 0], { duration: NUDGE_S, ease: 'easeInOut' })
    },
    [reduce, x],
  )

  const undoMark = useCallback(() => {
    setAnswer(null)
    setSpot(null)
    setMode('look')
    setPlaying(!reduce)
  }, [reduce, setPlaying])

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
    if (mode !== 'mark') return
    const onHide = () => {
      if (document.visibilityState === 'hidden') undoMark()
    }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [mode, undoMark])

  useEffect(() => {
    if (lesson !== 'still' || !img) return
    const timer = setTimeout(() => nudge(-1), NUDGE_WAIT_MS)
    return () => clearTimeout(timer)
  }, [img, lesson, nudge])

  const choose = (a: Answer) => {
    if (!img) return
    settle()
    setRow(0)
    setSpot(null)
    setAnswer(a)
    if (lesson) {
      if (saved) {
        setMode('result')
        setPlaying(true)
      } else void sendLesson(a)
      return
    }
    onChoosing()
    if (a === 'moves') {
      setMarkAt(performance.now())
      setMode('mark')
    } else onAnswer(a, null, performance.now(), hintsUsed)
  }

  useEffect(() => {
    if (lesson || !outside[panel] || blackSeen) return
    setBlackNote(true)
    markTip(BLACK_EDGE_TIP)
  }, [blackSeen, lesson, markTip, outside, panel])

  const looking = mode === 'look' || mode === 'tools'
  const mustLookFirst = lesson === 'moves' && !sawIt && !retry
  const canSwipe = looking && !!img && !mustLookFirst

  const onRelease = (dx: number, dy: number, vx: number, vy: number) => {
    const sideways = Math.abs(dx) >= Math.abs(dy)
    if (sideways && (dx > SWIPE || vx > 700)) choose('moves')
    else if (sideways && (dx < -SWIPE || vx < -700)) choose('still')
    else if (!sideways && (dy < -SWIPE || vy < -700)) choose('unsure')
    else settle()
  }

  const onTap = (u: number, v: number) => {
    if (mode === 'mark') {
      setSpot({ frame: panel, x: Math.round(u * 1e4) / 1e4, y: Math.round(v * 1e4) / 1e4 })
      setPlaying(false)
    } else if (looking || mode === 'result') setPlaying(!playback.playing)
  }

  const mark = saved?.reveal.marks[panel]
  const ringOn = looking && (lesson === 'glitch' || (lesson === 'moves' && (shownIt || retry)))
  const overlay = (
    <>
      {ringOn && <GuideRing mark={lessonMarks[panel] ?? lessonMarks[0]} />}
      {hints && <HintRings hints={hints} panel={panel} />}
      {mode === 'result' && mark && verdict?.mark && <VoiceMark voice="known" u={mark.u} v={mark.v} />}
      {spot && <VoiceMark voice="you" u={spot.x} v={spot.y} faint={spot.frame !== panel} />}
    </>
  )

  const labels = { still: t('still'), moves: t('moves'), glitch: t('glitch'), unsure: t('unsure') }
  const note = hintLine ?? (blackNote && outside[panel] ? tp('outside') : null)

  return (
    <SwapShell>
      <SwapHeader step={step} onHelp={onHelp} />
      <FrameBars n={n} index={panel} />
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
      />
      <div className="relative flex min-h-0 flex-1 flex-col" data-testid="swap-lower">
        {lesson && (mode === 'look' || mode === 'sending') && (
          <>
            <Coach>{mustLookFirst ? t('guide.look') : lesson === 'moves' ? t('guide.answer') : t(`guide.${lesson}`)}</Coach>
            <PhotoBar playback={playback} offsets={offsets} onTools={() => mode === 'look' && setMode('tools')} />
            {mustLookFirst ? (
              <div className="mt-auto flex shrink-0 flex-col gap-2 px-4 pb-4 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setSawIt(true)
                    setShownIt(false)
                    nudge(1)
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
              <AnswerPanel labels={labels} disabled={!img || mode === 'sending'} onChoose={choose} />
            )}
          </>
        )}
        {!lesson && mode === 'look' && (
          <>
            {strip ?? <PhotoBar playback={playback} offsets={offsets} onTools={() => setMode('tools')} />}
            {note && (
              <p role="status" className="my-auto px-6 text-center text-[15px] leading-snug text-text-secondary">
                {note}
              </p>
            )}
            <AnswerPanel labels={labels} disabled={!img} onChoose={choose} />
          </>
        )}
        {mode === 'tools' && (
          <ToolsPanel
            playback={playback}
            sprite={card.sprite}
            offsets={offsets}
            row={row}
            onRow={setRow}
            onBack={() => setMode('look')}
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
        )}
        {mode === 'mark' && (
          <SwapPanel>
            <p role="status" aria-live="polite" className="text-[18px] font-bold leading-snug">
              {spot ? t('mark.marked') : t('mark.where')}
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={undoMark} className={swapButton.big}>
                {t('undo')}
              </button>
              <button type="button" onClick={() => onAnswer('moves', spot, markAt, hintsUsed)} className={swapButton.primary}>
                {t('mark.next')}
              </button>
            </div>
          </SwapPanel>
        )}
        {mode === 'failed' && answer && (
          <SwapPanel>
            <p role="status" className="text-[16px] font-medium leading-snug text-danger">
              {t('failed')}
            </p>
            <button type="button" onClick={() => void sendLesson(answer)} className={`${swapButton.primary} flex-none`}>
              {t('retry')}
            </button>
          </SwapPanel>
        )}
        {mode === 'result' && saved && answer && verdict && (
          <SwapPanel label={t('result.label')}>
            <h2 id="reveal-title" className="text-[21px] font-bold leading-tight [text-wrap:balance]">
              {t(`result.${verdict.title}`, { name: verdict.name ?? '' })}
            </h2>
            <p className="text-[16px] leading-snug text-text-secondary">{t(`result.${verdict.body}`)}</p>
            <p className="text-[15px] font-semibold leading-snug">{t('practice')}</p>
            <div className="flex gap-2">
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
          </SwapPanel>
        )}
      </div>
      {saved && answer && verdict && <UnderstandSheet open={understand} onClose={() => setUnderstand(false)} reveal={saved.reveal} answer={answer} verdict={verdict} />}
    </SwapShell>
  )
}

function DeckSkeleton({ onHelp, line, strip }: { onHelp: () => void; line?: string; strip?: ReactNode }) {
  return (
    <SwapShell>
      <SwapHeader onHelp={onHelp} />
      <div className="h-3 shrink-0" />
      <div className="flex shrink-0 justify-center" aria-hidden="true">
        <Skeleton className="rounded-none" style={{ width: 'var(--swap-photo)', height: 'var(--swap-photo)' }} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col" aria-live="polite">
        {strip}
        {line && <p className="my-auto px-6 text-center text-[15px] text-text-secondary">{line}</p>}
      </div>
    </SwapShell>
  )
}

type DeckState = { status: 'loading' | 'searching' | 'ready' | 'done' | 'error'; card: PlayCard | null }

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
  const stateNow = useRef(state)
  stateNow.current = state
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

  const restore = useCallback((card: PlayCard) => {
    const shown = stateNow.current
    if (shown.card) next.current = { work: Promise.resolve(shown), done: shown }
    setState({ status: 'ready', card })
  }, [])

  useEffect(() => {
    if (enabled) void load()
  }, [enabled, load])

  return { ...state, reload: load, prepare, restore }
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
  const pending = useRef<Pending | null>(null)
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const notices = useRef<Strip[]>([])
  const card: PlayCard | null = lesson ? lesson.card : flow.card
  const img = useSprite(card?.sprite)
  const cardId = card?.id

  const pumpNotices = useCallback(() => {
    if (noticeTimer.current || pending.current) return
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

  const onVoteFailed = useCallback((answer: Answer) => setStrip((now) => (now?.kind === 'saved' ? now : { kind: 'failed', answer })), [])
  const { send, retryFailed } = useDelayedVotes(showNotices, onVoteFailed)

  const clearUndo = useCallback(() => {
    if (undoTimer.current) clearTimeout(undoTimer.current)
    undoTimer.current = null
  }, [])

  const commitPending = useCallback(() => {
    clearUndo()
    const p = pending.current
    pending.current = null
    setStrip((now) => (now?.kind === 'saved' ? null : now))
    if (p) void send(p)
    pumpNotices()
  }, [clearUndo, pumpNotices, send])

  const sendNow = useCallback(() => {
    clearUndo()
    const p = pending.current
    pending.current = null
    setStrip((now) => (now?.kind === 'saved' ? null : now))
    if (p) void send(p, true)
    retryFailed(true)
  }, [clearUndo, retryFailed, send])

  const sendOnLeave = useRef(sendNow)
  useEffect(() => {
    sendOnLeave.current = sendNow
  }, [sendNow])

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') sendOnLeave.current()
    }
    const onPageHide = () => sendOnLeave.current()
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onPageHide)
      sendOnLeave.current()
      if (noticeTimer.current) clearTimeout(noticeTimer.current)
    }
  }, [])

  useEffect(() => {
    if (cardId && !lesson) void api.POST('/api/classify/shown', { body: { card_id: cardId } })
  }, [cardId, lesson])

  const { prepare } = flow
  useEffect(() => {
    if (!cardId || guiding || (phase !== 'cards' && !nothingToPractice)) return
    prepare([cardId, ...(pending.current ? [pending.current.card.id] : [])])
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

  const onChoosing = useCallback(() => {
    commitPending()
    retryFailed()
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    noticeTimer.current = null
    setStrip(null)
  }, [commitPending, retryFailed])

  const onAnswer = useCallback(
    (answer: Answer, spot: VotePosition | null, at: number, hints: boolean) => {
      if (!card) return
      pending.current = { card, answer, spot, at, hints }
      setStrip({ kind: 'saved', answer })
      undoTimer.current = setTimeout(commitPending, UNDO_MS)
      sessionLooks++
      if (sessionLooks % PAUSE_EVERY === 0) {
        setPause(true)
        return
      }
      void flow.reload([card.id])
    },
    [card, commitPending, flow],
  )

  const undo = useCallback(() => {
    clearUndo()
    const p = pending.current
    pending.current = null
    setStrip(null)
    pumpNotices()
    if (!p) return
    sessionLooks = Math.max(0, sessionLooks - 1)
    setPause(false)
    flow.restore(p.card)
  }, [clearUndo, flow, pumpNotices])

  const nextLesson = useCallback(() => {
    if (lessonIndex + 1 < lessons.length) setLessonIndex(lessonIndex + 1)
    else endGuide()
  }, [endGuide, lessonIndex, lessons.length])

  const stripView =
    strip?.kind === 'saved' ? (
      <SwapStrip text={t('strip.saved', { answer: t(`answered.${strip.answer}`) })} action={t('undo')} onAction={undo} />
    ) : strip?.kind === 'known' ? (
      <SwapStrip text={t('strip.known', { name: strip.name })} action={t('strip.see')} onAction={() => setKnownOpen(strip.name)} />
    ) : strip?.kind === 'badge' ? (
      <SwapStrip text={t('strip.badge', { name: strip.name })} />
    ) : strip?.kind === 'fast' ? (
      <SwapStrip text={t('strip.fast')} />
    ) : strip?.kind === 'failed' ? (
      <SwapStrip
        text={t('failed')}
        action={t('retry')}
        onAction={() => {
          setStrip(null)
          retryFailed()
        }}
      />
    ) : null

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
            void flow.reload(pending.current ? [pending.current.card.id] : [])
          }}
        />
      </div>,
    )
  if (phase === 'welcome' && !nothingToPractice) return <DeckSkeleton onHelp={onHelp} />
  if (!guiding && flow.status === 'searching') return <DeckSkeleton onHelp={onHelp} line={t('searching')} strip={stripView} />
  if (!guiding && flow.status === 'loading') return <DeckSkeleton onHelp={onHelp} strip={stripView} />
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
  if (!card) return plain(<EmptyState art={<IconCards size={56} className="text-accent" />} title={t('done')} body={t('doneBody')} />)

  return (
    <>
      <SwapCard
        key={card.id}
        card={card}
        img={img}
        step={lesson ? t('guide.step', { n: lessonIndex + 1, total: lessons.length }) : null}
        lesson={lesson?.lesson ?? null}
        lessonMarks={lesson?.marks ?? NO_MARKS}
        lastLesson={!!lesson && lessonIndex + 1 === lessons.length}
        strip={stripView}
        onHelp={onHelp}
        onChoosing={onChoosing}
        onAnswer={onAnswer}
        onLessonStale={nextLesson}
        onLessonNext={nextLesson}
      />
      {known}
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
