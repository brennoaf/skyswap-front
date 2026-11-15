'use client'

import { animate, motion, useMotionValue, useReducedMotion, useTransform, type MotionValue } from 'framer-motion'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { DipoleFigure } from '@/components/classify/dipole-figure'
import { VoiceMark, VoiceSymbol, type Voice } from '@/components/classify/voices'
import { PhotoViewer, useOffsetLabel } from '@/components/classify/photo-viewer'
import { IconCards, IconFlashlight, IconMore, IconMoves, IconQuestion, IconStill } from '@/components/icons'
import { LoginForm } from '@/components/shell/login-sheet'
import { CatalogLinks } from '@/components/ui/catalog-links'
import { Button, EmptyState, IconButton, Sheet, Skeleton, TopBar } from '@/components/ui/primitives'
import { api, ApiError, unwrap, type DeckCard, type Reveal } from '@/lib/api/client'
import { useGuideCard, useSession, useVote, type Choice, type VotePosition } from '@/lib/api/hooks'
import type { CardHint } from '@/lib/explore/flashlight'
import { exploreQueue, isSkyCard, type SkyPlayCard } from '@/lib/explore/queue'
import { cx, formatWavelength } from '@/lib/format'
import { useUi } from '@/lib/state/ui'
import { useFmt } from '@/lib/use-fmt'

type VoteResult = NonNullable<ReturnType<typeof useVote>['data']>
type Mark = { u: number; v: number }

const SWIPE = 110
const CONFIRM_MS = 3000
const DEMO_S = 1.4
const DEMO_REST_S = 0.9
const TIP_MS = 6000
const PAUSE_EVERY = 25
const IDLE_MS = 12_000
const QUIET_RUN = 10

type PlayCard = DeckCard | SkyPlayCard
type Lesson = 'moves' | 'still' | 'glitch'
type Answer = Choice | 'glitch'

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

function Stamp({ label, tone, style, className }: { label: string; tone: 'moves' | 'still' | 'unsure'; style: { opacity: MotionValue<number> }; className: string }) {
  return (
    <motion.span
      aria-hidden="true"
      style={style}
      className={cx(
        'pointer-events-none absolute z-10 whitespace-nowrap rounded-full bg-sheet px-3 py-1.5 text-note font-semibold ring-2',
        tone === 'moves' ? 'text-accent ring-accent' : tone === 'still' ? 'text-text ring-text-secondary' : 'text-text ring-warning',
        className,
      )}
    >
      {label}
    </motion.span>
  )
}

function ChoiceButton({ label, onClick, disabled, pressed, primary, children }: { label: string; onClick: () => void; disabled: boolean; pressed?: boolean; primary?: boolean; children?: ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={pressed}
      onClick={onClick}
      className={cx(
        'inline-flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-2xl border-[0.5px] font-semibold motion-safe:transition-transform active:scale-[0.98] disabled:opacity-50',
        primary ? 'h-[52px] flex-1 text-ui' : 'h-10 flex-1 text-note',
        pressed ? 'border-accent bg-accent text-on-accent' : primary ? 'border-divider bg-bg-elevated text-text' : 'border-transparent bg-transparent text-text-secondary',
      )}
    >
      {children}
      {label}
    </button>
  )
}

