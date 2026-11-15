'use client'

import { animate, motion, useMotionValue, useReducedMotion } from 'framer-motion'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useOffsetLabel } from '@/components/classify/photo-viewer'
import { AnswerPanel, FrameBars, PhotoBar, SwapPanel, SwapStage, SWIPE, swapButton, ToolsPanel } from '@/components/classify/swap-photo'
import { SwapHelpSheet, UnderstandSheet } from '@/components/classify/swap-sheets'
import { VoiceMark } from '@/components/classify/voices'
import { IconCards, IconClose, IconMoves, IconQuestion } from '@/components/icons'
import { usePlayback } from '@/components/player/use-playback'
import { LoginForm } from '@/components/shell/login-sheet'
import { Button, EmptyState, IconButton, Skeleton, TopBar } from '@/components/ui/primitives'
import { api, ApiError, unwrap, type DeckCard } from '@/lib/api/client'
import { useGuideCard, useSession, useVote, type VotePosition } from '@/lib/api/hooks'
import type { CardHint } from '@/lib/explore/flashlight'
import { exploreQueue, isSkyCard, type SkyPlayCard } from '@/lib/explore/queue'
import { hasOutsideArea } from '@/lib/out-of-field'
import { verdictOf, type Answer } from '@/lib/swap-verdict'
import { useUi } from '@/lib/state/ui'

type VoteResult = NonNullable<ReturnType<typeof useVote>['data']>
type Mark = { u: number; v: number }
type PlayCard = DeckCard | SkyPlayCard
type Lesson = 'moves' | 'still' | 'glitch'
type Mode = 'look' | 'tools' | 'confirm' | 'marking' | 'sending' | 'failed' | 'result'

const CONFIRM_MS = 3000
const FRAME_MS = 700
const TIP_MS = 6000
const INTRO_FRAME_MS = 800
const NUDGE_PX = 44
const NUDGE_S = 0.7
const NUDGE_WAIT_MS = 700
const PAUSE_EVERY = 25
const IDLE_MS = 12_000
const QUIET_RUN = 10
const NO_MARKS: Mark[] = []
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

function useIdle(key: string, ms = IDLE_MS) {
  const [idle, setIdle] = useState(false)
  useEffect(() => {
    let timer = setTimeout(() => setIdle(true), ms)
    const wake = () => {
      setIdle(false)
      clearTimeout(timer)
      timer = setTimeout(() => setIdle(true), ms)
    }
    window.addEventListener('pointerdown', wake)
    window.addEventListener('keydown', wake)
    setIdle(false)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('pointerdown', wake)
      window.removeEventListener('keydown', wake)
    }
  }, [key, ms])
  return idle
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
    <div role="note" className="flex min-h-[60px] shrink-0 items-center gap-2.5 px-4 text-[16px] font-medium leading-snug">
      <span aria-hidden="true" className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-accent text-[18px] font-bold text-on-accent">
        !
      </span>
      <span>{children}</span>
    </div>
  )
}

function IntroPhoto({ sprite, frames }: { sprite: string; frames: number }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const img = useSprite(sprite)
  const reduce = useReducedMotion()
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
    <div className="mx-auto mb-5 mt-4 aspect-square w-[min(100%,38dvh)] shrink-0 overflow-hidden rounded-[var(--radius-sheet)] bg-media-bg">
      <canvas ref={canvas} aria-hidden="true" className="pixelated block size-full" />
    </div>
  )
}

function Welcome({ lesson, count, onStart, onSkip }: { lesson: { card: DeckCard }; count: number; onStart: () => void; onSkip: () => void }) {
  const t = useTranslations('classify.welcome')
  return (
    <SwapShell>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pb-4" data-testid="swap-welcome">
        <IntroPhoto sprite={lesson.card.sprite} frames={Math.max(1, lesson.card.offsets_s.length)} />
        <h1 className="text-[26px] font-bold leading-tight [text-wrap:balance]">{t('title')}</h1>
        <p className="mt-2.5 text-[17px] leading-snug text-text-secondary">{t('body1')}</p>
        <p className="mt-2.5 text-[17px] leading-snug text-text-secondary">{t('body2')}</p>
        <div className="flex-1" />
        <button type="button" onClick={onStart} className={`${swapButton.primary} mt-3 w-full flex-none`}>
          {t('start', { n: count })}
        </button>
        <button type="button" onClick={onSkip} className="mt-1 min-h-12 shrink-0 text-[16px] font-semibold text-link">
          {t('skip')}
        </button>
      </div>
    </SwapShell>
  )
}