function CardHeader({ title, sub, actions, answer }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; answer?: boolean }) {
  return (
    <header className="relative z-10 flex min-h-[var(--height-topbar)] shrink-0 items-center gap-1 bg-bg py-1 pl-4 pr-1">
      <div className="min-w-0 flex-1">
        <h1 className={cx('line-clamp-2 font-[family-name:var(--font-display)] font-bold leading-tight', answer ? 'text-title-sm' : 'text-handle')}>{title}</h1>
        {sub && <p className="truncate text-meta text-text-secondary">{sub}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </header>
  )
}

function HelpButton({ onClick }: { onClick: () => void }) {
  const t = useTranslations('classify')
  return (
    <IconButton label={t('help.open')} onClick={onClick}>
      <IconQuestion size={26} />
    </IconButton>
  )
}

function Fill({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('flex min-h-0 flex-1 flex-col', className)}>{children}</div>
}

function GuideArrow({ marks, panel }: { marks: Mark[]; panel: number }) {
  const [a, b] = marks
  if (!a || !b) return null
  return (
    <svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <marker id="guide-head" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10Z" fill="var(--color-on-media)" />
        </marker>
      </defs>
      <line x1={a.u * 100} y1={a.v * 100} x2={a.u * 100 + (b.u - a.u) * 100 * 0.86} y2={a.v * 100 + (b.v - a.v) * 100 * 0.86} stroke="var(--color-on-media)" strokeWidth="1" strokeDasharray="3 2" markerEnd="url(#guide-head)" />
      <circle cx={a.u * 100} cy={a.v * 100} r="6" fill="none" stroke="var(--color-on-media)" strokeWidth={panel === 0 ? 1.2 : 0.6} opacity={panel === 0 ? 1 : 0.5} />
      <circle cx={b.u * 100} cy={b.v * 100} r="6" fill="none" stroke="var(--color-on-media)" strokeWidth={panel === 1 ? 1.2 : 0.6} opacity={panel === 1 ? 1 : 0.5} />
    </svg>
  )
}

type Demo = 'right' | 'left' | 'up'

function GestureHand({ demo }: { demo: Demo }) {
  const reduce = useReducedMotion()
  const travel = demo === 'right' ? { x: [0, 56, 0] } : demo === 'left' ? { x: [0, -56, 0] } : { y: [0, -56, 0] }
  return (
    <motion.span aria-hidden="true" data-testid="gesture-hand" className="pointer-events-none absolute bottom-[22%] left-1/2 z-20 -ml-5 text-on-media drop-shadow" animate={reduce ? undefined : travel} transition={{ duration: DEMO_S, repeat: Infinity, repeatDelay: DEMO_REST_S, ease: 'easeInOut' }}>
      <svg viewBox="0 0 24 24" className="size-10" fill="currentColor" stroke="var(--color-mark-halo)" strokeWidth="0.8">
        <path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V10l5.6 1.1c1.2.2 2 1.3 1.9 2.5l-.5 4.2A3.5 3.5 0 0 1 15.5 21h-2.2a4 4 0 0 1-3-1.4l-4-4.6a1.5 1.5 0 0 1 2.2-2L9 13.5V11Z" />
      </svg>
    </motion.span>
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

function HintCaption({ hints, panel }: { hints: CardHint[]; panel: number }) {
  const t = useTranslations('classify.flashlight')
  const here = hints.find((h) => h.visit === panel)
  return (
    <p className="pb-2 pt-1 text-note leading-snug" aria-live="polite">
      {here ? t(`kinds.${here.kind}`) : hints.length ? t('elsewhere') : t('none')}
    </p>
  )
}

function FlashlightButton({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  const t = useTranslations('classify.flashlight')
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className={cx('inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-3 text-note font-semibold', on ? 'bg-text text-bg' : 'bg-surface text-text')}
    >
      <IconFlashlight size={20} />
      {t('button')}
    </button>
  )
}

function GuideRing({ marks, panel }: { marks: Mark[]; panel: number }) {
  const m = marks[panel]
  if (!m) return null
  return (
    <svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx={m.u * 100} cy={m.v * 100} r="7" fill="none" stroke="var(--color-on-media)" strokeWidth="0.9" strokeDasharray="3 2" />
    </svg>
  )
}

function ConfirmStrip({ choice, stage, marked, canMark, onUndo, onSend }: { choice: string; stage: 'confirm' | 'marking' | 'sending' | 'failed'; marked: boolean; canMark: boolean; onUndo: () => void; onSend: () => void }) {
  const t = useTranslations('classify.confirm')
  const reduce = useReducedMotion()
  const failed = stage === 'failed'
  const sending = stage === 'sending'
  const note = failed ? t('failed') : sending ? t('saving') : marked ? t('marked') : canMark ? t('tap') : t('nothingSent')
  return (
    <section role="status" aria-live="polite" className="relative shrink-0 overflow-hidden px-3 pb-2 pt-2">
      {stage === 'confirm' && !reduce && <motion.span aria-hidden="true" className="absolute inset-x-3 top-0 h-[3px] origin-left rounded-full bg-accent" initial={{ scaleX: 1 }} animate={{ scaleX: 0 }} transition={{ duration: CONFIRM_MS / 1000, ease: 'linear' }} />}
      <p className="truncate text-ui font-semibold">{t('said', { choice })}</p>
      <p className={cx('truncate text-note', failed ? 'font-medium text-danger' : 'text-text-secondary')}>{note}</p>
      <div className="mt-1.5 flex gap-2">
        <Button className="h-[52px] flex-[1.2] text-ui font-semibold" disabled={sending} onClick={onUndo}>
          {t('undo')}
        </Button>
        <Button variant="primary" className="h-[52px] flex-1 text-ui font-semibold" disabled={sending} onClick={onSend}>
          {failed ? t('retry') : t('see')}
        </Button>
      </div>
    </section>
  )
}

function VoteCard({
  card,
  header,
  img,
  guide,
  overlay,
  caption,
  showHints,
  lesson,
  lessonIndex,
  lessonTotal,
  hintsUsed,
  onVoted,
  onStale,
  onSkipGuide,
}: {
  card: PlayCard
  header: ReactNode
  img: HTMLImageElement | null
  guide: Mark[] | null
  overlay?: (panel: number) => ReactNode
  caption?: (panel: number) => ReactNode
  showHints: boolean
  lesson: Lesson | null
  lessonIndex: number
  lessonTotal: number
  hintsUsed: () => boolean
  onVoted: (answer: Answer, r: VoteResult, spot: VotePosition | null) => void
  onStale: () => void
  onSkipGuide: () => void
}) {
  const t = useTranslations('classify')
  const reduce = useReducedMotion()
  const vote = useVote()
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const rotate = useTransform(x, [-240, 240], reduce ? [0, 0] : [-6, 6])
  const movesOpacity = useTransform(x, [24, SWIPE], [0, 1])
  const stillOpacity = useTransform(x, [-SWIPE, -24], [1, 0])
  const unsureOpacity = useTransform(y, [-SWIPE, -24], [1, 0])
  const [held, setHeld] = useState<{ answer: Answer; at: number } | null>(null)
  const [stage, setStage] = useState<'confirm' | 'marking' | 'sending' | 'failed'>('confirm')
  const [spot, setSpot] = useState<VotePosition | null>(null)
  const tipsSeen = useUi((s) => s.tipsSeen)
  const markTip = useUi((s) => s.markTip)
  const [tip, setTip] = useState<string | null>(null)
  const [firstUp] = useState(() => !lesson && !tipsSeen.includes('swipeUp'))
  const [touched, setTouched] = useState(false)
  const demoControl = useRef<{ stop: () => void }[]>([])
  const demo: Demo | null = touched || !!held ? null : lesson === 'moves' ? 'right' : lesson === 'still' ? 'left' : firstUp ? 'up' : null

  const settle = useCallback(() => {
    animate(x, 0, { type: 'spring', stiffness: 500, damping: 32 })
    animate(y, 0, { type: 'spring', stiffness: 500, damping: 32 })
  }, [x, y])

  const undo = useCallback(() => {
    setHeld(null)
    setSpot(null)
    setStage('confirm')
  }, [])

  const send = useCallback(async () => {
    if (!held) return
    setStage('sending')
    try {
      const r = await vote.mutateAsync({ card_id: card.id, choice: held.answer === 'glitch' ? 'still' : held.answer, ...(held.answer === 'glitch' ? { glitch: true } : {}), hints: hintsUsed(), held_ms: Math.min(600000, Math.round(performance.now() - held.at)), ...(spot ? { position: spot } : {}) })
      onVoted(held.answer, r, spot)
    } catch (err) {
      if (err instanceof ApiError && (err.code === 'already_voted' || err.code === 'card_not_issued')) {
        onStale()
        return
      }
      setStage('failed')
    }
  }, [card.id, held, hintsUsed, onStale, onVoted, spot, vote])

  useEffect(() => {
    if (!held || stage !== 'confirm') return
    const timer = setTimeout(() => void send(), CONFIRM_MS)
    return () => clearTimeout(timer)
  }, [held, send, stage])

  useEffect(() => {
    if (!held) return
    const onHide = () => {
      if (document.visibilityState === 'hidden' && (stage === 'confirm' || stage === 'marking')) undo()
    }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [held, stage, undo])

  const choose = useCallback(
    (answer: Answer) => {
      if (held || !img) return
      settle()
      setHeld({ answer, at: performance.now() })
      setStage('confirm')
    },
    [held, img, settle],
  )

  const showTip = useCallback(
    (key: string) => {
      if (tipsSeen.includes(key)) return
      markTip(key)
      setTip(key)
    },
    [markTip, tipsSeen],
  )

  useEffect(() => {
    if (!tip) return
    const timer = setTimeout(() => setTip(null), TIP_MS)
    return () => clearTimeout(timer)
  }, [tip])

  useEffect(() => {
    if (firstUp) markTip('swipeUp')
  }, [firstUp, markTip])

  useEffect(() => {
    if (!demo || reduce) return
    const pull = (m: MotionValue<number>, to: number) => animate(m, [0, to, 0], { duration: DEMO_S, repeat: Infinity, repeatDelay: DEMO_REST_S, ease: 'easeInOut' })
    const controls = demo === 'up' ? [pull(y, -34)] : [pull(x, demo === 'right' ? 34 : -34)]
    demoControl.current = controls
    return () => {
      for (const c of controls) c.stop()
      x.set(0)
      y.set(0)
    }
  }, [demo, reduce, x, y])

  const onPaused = useCallback(
    (playing: boolean) => {
      if (!playing) showTip('hold')
    },
    [showTip],
  )

  const onRelease = (dx: number, dy: number, vx: number, vy: number) => {
    const sideways = Math.abs(dx) >= Math.abs(dy)
    if (sideways && (dx > SWIPE || vx > 700)) choose('moves')
    else if (sideways && (dx < -SWIPE || vx < -700)) choose('still')
    else if (!sideways && (dy < -SWIPE || vy < -700)) choose('unsure')
    else {
      settle()
      if (Math.hypot(dx, dy) > 30) showTip('short')
    }
  }

  const canMark = held?.answer === 'moves' && (stage === 'confirm' || stage === 'marking')
  const locate = (frame: number, u: number, v: number) => {
    setSpot({ frame, x: Math.round(u * 1e4) / 1e4, y: Math.round(v * 1e4) / 1e4 })
    setStage('marking')
  }

  const viewerOverlay = (panel: number) => (
    <>
      {guide ? lesson === 'glitch' ? <GuideRing marks={guide} panel={panel} /> : <GuideArrow marks={guide} panel={panel} /> : overlay?.(panel)}
      {spot && <VoiceMark voice="you" u={spot.x} v={spot.y} faint={spot.frame !== panel} />}
    </>
  )

  return (
    <>
      {header}
      <motion.div
        onPointerDownCapture={(e) => {
          if (!(e.target instanceof HTMLCanvasElement)) return
          for (const c of demoControl.current) c.stop()
          demoControl.current = []
          setTouched(true)
        }}
        style={{ x, y, rotate }}
        initial={reduce ? false : { opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative flex min-h-0 flex-1 flex-col"
      >
        <Stamp label={t('moves')} tone="moves" style={{ opacity: movesOpacity }} className="left-4 top-4" />
        <Stamp label={t('still')} tone="still" style={{ opacity: stillOpacity }} className="right-4 top-4" />
        <Stamp label={t('unsure')} tone="unsure" style={{ opacity: unsureOpacity }} className="left-1/2 top-4 -translate-x-1/2" />
        {demo && <GestureHand demo={demo} />}
        <PhotoViewer compact={!!held} note={held ? undefined : tip || firstUp ? <span role="status">{t(`tips.${tip ?? 'swipeUp'}`)}</span> : showHints && !lesson ? t('hints.swipe') : undefined} onPlayingChange={onPaused} fit hold={stage === 'marking'} swipe={{ x, y, enabled: !held && !!img, threshold: SWIPE, onRelease, onCancel: settle }} sprite={card.sprite} img={img} offsets={card.offsets_s} overlay={viewerOverlay} caption={caption} onTouchPhoto={canMark ? () => setStage('marking') : undefined} onLocate={canMark ? locate : undefined} />
      </motion.div>

      {lesson && !held && (
        <div className="mx-3 mt-1 flex shrink-0 items-center gap-2 rounded-2xl bg-surface py-1 pl-3 pr-1" role="note">
          <p className="flex-1 text-note leading-snug">
            <span className="font-semibold">{t('guide.step', { n: lessonIndex + 1, total: lessonTotal })}</span> {t(`guide.${lesson}`)}
          </p>
          <button type="button" onClick={onSkipGuide} className="min-h-11 shrink-0 rounded-full px-3 text-note font-semibold text-link">
            {t('guide.skip')}
          </button>
        </div>
      )}

      {held ? (
        <ConfirmStrip choice={t(held.answer)} stage={stage} marked={!!spot} canMark={held.answer === 'moves'} onUndo={undo} onSend={() => void send()} />
      ) : (
        <>
          <div className="shrink-0 px-3 pb-2 pt-2">
            <div className="flex gap-2">
              <ChoiceButton label={t('still')} onClick={() => choose('still')} disabled={!img} primary>
                <IconStill size={24} />
              </ChoiceButton>
              <ChoiceButton label={t('moves')} onClick={() => choose('moves')} disabled={!img} primary>
                <IconMoves size={24} />
              </ChoiceButton>
            </div>
            <div className="mt-1 flex gap-2">
              <ChoiceButton label={t('glitch')} onClick={() => choose('glitch')} disabled={!img} pressed={lesson === 'glitch'} />
              <ChoiceButton label={t('unsure')} onClick={() => choose('unsure')} disabled={!img} />
            </div>
          </div>
        </>
      )}
    </>
  )
}

function HelpSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('classify.help')
  return (
    <Sheet open={open} onClose={onClose} title={t('title')}>
      <div className="space-y-5 px-4 py-4">
        <section>
          <h3 className="text-ui font-semibold">{t('gesturesTitle')}</h3>
          <p className="mt-1 text-body text-text-secondary">{t('gesturesBody')}</p>
        </section>
        <section>
          <h3 className="text-ui font-semibold">{t('jumpTitle')}</h3>
          <p className="mt-1 text-body text-text-secondary">{t('jumpBody')}</p>
        </section>
        <section>
          <h3 className="text-ui font-semibold">{t('slowTitle')}</h3>
          <p className="mt-1 mb-3 text-body text-text-secondary">{t('slowBody')}</p>
          {open && <DipoleFigure />}
        </section>
        <section>
          <h3 className="text-ui font-semibold">{t('glitchTitle')}</h3>
          <p className="mt-1 text-body text-text-secondary">{t('glitchBody')}</p>
        </section>
        <section>
          <h3 className="text-ui font-semibold">{t('emptyTitle')}</h3>
          <p className="mt-1 text-body text-text-secondary">{t('emptyBody')}</p>
        </section>
      </div>
    </Sheet>
  )
}

function AboutCardSheet({ open, onClose, reveal }: { open: boolean; onClose: () => void; reveal: Reveal }) {
  const t = useTranslations('classify.about')
  const fmt = useFmt()
  const label = useOffsetLabel()
  const first = reveal.frames[0]?.mjd ?? 0
  return (
    <Sheet open={open} onClose={onClose} title={t('title')}>
      <div className="space-y-5 px-4 py-4 text-body">
        {reveal.p_real !== null && (
          <section>
            <h3 className="font-semibold">{t('chance', { pct: Math.round(reveal.p_real * 100) })}</h3>
            <p className="mt-1 text-note text-text-secondary">{t('chanceHint')}</p>
          </section>
        )}
        <section>
          <h3 className="font-semibold">{t('photos')}</h3>
          <ul className="mt-1 divide-y-[0.5px] divide-divider">
            {reveal.frames.map((f, i) => (
              <li key={f.t + i} className="flex min-h-12 items-center justify-between gap-3 py-1 text-note">
                <span>{label((f.mjd - first) * 86400)}</span>
                <span className="text-right text-text-secondary">
                  <span className="block">{fmt.dateTime(f.t)}</span>
                  <span className="block">{t('infrared', { range: formatWavelength([f.wl_min, f.wl_max], fmt.locale) })}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
        <p className="text-note text-text-secondary">{t('field', { size: fmt.fixed(reveal.size_arcmin, 1), band: reveal.band })}</p>
        <section>
          <h3 className="font-semibold">{t('where')}</h3>
          <p className="mt-1 text-note text-text-secondary">{t(reveal.kind === 'sky' ? 'whereSky' : 'whereBody', { ra: fmt.fixed(reveal.ra, 4), dec: fmt.fixed(reveal.dec, 4) })}</p>
        </section>
        <CatalogLinks ra={reveal.ra} dec={reveal.dec} />
      </div>
    </Sheet>
  )
}

function WhySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('classify')
  return (
    <Sheet open={open} onClose={onClose} title={t('whyLook')}>
      <div className="px-4 py-4">
        <h3 className="text-ui font-semibold">{t('help.slowTitle')}</h3>
        <p className="mt-1 mb-3 text-note leading-snug text-text-secondary">{t('help.slowBody')}</p>
        {open && <DipoleFigure />}
      </div>
    </Sheet>
  )
}

function VoiceRow({ voice, name, children, on, onToggle }: { voice: Voice; name: string; children: ReactNode; on?: boolean; onToggle?: () => void }) {
  const body = (
    <>
      <VoiceSymbol voice={voice} className={on === false ? 'opacity-40' : undefined} />
      <span className="min-w-0 flex-1 text-left text-note leading-snug">
        <span className="font-semibold">{name}: </span>
        {children}
      </span>
    </>
  )
  if (!onToggle) return <div className="flex min-h-8 items-center gap-2 py-0.5">{body}</div>
  return (
    <button type="button" aria-pressed={on} onClick={onToggle} className="flex min-h-8 w-full items-center gap-2 py-0.5">
      {body}
    </button>
  )
}

function useVerdict(reveal: Reveal) {
  const t = useTranslations('classify')
  if (reveal.control) return reveal.known ? t('known', { name: reveal.known.name }) : t(`verdicts.${reveal.kind}`)
  return reveal.outcome === 'moves' || reveal.outcome === 'still' || reveal.outcome === 'undecided' ? t(`outcome.${reveal.outcome}`) : t('nobodyKnows')
}

function ResultLine({ result }: { result: VoteResult }) {
  const t = useTranslations()
  const { xp, counted, guided } = result
  const gained = xp.xp + xp.streakBonus
  const parts = [
    gained > 0 ? t('xp.gained', { xp: gained }) : null,
    guided ? t('classify.practice') : !counted ? t('classify.tooFast') : xp.reason === 'daily_cap' || xp.reason === 'diminished' ? t('xp.limit') : null,
    ...result.new_badges.map((b) => t('classify.newBadge', { name: t(`badges.items.${b}.name`) })),
  ].filter((p): p is string => !!p)
  if (!parts.length) return null
  return <p className="pt-1 text-note font-semibold leading-snug text-accent">{parts.join(' ')}</p>
}

function Understand({ card, img, answer, result, spot, pacing, hints, onNext }: { card: PlayCard; img: HTMLImageElement | null; answer: Answer; result: VoteResult; spot: VotePosition | null; pacing: boolean; hints: CardHint[] | null; onNext: () => void }) {
  const t = useTranslations('classify')
  const reduce = useReducedMotion()
  const { reveal, guided } = result
  const verdict = useVerdict(reveal)
  const [about, setAbout] = useState(false)
  const [why, setWhy] = useState(false)
  const [shown, setShown] = useState({ you: true, marks: true })
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const control = reveal.control
  const marksVoice: Voice = control?.truth === 'real' ? 'known' : 'program'
  const hasMarks = reveal.marks.length > 0 || !!hints?.length
  const showProgram = marksVoice === 'program' && (hasMarks || (!control && reveal.kind !== 'sky'))
  const comparison = !control || control.correct === null ? null : control.correct ? t('checks.same') : t('checks.different')
  const overlay = (panel: number) => {
    const mark = reveal.marks[panel]
    return (
      <>
        {shown.marks && hints && <HintRings hints={hints} panel={panel} />}
        {shown.marks && !hints && mark && <VoiceMark voice={marksVoice} u={mark.u} v={mark.v} />}
        {shown.you && spot && <VoiceMark voice="you" u={spot.x} v={spot.y} faint={spot.frame !== panel} />}
      </>
    )
  }
  return (
    <motion.div initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} className="flex min-h-0 flex-1 flex-col">
      <CardHeader
        answer
        title={<span id="reveal-title">{verdict}</span>}
        actions={
          <IconButton label={t('about.open')} onClick={() => setAbout(true)}>
            <IconMore />
          </IconButton>
        }
      />
      <div className="flex min-h-[190px] flex-1 flex-col">
        <PhotoViewer fit compact sprite={card.sprite} img={img} offsets={card.offsets_s} reveal={reveal} swipe={{ x, y, enabled: false, threshold: SWIPE, onRelease: () => undefined, onCancel: () => undefined }} overlay={overlay} caption={hints ? (panel) => <HintCaption hints={hints} panel={panel} /> : undefined} />
      </div>
      <section aria-labelledby="reveal-title" className="max-h-[38%] shrink-0 overflow-y-auto px-4 pt-1.5">
        <VoiceRow voice="you" name={t('voices.youName')} on={spot ? shown.you : undefined} onToggle={spot ? () => setShown((v) => ({ ...v, you: !v.you })) : undefined}>
          {t(answer)}
        </VoiceRow>
        {showProgram && (hints || reveal.kind !== 'sky') && (
          <VoiceRow voice="program" name={t('voices.programName')} on={hasMarks ? shown.marks : undefined} onToggle={hasMarks ? () => setShown((v) => ({ ...v, marks: !v.marks })) : undefined}>
            {hints ? t('voices.hints') : t('guess', { guess: t(`guesses.${reveal.kind}`) })}
          </VoiceRow>
        )}
        {control ? (
          <VoiceRow voice="known" name={t('voices.knownName')} on={marksVoice === 'known' && hasMarks ? shown.marks : undefined} onToggle={marksVoice === 'known' && hasMarks ? () => setShown((v) => ({ ...v, marks: !v.marks })) : undefined}>
            {t(control.truth === 'real' ? 'moves' : 'still')}
            {comparison && `. ${comparison}`}
          </VoiceRow>
        ) : (
          reveal.looked > 1 && (
            <VoiceRow voice="others" name={t('voices.othersName')}>
              {t('voices.others', { n: reveal.looked, moves: reveal.votes.real, still: reveal.votes.artifact })}
            </VoiceRow>
          )
        )}
        {(control || reveal.kind === 'sky') && <p className="pt-1 text-note leading-snug text-text-secondary">{control ? t(`kinds.${reveal.kind}`) : t('sky.reveal')}</p>}
        <ResultLine result={result} />
        {pacing && <p className="pt-1 text-note leading-snug text-text-secondary">{t('pacing')}</p>}
        {(guided || (control && reveal.kind === 'mover')) && (
          <button type="button" onClick={() => setWhy(true)} className="inline-flex min-h-9 items-center text-note font-semibold text-link">
            {t('whyLook')}
          </button>
        )}
      </section>
      <div className="shrink-0 px-3 pb-2 pt-1.5">
        <Button variant="primary" full className="h-11" onClick={onNext}>
          {t('next')}
        </Button>
      </div>
      <AboutCardSheet open={about} onClose={() => setAbout(false)} reveal={reveal} />
      <WhySheet open={why} onClose={() => setWhy(false)} />
    </motion.div>
  )
}

function DeckSkeleton() {
  return (
    <div aria-hidden="true" className="flex min-h-0 flex-1 flex-col px-3 pb-2">
      <Skeleton className="min-h-0 w-full flex-1 rounded-2xl" />
      <div className="mt-2 flex gap-2">
        <Skeleton className="h-[52px] flex-1 rounded-2xl" />
        <Skeleton className="h-[52px] flex-1 rounded-2xl" />
      </div>
      <Skeleton className="mt-2 h-8 w-full rounded-2xl" />
    </div>
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

function Searching() {
  const t = useTranslations('classify')
  return (
    <div aria-live="polite" className="flex min-h-0 flex-1 flex-col">
      <p className="pb-2 text-center text-note text-text-secondary">{t('searching')}</p>
      <DeckSkeleton />
    </div>
  )
}

function Deck({ onHelp }: { onHelp: () => void }) {
  const t = useTranslations('classify')
  const tc = useTranslations('common')
  const guideDone = useUi((s) => s.classifyGuideDone)
  const finishGuide = useUi((s) => s.finishClassifyGuide)
  const pacingSeen = useUi((s) => s.classifyPacingSeen)
  const markPacingSeen = useUi((s) => s.markPacingSeen)
  const [guideActive] = useState(!guideDone)
  const guideQuery = useGuideCard(guideActive)
  const [guideOver, setGuideOver] = useState(false)
  const [lessonIndex, setLessonIndex] = useState(0)
  const lessons = guideQuery.data?.lessons ?? []
  const lesson = guideActive && !guideOver ? lessons[lessonIndex] : undefined
  const guiding = !!lesson
  const flow = useDeckFlow(!guideActive || guideOver || (guideQuery.isFetched && !lessons.length))
  const [result, setResult] = useState<{ cardId: string; answer: Answer; data: VoteResult; pacing: boolean; spot: VotePosition | null } | null>(null)
  const [pause, setPause] = useState(false)
  const [hintsOn, setHintsOn] = useState(false)
  const hintsTouched = useRef<string | null>(null)
  const card: PlayCard | null = lesson ? lesson.card : flow.card
  const img = useSprite(card?.sprite)
  const cardId = card?.id
  const voted = !!result && result.cardId === cardId
  const idle = useIdle(cardId ?? 'none')

  useEffect(() => {
    setHintsOn(voted)
  }, [cardId, voted])

  useEffect(() => {
    if (cardId && !lesson && !voted) void api.POST('/api/classify/shown', { body: { card_id: cardId } })
  }, [cardId, lesson, voted])

  const hintsUsed = useCallback(() => !!cardId && hintsTouched.current === cardId, [cardId])

  useEffect(() => {
    exploreQueue.start()
    return () => exploreQueue.stop()
  }, [])

  const endGuide = useCallback(() => {
    finishGuide()
    setGuideOver(true)
  }, [finishGuide])

  const onVoted = useCallback(
    (answer: Answer, data: VoteResult, spot: VotePosition | null) => {
      let pacing = false
      if (!guiding && !data.reveal.control && data.reveal.kind !== 'sky') {
        quietRun = answer === 'moves' ? 0 : quietRun + 1
        if (!pacingSeen) {
          pacing = true
          markPacingSeen()
        } else if (quietRun > 0 && quietRun % QUIET_RUN === 0) pacing = true
      }
      if (card) setResult({ cardId: card.id, answer, data, pacing, spot })
      if (!guiding) {
        sessionLooks++
        flow.prepare()
      }
    },
    [card, flow, guiding, pacingSeen, markPacingSeen],
  )
  const loadNext = useCallback(() => {
    setResult(null)
    window.scrollTo({ top: 0 })
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

  const help = <HelpButton onClick={onHelp} />
  const plain = (body: ReactNode) => (
    <Fill>
      <CardHeader title={t('question')} actions={help} />
      {body}
    </Fill>
  )
  if (pause) return plain(<div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4"><PauseCard looks={sessionLooks} onContinue={loadNext} /></div>)
  if (guideActive && guideQuery.isLoading) return plain(<DeckSkeleton />)
  if (!guiding && flow.status === 'searching') return plain(<Searching />)
  if (!guiding && flow.status === 'loading' && !result) return plain(<DeckSkeleton />)
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

  const sky = isSkyCard(card)
  const header = (
    <CardHeader
      title={t('question')}
      sub={sky ? t('sky.label') : undefined}
      actions={
        <>
          {sky && (
            <FlashlightButton
              on={hintsOn}
              onChange={(on) => {
                if (on) hintsTouched.current = card.id
                setHintsOn(on)
              }}
            />
          )}
          {help}
        </>
      }
    />
  )
  const hints = sky && hintsOn ? card.hints : null

  if (result && result.cardId === card.id) return <Understand key={card.id} card={card} img={img} answer={result.answer} result={result.data} spot={result.spot} pacing={result.pacing} hints={hints} onNext={loadNext} />

  return (
    <Fill>
    <VoteCard
      key={card.id}
      card={card}
      header={header}
      img={img}
      overlay={hints ? (panel) => <HintRings hints={hints} panel={panel} /> : undefined}
      caption={hints ? (panel) => <HintCaption hints={hints} panel={panel} /> : undefined}
      guide={lesson && lesson.marks.length ? lesson.marks : null}
      lesson={lesson?.lesson ?? null}
      lessonIndex={lessonIndex}
      lessonTotal={lessons.length}
      hintsUsed={hintsUsed}
      showHints={sessionLooks === 0 || idle}
      onVoted={onVoted}
      onStale={loadNext}
      onSkipGuide={endGuide}
    />
    </Fill>
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
  return (
    <main className="flex h-[calc(100dvh-var(--height-bottomnav)-env(safe-area-inset-bottom))] flex-col overflow-hidden">
      {isLoading ? (
        <Fill>
          <CardHeader title={t('question')} />
          <DeckSkeleton />
        </Fill>
      ) : !user ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <TopBar title={t('title')} back={false} actions={<HelpButton onClick={() => setHelp(true)} />} />
          <LoginIntro />
        </div>
      ) : (
        <Deck onHelp={() => setHelp(true)} />
      )}
      <HelpSheet open={help} onClose={() => setHelp(false)} />
    </main>
  )
}