function Trained({ onStart }: { onStart: () => void }) {
  const t = useTranslations('classify.trained')
  return (
    <SwapShell>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pb-4" data-testid="swap-trained">
        <div className="flex-1" />
        <h1 className="text-[26px] font-bold leading-tight">{t('title')}</h1>
        <p className="mt-2.5 text-[17px] leading-snug text-text-secondary">{t('body1')}</p>
        <p className="mt-2.5 text-[17px] leading-snug text-text-secondary">{t('body2')}</p>
        <div className="flex-1" />
        <button type="button" onClick={onStart} className={`${swapButton.primary} mt-3 w-full flex-none`}>
          {t('start')}
        </button>
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

function gainLine(t: ReturnType<typeof useTranslations>, result: VoteResult): string | null {
  const { xp, counted, guided } = result
  const gained = xp.xp + xp.streakBonus
  const parts = [
    guided ? t('classify.practice') : !counted ? t('classify.tooFast') : gained > 0 ? t('xp.gained', { xp: gained }) : xp.reason === 'daily_cap' || xp.reason === 'diminished' ? t('xp.limit') : null,
    ...result.new_badges.map((b) => t('classify.newBadge', { name: t(`badges.items.${b}.name`) })),
  ].filter((part): part is string => !!part)
  return parts.length ? parts.join(' ') : null
}

function SwapCard({
  card,
  img,
  step,
  lesson,
  lessonMarks,
  lastLesson,
  showGestureHint,
  onHelp,
  onVoted,
  onStale,
  onNext,
}: {
  card: PlayCard
  img: HTMLImageElement | null
  step: string | null
  lesson: Lesson | null
  lessonMarks: Mark[]
  lastLesson: boolean
  showGestureHint: boolean
  onHelp: () => void
  onVoted: (answer: Answer, r: VoteResult) => boolean
  onStale: () => void
  onNext: () => void
}) {
  const t = useTranslations('classify')
  const tAll = useTranslations()
  const tp = useTranslations('player')
  const label = useOffsetLabel()
  const reduce = useReducedMotion()
  const vote = useVote()
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const [mode, setMode] = useState<Mode>('look')
  const [answer, setAnswer] = useState<Answer | null>(null)
  const [heldAt, setHeldAt] = useState(0)
  const [spot, setSpot] = useState<VotePosition | null>(null)
  const [saved, setSaved] = useState<VoteResult | null>(null)
  const [quiet, setQuiet] = useState(false)
  const [frozen, setFrozen] = useState(false)
  const [row, setRow] = useState<0 | 1>(0)
  const [understand, setUnderstand] = useState(false)
  const [computerMark, setComputerMark] = useState(false)
  const [tip, setTip] = useState<string | null>(null)
  const [sawIt, setSawIt] = useState(false)
  const [shownIt, setShownIt] = useState(false)
  const [retry, setRetry] = useState(false)
  const tipsSeen = useUi((s) => s.tipsSeen)
  const markTip = useUi((s) => s.markTip)
  const sky = isSkyCard(card) ? card : null
  const [hintsOn, setHintsOn] = useState(false)
  const [hintsUsed, setHintsUsed] = useState(false)
  const offsets = card.offsets_s
  const n = Math.max(1, offsets.length)
  const playback = usePlayback(n, { baseMs: FRAME_MS, autoplay: !reduce, frozen: frozen || mode === 'marking' })
  const panel = playback.index
  const hints = sky && (hintsOn || (mode === 'result' && computerMark)) ? sky.hints : null
  const outside = useOutside(img, n)
  const hintLine = useHintLine(hints, panel)
  const verdict = saved && answer ? verdictOf(saved.reveal, answer, !!lesson) : null

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

  const undo = useCallback(() => {
    setAnswer(null)
    setSpot(null)
    setMode('look')
  }, [])

  const send = useCallback(async () => {
    if (!answer) return
    setMode('sending')
    if (saved) {
      setMode('result')
      playback.setPlaying(!reduce)
      return
    }
    try {
      const r = await vote.mutateAsync({ card_id: card.id, choice: answer === 'glitch' ? 'still' : answer, ...(answer === 'glitch' ? { glitch: true } : {}), hints: hintsUsed, held_ms: Math.min(600000, Math.round(performance.now() - heldAt)), ...(spot ? { position: spot } : {}) })
      setSaved(r)
      setQuiet(onVoted(answer, r))
      setMode('result')
      playback.setPlaying(!reduce)
    } catch (err) {
      if (err instanceof ApiError && (err.code === 'already_voted' || err.code === 'card_not_issued')) {
        onStale()
        return
      }
      setMode('failed')
    }
  }, [answer, card.id, heldAt, hintsUsed, onStale, onVoted, playback, reduce, saved, spot, vote])

  const sendNow = useRef(send)
  useEffect(() => {
    sendNow.current = send
  }, [send])

  useEffect(() => {
    if (mode !== 'confirm') return
    const timer = setTimeout(() => void sendNow.current(), CONFIRM_MS)
    return () => clearTimeout(timer)
  }, [mode])

  useEffect(() => {
    if (mode !== 'confirm' && mode !== 'marking') return
    const onHide = () => {
      if (document.visibilityState === 'hidden') undo()
    }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [mode, undo])

  useEffect(() => {
    if (!tip) return
    const timer = setTimeout(() => setTip(null), TIP_MS)
    return () => clearTimeout(timer)
  }, [tip])

  const choose = useCallback(
    (a: Answer) => {
      if (!img) return
      settle()
      setRow(0)
      setAnswer(a)
      setHeldAt(performance.now())
      setSpot(null)
      setMode('confirm')
    },
    [img, settle],
  )

  useEffect(() => {
    if (lesson !== 'still' || !img) return
    const timer = setTimeout(() => nudge(-1), NUDGE_WAIT_MS)
    return () => clearTimeout(timer)
  }, [img, lesson, nudge])

  const looking = mode === 'look' || mode === 'tools'
  const mustLookFirst = lesson === 'moves' && !sawIt && !retry
  const canSwipe = looking && !!img && !mustLookFirst
  const canMark = answer === 'moves' && (mode === 'confirm' || mode === 'marking')

  const onRelease = (dx: number, dy: number, vx: number, vy: number) => {
    const sideways = Math.abs(dx) >= Math.abs(dy)
    if (sideways && (dx > SWIPE || vx > 700)) choose('moves')
    else if (sideways && (dx < -SWIPE || vx < -700)) choose('still')
    else if (!sideways && (dy < -SWIPE || vy < -700)) choose('unsure')
    else {
      settle()
      if (Math.hypot(dx, dy) > 30 && !tipsSeen.includes('short')) {
        markTip('short')
        setTip('short')
      }
    }
  }

  const onTap = (u: number, v: number) => {
    if (canMark) {
      setSpot({ frame: panel, x: Math.round(u * 1e4) / 1e4, y: Math.round(v * 1e4) / 1e4 })
      setMode('marking')
    } else if (looking || mode === 'result') playback.setPlaying(!playback.playing)
  }

  const reveal = saved?.reveal
  const mark = reveal?.marks[panel]
  const ringOn = mode === 'look' && (lesson === 'glitch' || (lesson === 'moves' && (shownIt || retry)))
  const overlay = (
    <>
      {ringOn && <GuideRing mark={lessonMarks[panel] ?? lessonMarks[0]} />}
      {hints && <HintRings hints={hints} panel={panel} />}
      {mode === 'result' && !hints && mark && verdict?.mark && <VoiceMark voice="known" u={mark.u} v={mark.v} />}
      {mode === 'result' && !hints && mark && !verdict?.mark && computerMark && <VoiceMark voice="program" u={mark.u} v={mark.v} />}
      {spot && <VoiceMark voice="you" u={spot.x} v={spot.y} faint={spot.frame !== panel} />}
    </>
  )

  const sending = mode === 'sending'
  const failed = mode === 'failed'
  const note = tip ? t(`tips.${tip}`) : hintLine ?? (outside[panel] ? tp('outside') : showGestureHint ? t('hints.swipe') : null)
  const gain = saved ? gainLine(tAll, saved) : null

  return (
    <SwapShell>
      <SwapHeader step={step ?? (sky ? t('sky.label') : null)} onHelp={onHelp} />
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
        onTouch={canMark ? () => setMode('marking') : undefined}
        overlay={overlay}
      />
      <div className="relative flex min-h-0 flex-1 flex-col" data-testid="swap-lower">
        {mode === 'look' && lesson && (
          <>
            <Coach>{mustLookFirst ? t('guide.look') : lesson === 'moves' ? t('guide.answer') : t(`guide.${lesson}`)}</Coach>
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
              <AnswerPanel labels={{ still: t('still'), moves: t('moves'), glitch: t('glitch'), unsure: t('unsure') }} disabled={!img} onChoose={choose} />
            )}
          </>
        )}
        {mode === 'look' && !lesson && (
          <>
            <PhotoBar playback={playback} offsets={offsets} onTools={() => setMode('tools')} />
            {note && (
              <p role="status" className="my-auto px-6 text-center text-[15px] leading-snug text-text-secondary">
                {note}
              </p>
            )}
            <AnswerPanel labels={{ still: t('still'), moves: t('moves'), glitch: t('glitch'), unsure: t('unsure') }} disabled={!img} onChoose={choose} />
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
        {answer && (mode === 'confirm' || mode === 'marking' || sending || failed) && (
          <SwapPanel>
            {mode === 'confirm' && !reduce && <motion.span aria-hidden="true" className="absolute inset-x-4 top-0 h-[3px] origin-left rounded-sm bg-accent" initial={{ scaleX: 1 }} animate={{ scaleX: 0 }} transition={{ duration: CONFIRM_MS / 1000, ease: 'linear' }} />}
            <div role="status" aria-live="polite">
              <p className="text-[18px] font-bold leading-snug">{t('confirm.said', { choice: t(answer) })}</p>
              <p className={failed ? 'text-[16px] font-medium leading-snug text-danger' : 'text-[16px] leading-snug text-text-secondary'}>{failed ? t('confirm.failed') : sending ? t('confirm.saving') : spot ? t('confirm.marked') : answer === 'moves' ? t('confirm.tap') : t('confirm.canUndo')}</p>
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={sending} onClick={undo} className={swapButton.big}>
                {t('confirm.undo')}
              </button>
              <button type="button" disabled={sending} onClick={() => void send()} className={swapButton.primary}>
                {failed ? t('confirm.retry') : t('confirm.see')}
              </button>
            </div>
          </SwapPanel>
        )}
        {mode === 'result' && saved && answer && verdict && (
          <SwapPanel label={t('result.label')}>
            <h2 id="reveal-title" className="text-[21px] font-bold leading-tight [text-wrap:balance]">
              {t(`result.${verdict.title}`, { name: verdict.name ?? '' })}
            </h2>
            <p className="text-[16px] leading-snug text-text-secondary">{quiet ? t('result.quiet') : t(`result.${verdict.body}`)}</p>
            {gain && <p className="text-[15px] font-semibold leading-snug">{gain}</p>}
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
              <button type="button" onClick={onNext} className={swapButton.primary}>
                {lastLesson ? t('finish') : t('next')}
              </button>
            </div>
          </SwapPanel>
        )}
      </div>
      {saved && answer && verdict && (
        <UnderstandSheet
          open={understand}
          onClose={() => setUnderstand(false)}
          reveal={saved.reveal}
          answer={answer}
          verdict={verdict}
          hasHints={!!sky?.hints.length}
          onShowComputer={
            !verdict.mark && !hints && (saved.reveal.marks.length > 0 || !!sky?.hints.length)
              ? () => {
                  setComputerMark(true)
                  setUnderstand(false)
                }
              : null
          }
        />
      )}
    </SwapShell>
  )
}

function DeckSkeleton({ onHelp, line }: { onHelp: () => void; line?: string }) {
  return (
    <SwapShell>
      <SwapHeader onHelp={onHelp} />
      <div className="h-3 shrink-0" />
      <div className="flex shrink-0 justify-center" aria-hidden="true">
        <Skeleton className="rounded-none" style={{ width: 'var(--swap-photo)', height: 'var(--swap-photo)' }} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col" aria-live="polite">
        {line && <p className="my-auto px-6 text-center text-[15px] text-text-secondary">{line}</p>}
      </div>
    </SwapShell>
  )
}

type DeckState = { status: 'loading' | 'searching' | 'ready' | 'done' | 'error'; card: PlayCard | null }

let sessionLooks = 0
let quietRun = 0

async function fetchNext(): Promise<DeckState> {
  const query = new URLSearchParams(window.location.search).has('open') ? { explore: true, open: true } : { explore: true }
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
    r = unwrap(await api.GET('/api/classify/next', { params: { query: { explore: true, known: true } } }))
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

  const prepare = useCallback(() => {
    if (next.current) return
    const entry: { work: Promise<DeckState>; done: DeckState | null } = { work: fetchNext(), done: null }
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

  const load = useCallback(async () => {
    const prepared = next.current
    next.current = null
    if (prepared?.done?.status === 'ready') {
      setState(prepared.done)
      return
    }
    setState({ status: 'loading', card: null })
    try {
      const s = prepared ? await prepared.work.catch(fetchNext) : await fetchNext()
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
  const card: PlayCard | null = lesson ? lesson.card : flow.card
  const img = useSprite(card?.sprite)
  const cardId = card?.id
  const idle = useIdle(cardId ?? 'none')

  useEffect(() => {
    if (cardId && !lesson) void api.POST('/api/classify/shown', { body: { card_id: cardId } })
  }, [cardId, lesson])

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

  const onVoted = useCallback(
    (answer: Answer, data: VoteResult) => {
      if (guiding) return false
      sessionLooks++
      flow.prepare()
      if (data.reveal.control || data.reveal.kind === 'sky') return false
      quietRun = answer === 'moves' ? 0 : quietRun + 1
      return quietRun > 0 && quietRun % QUIET_RUN === 0
    },
    [flow, guiding],
  )

  const loadNext = useCallback(() => {
    exploreQueue.release(isSkyCard(flow.card) ? flow.card : null)
    if (guiding) {
      if (lessonIndex + 1 < lessons.length) setLessonIndex(lessonIndex + 1)
      else endGuide()
      return
    }
    if (sessionLooks > 0 && sessionLooks % PAUSE_EVERY === 0 && !pause) {
      setPause(true)
      return
    }
    setPause(false)
    void flow.reload()
  }, [flow, guiding, pause, lessonIndex, lessons.length, endGuide])

  const plain = (body: ReactNode) => (
    <SwapShell>
      <SwapHeader onHelp={onHelp} />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{body}</div>
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
  if (pause) return plain(<div className="px-4 pb-4"><PauseCard looks={sessionLooks} onContinue={loadNext} /></div>)
  if (phase === 'welcome' && !nothingToPractice) return <DeckSkeleton onHelp={onHelp} />
  if (!guiding && flow.status === 'searching') return <DeckSkeleton onHelp={onHelp} line={t('searching')} />
  if (!guiding && flow.status === 'loading') return <DeckSkeleton onHelp={onHelp} />
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
    <SwapCard
      key={card.id}
      card={card}
      img={img}
      step={lesson ? t('guide.step', { n: lessonIndex + 1, total: lessons.length }) : null}
      lesson={lesson?.lesson ?? null}
      lessonMarks={lesson?.marks ?? NO_MARKS}
      lastLesson={!!lesson && lessonIndex + 1 === lessons.length}
      showGestureHint={sessionLooks === 0 || idle}
      onHelp={onHelp}
      onVoted={onVoted}
      onStale={loadNext}
      onNext={loadNext}
    />
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
