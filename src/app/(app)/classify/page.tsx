'use client'

import { animate, motion, useMotionValue, useReducedMotion, useTransform, type MotionValue, type PanInfo } from 'framer-motion'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { DipoleFigure } from '@/components/classify/dipole-figure'
import { PhotoViewer, useOffsetLabel } from '@/components/classify/photo-viewer'
import { IconCards, IconFlashlight, IconMore, IconMoves, IconQuestion, IconStill } from '@/components/icons'
import { LoginForm } from '@/components/shell/login-sheet'
import { CatalogLinks } from '@/components/ui/catalog-links'
import { Button, EmptyState, IconButton, Notice, Sheet, Skeleton, TopBar } from '@/components/ui/primitives'
import { api, ApiError, unwrap, type DeckCard, type Reveal } from '@/lib/api/client'
import { useGlitch, useGuideCard, useSession, useVote, type Choice, type VotePosition } from '@/lib/api/hooks'
import type { CardHint } from '@/lib/explore/flashlight'
import { exploreQueue, isSkyCard, type SkyPlayCard } from '@/lib/explore/queue'
import { cx, formatWavelength } from '@/lib/format'
import { useUi } from '@/lib/state/ui'
import { useFmt } from '@/lib/use-fmt'

type VoteResult = NonNullable<ReturnType<typeof useVote>['data']>
type Mark = { u: number; v: number }

const SWIPE = 110
const PAUSE_EVERY = 25
const IDLE_MS = 12_000
const QUIET_RUN = 10

type PlayCard = DeckCard | SkyPlayCard

function useSprite(src: string | undefined) {
  const [img, setImg] = useState<{ src: string; el: HTMLImageElement } | null>(null)
  useEffect(() => {
    if (!src) return
    const el = new Image()
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

function ChoiceButton({ label, onClick, disabled, pressed, primary, children }: { label: string; onClick: () => void; disabled: boolean; pressed?: boolean; primary?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={pressed}
      onClick={onClick}
      className="group flex min-w-24 flex-col items-center gap-2 rounded-2xl px-2 py-1 disabled:opacity-50"
    >
      <span className="flex h-16 items-center">
        <span
          className={cx(
            'inline-flex items-center justify-center rounded-full border-[0.5px] motion-safe:transition-transform group-active:scale-95',
            primary ? 'size-16' : 'size-12',
            pressed ? 'border-accent bg-accent text-on-accent' : 'border-divider bg-bg-elevated text-text',
          )}
        >
          {children}
        </span>
      </span>
      <span className={cx('text-note font-semibold', primary ? 'text-text' : 'text-text-secondary')}>{label}</span>
    </button>
  )
}

function GuideArrow({ marks, panel }: { marks: Mark[]; panel: number }) {
  const [a, b] = marks
  if (!a || !b) return null
  return (
    <svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <marker id="guide-head" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10Z" fill="var(--color-crosshair)" />
        </marker>
      </defs>
      <line x1={a.u * 100} y1={a.v * 100} x2={a.u * 100 + (b.u - a.u) * 100 * 0.86} y2={a.v * 100 + (b.v - a.v) * 100 * 0.86} stroke="var(--color-crosshair)" strokeWidth="1.4" markerEnd="url(#guide-head)" />
      <circle cx={a.u * 100} cy={a.v * 100} r="6" fill="none" stroke="var(--color-crosshair)" strokeWidth={panel === 0 ? 1.6 : 0.8} opacity={panel === 0 ? 1 : 0.55} />
      <circle cx={b.u * 100} cy={b.v * 100} r="6" fill="none" stroke="var(--color-crosshair)" strokeWidth={panel === 1 ? 1.6 : 0.8} opacity={panel === 1 ? 1 : 0.55} />
    </svg>
  )
}

function HintsOverlay({ hints, panel }: { hints: CardHint[]; panel: number }) {
  const t = useTranslations('classify.flashlight')
  const here = hints.filter((h) => h.visit === panel)
  return (
    <>
      <svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 100 100" aria-hidden="true">
        {hints.map((h, i) => (
          <circle key={i} cx={h.u * 100} cy={h.v * 100} r="7.5" fill="none" stroke="var(--color-crosshair)" strokeWidth={h.visit === panel ? 1 : 0.6} opacity={h.visit === panel ? 0.95 : 0.35} />
        ))}
      </svg>
      <span className="pointer-events-none absolute inset-x-2 bottom-2 rounded-xl bg-media-scrim px-2.5 py-1.5 text-meta font-medium leading-snug text-on-media" aria-live="polite">
        {here[0] ? t(`kinds.${here[0].kind}`) : hints.length ? t('elsewhere') : t('none')}
      </span>
    </>
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

function SpotRing({ u, v }: Mark) {
  return (
    <svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx={u * 100} cy={v * 100} r="7" fill="none" stroke="var(--color-mark-mine)" strokeWidth="1.2" />
      <circle cx={u * 100} cy={v * 100} r="9" fill="none" stroke="var(--color-mark-halo)" strokeOpacity="0.5" strokeWidth="0.6" />
    </svg>
  )
}

function MarksOverlay({ marks, panel }: { marks: Mark[]; panel: number }) {
  const m = marks[panel]
  if (!m) return null
  return (
    <svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx={m.u * 100} cy={m.v * 100} r="7" fill="none" stroke="var(--color-crosshair)" strokeWidth="0.9" />
      <circle cx={m.u * 100} cy={m.v * 100} r="9.5" fill="none" stroke="var(--color-mark-halo)" strokeOpacity="0.5" strokeWidth="0.6" />
    </svg>
  )
}

function CardFrame({ children, x, y }: { children: ReactNode; x?: MotionValue<number>; y?: MotionValue<number> }) {
  const zero = useMotionValue(0)
  const mx = x ?? zero
  const my = y ?? zero
  const moves = useTransform(mx, [24, SWIPE], [0, 1])
  const still = useTransform(mx, [-SWIPE, -24], [1, 0])
  const unsure = useTransform(my, [-SWIPE, -24], [1, 0])
  return (
    <div className="relative overflow-hidden rounded-2xl border-[0.5px] border-divider bg-bg-elevated">
      {children}
      {x && (
        <>
          <motion.span aria-hidden="true" style={{ opacity: moves }} className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-inset ring-accent" />
          <motion.span aria-hidden="true" style={{ opacity: still }} className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-inset ring-text-secondary" />
          <motion.span aria-hidden="true" style={{ opacity: unsure }} className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-inset ring-warning" />
        </>
      )}
    </div>
  )
}

function VoteCard({
  card,
  header,
  img,
  guide,
  overlay,
  showHints,
  onVoted,
  onStale,
  onSkipGuide,
}: {
  card: PlayCard
  header: ReactNode
  img: HTMLImageElement | null
  guide: Mark[] | null
  overlay?: (panel: number) => ReactNode
  showHints: boolean
  onVoted: (choice: Choice, r: VoteResult) => void
  onStale: () => void
  onSkipGuide: () => void
}) {
  const t = useTranslations('classify')
  const reduce = useReducedMotion()
  const toast = useUi((s) => s.toast)
  const vote = useVote()
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const rotate = useTransform(x, [-240, 240], reduce ? [0, 0] : [-6, 6])
  const movesOpacity = useTransform(x, [24, SWIPE], [0, 1])
  const stillOpacity = useTransform(x, [-SWIPE, -24], [1, 0])
  const unsureOpacity = useTransform(y, [-SWIPE, -24], [1, 0])
  const busy = useRef(false)
  const [pending, setPending] = useState(false)
  const [playing, setPlaying] = useState(true)
  const [locating, setLocating] = useState(false)
  const [spot, setSpot] = useState<VotePosition | null>(null)

  const settle = useCallback(() => {
    animate(x, 0, { type: 'spring', stiffness: 500, damping: 32 })
    animate(y, 0, { type: 'spring', stiffness: 500, damping: 32 })
  }, [x, y])

  const commit = useCallback(
    async (choice: Choice, position: VotePosition | null = null) => {
      if (busy.current || !img) return
      busy.current = true
      setPending(true)
      const target = choice === 'moves' ? { x: 520, y: 0 } : choice === 'still' ? { x: -520, y: 0 } : { x: 0, y: -720 }
      const fly = reduce
        ? Promise.resolve()
        : Promise.race([
            Promise.all([animate(x, target.x, { duration: 0.26, ease: 'easeIn' }), animate(y, target.y, { duration: 0.26, ease: 'easeIn' })]),
            new Promise((resolve) => setTimeout(resolve, 400)),
          ])
      try {
        const [r] = await Promise.all([vote.mutateAsync({ card_id: card.id, choice, ...(position ? { position } : {}) }), fly])
        onVoted(choice, r)
      } catch (err) {
        if (err instanceof ApiError && (err.code === 'already_voted' || err.code === 'card_not_issued')) {
          onStale()
          return
        }
        toast({ kind: 'info', key: 'classify.voteFailed' })
        settle()
        busy.current = false
        setPending(false)
      }
    },
    [card.id, img, onStale, onVoted, reduce, settle, toast, vote, x, y],
  )

  const choose = useCallback(
    (choice: Choice) => {
      if (busy.current || !img) return
      if (choice === 'moves' && !guide && !locating) {
        settle()
        setLocating(true)
        return
      }
      void commit(choice)
    },
    [commit, guide, img, locating, settle],
  )

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const dx = info.offset.x
    const dy = info.offset.y
    if (dx > SWIPE || info.velocity.x > 700) choose('moves')
    else if (dx < -SWIPE || info.velocity.x < -700) choose('still')
    else if (dy < -SWIPE || info.velocity.y < -700) choose('unsure')
    else settle()
  }

  const locate = (frame: number, u: number, v: number) => {
    const p = { frame, x: Math.round(u * 1e4) / 1e4, y: Math.round(v * 1e4) / 1e4 }
    setSpot(p)
    void commit('moves', p)
  }

  const viewerOverlay = (panel: number) => (
    <>
      {guide ? <GuideArrow marks={guide} panel={panel} /> : overlay?.(panel)}
      {spot && spot.frame === panel && <SpotRing u={spot.x} v={spot.y} />}
    </>
  )

  return (
    <>
      {locating ? (
        <div className="flex min-h-16 items-center gap-2 pb-2" role="status" aria-live="polite">
          <h2 className="min-w-0 flex-1 font-[family-name:var(--font-display)] text-title-lg font-bold leading-tight">{t('locate.prompt')}</h2>
          <Button variant="ghost" className="h-11 text-link" onClick={() => void commit('moves')} disabled={pending}>
            {t('locate.skip')}
          </Button>
        </div>
      ) : (
        header
      )}
      <motion.div
        drag={!pending && playing && !locating}
        dragMomentum={false}
        onDragEnd={onDragEnd}
        style={{ x, y, rotate, touchAction: playing && !locating ? 'none' : 'pan-y' }}
        initial={reduce ? false : { opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className={cx('relative', playing && !locating && 'cursor-grab active:cursor-grabbing')}
      >
        <Stamp label={t('moves')} tone="moves" style={{ opacity: movesOpacity }} className="left-4 top-4" />
        <Stamp label={t('still')} tone="still" style={{ opacity: stillOpacity }} className="right-4 top-4" />
        <Stamp label={t('unsure')} tone="unsure" style={{ opacity: unsureOpacity }} className="left-1/2 top-4 -translate-x-1/2" />
        <CardFrame x={x} y={y}>
          <PhotoViewer sprite={card.sprite} img={img} offsets={card.offsets_s} onPlayingChange={setPlaying} overlay={viewerOverlay} onLocate={locating && !pending ? locate : undefined} />
        </CardFrame>
      </motion.div>

      {guide && (
        <div className="relative mt-3 flex items-center gap-2 rounded-2xl bg-accent py-2 pl-4 pr-1 text-on-accent" role="note">
          <span className="absolute -top-1.5 left-8 size-3 rotate-45 bg-accent" aria-hidden="true" />
          <p className="flex-1 text-note font-medium leading-snug">{t('guide.body')}</p>
          <button type="button" onClick={onSkipGuide} className="min-h-11 shrink-0 rounded-full px-3 text-note font-semibold underline underline-offset-2">
            {t('guide.skip')}
          </button>
        </div>
      )}

      <div className="mt-4 flex items-start justify-center gap-3">
        <ChoiceButton label={t('still')} onClick={() => choose('still')} disabled={pending || !img} primary>
          <IconStill size={30} />
        </ChoiceButton>
        <ChoiceButton label={t('unsure')} onClick={() => choose('unsure')} disabled={pending || !img}>
          <IconQuestion size={24} />
        </ChoiceButton>
        <ChoiceButton label={t('moves')} onClick={() => (locating ? void commit('moves') : choose('moves'))} disabled={pending || !img} pressed={locating} primary>
          <IconMoves size={32} />
        </ChoiceButton>
      </div>
      {(showHints || locating) && (
        <div className="mt-3">
          <p className="text-center text-meta text-text-secondary">{locating ? t('locate.hint') : playing ? t('hints.swipe') : t('hints.paused')}</p>
        </div>
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
                  <span className="block">{formatWavelength([f.wl_min, f.wl_max])}</span>
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

function RevealPanel({ cardId, choice, result, pacing, onNext }: { cardId: string; choice: Choice; result: VoteResult; pacing: boolean; onNext: () => void }) {
  const t = useTranslations('classify')
  const glitch = useGlitch()
  const [glitchState, setGlitchState] = useState<'ask' | 'yes' | 'skipped'>('ask')
  const [about, setAbout] = useState(false)
  const panel = useRef<HTMLElement>(null)
  const { reveal, counted, guided } = result
  const control = reveal.control
  const known = reveal.known

  useEffect(() => {
    const el = panel.current
    if (!el) return
    const timer = setTimeout(() => el.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }), 350)
    return () => clearTimeout(timer)
  }, [])

  return (
    <section ref={panel} aria-labelledby="reveal-title" className="mt-4 scroll-mb-[calc(var(--height-bottomnav)+12px)] rounded-2xl bg-surface px-4 py-4">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-bg-elevated px-3 py-1 text-meta font-semibold text-text-secondary ring-1 ring-divider">{t('yourVote', { choice: t(choice) })}</span>
        <IconButton label={t('about.open')} onClick={() => setAbout(true)} className="ml-auto -mr-2">
          <IconMore />
        </IconButton>
      </div>

      {!counted && !guided && (
        <div className="mt-3">
          <Notice>{t('tooFast')}</Notice>
        </div>
      )}

      {control ? (
        <>
          <h2 id="reveal-title" className="mt-3 text-title-sm font-semibold">
            {t('whatWasIt')}
          </h2>
          <p className="mt-1.5 text-body leading-snug">{t(`kinds.${reveal.kind}`)}</p>
          {known && <p className="mt-1.5 text-note text-text-secondary">{t('known', { name: known.name })}</p>}
          <p className="mt-3 text-body text-text-secondary">{control.correct === null ? t('checks.unsure') : control.correct ? t('checks.same') : t('checks.different')}</p>
        </>
      ) : (
        <>
          <h2 id="reveal-title" className="mt-3 text-title-sm font-semibold">
            {t('nobodyKnows')}
          </h2>
          <p className="mt-1.5 text-note text-text-secondary">{reveal.kind === 'sky' ? t('sky.reveal') : t('guess', { guess: t(`guesses.${reveal.kind}`) })}</p>
          <p className="mt-3 text-body">{reveal.outcome === 'moves' ? t('outcome.moves') : reveal.outcome === 'still' ? t('outcome.still') : reveal.outcome === 'undecided' ? t('outcome.undecided') : t('outcome.open', { n: reveal.looked })}</p>
        </>
      )}

      {guided && (
        <div className="mt-4 rounded-xl bg-bg-elevated px-3 py-3 ring-1 ring-divider">
          <h3 className="text-ui font-semibold">{t('help.slowTitle')}</h3>
          <p className="mt-1 mb-3 text-note leading-snug text-text-secondary">{t('help.slowBody')}</p>
          <DipoleFigure />
        </div>
      )}

      {pacing && <p className="mt-3 text-note text-text-secondary">{t('pacing')}</p>}

      {choice === 'still' && glitchState !== 'skipped' && (
        <div className="mt-4 rounded-xl bg-bg-elevated px-3 py-3 ring-1 ring-divider">
          {glitchState === 'yes' ? (
            <p className="text-note text-text-secondary">{t('glitch.thanks')}</p>
          ) : (
            <>
              <p className="text-note leading-snug">{t('glitch.question')}</p>
              <div className="mt-2 flex gap-2">
                <Button className="h-11" disabled={glitch.isPending} onClick={() => glitch.mutate({ cardId, glitch: true }, { onSuccess: () => setGlitchState('yes') })}>
                  {t('glitch.yes')}
                </Button>
                <Button variant="ghost" className="h-11 text-text-secondary" onClick={() => setGlitchState('skipped')}>
                  {t('glitch.skip')}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="mt-4">
        <Button variant="primary" full className="h-11" onClick={onNext}>
          {t('next')}
        </Button>
      </div>
      <AboutCardSheet open={about} onClose={() => setAbout(false)} reveal={reveal} />
    </section>
  )
}

function DeckSkeleton() {
  return (
    <div aria-hidden="true">
      <Skeleton className="aspect-[0.82] w-full rounded-2xl" />
      <div className="mt-4 flex justify-center gap-6">
        <Skeleton className="size-16 rounded-full" />
        <Skeleton className="mt-2 size-12 rounded-full" />
        <Skeleton className="size-16 rounded-full" />
      </div>
    </div>
  )
}

type DeckState = { status: 'loading' | 'searching' | 'ready' | 'done' | 'error'; card: PlayCard | null }

let sessionLooks = 0
let quietRun = 0

function useDeckFlow(enabled: boolean) {
  const [state, setState] = useState<DeckState>({ status: 'loading', card: null })
  const live = useRef(true)
  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])

  const load = useCallback(async () => {
    setState({ status: 'loading', card: null })
    try {
      let r = await api
        .GET('/api/classify/next', { params: { query: { explore: true } } })
        .then(unwrap)
        .catch(async () => {
          await new Promise((resolve) => setTimeout(resolve, 1200))
          return unwrap(await api.GET('/api/classify/next', { params: { query: { explore: true } } }))
        })
      if (r.interesting) {
        const strong = exploreQueue.takeStrong()
        if (strong) {
          if (live.current) setState({ status: 'ready', card: strong })
          return
        }
      }
      if (r.sky) {
        const sky = exploreQueue.take()
        if (sky) {
          if (live.current) setState({ status: 'ready', card: sky })
          return
        }
        r = unwrap(await api.GET('/api/classify/next', { params: { query: { explore: true, known: true } } }))
      }
      if (r.card) {
        if (live.current) setState({ status: 'ready', card: r.card })
        return
      }
      if (!r.sky) {
        if (live.current) setState({ status: 'done', card: null })
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

  return { ...state, reload: load }
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
    <div aria-live="polite">
      <DeckSkeleton />
      <p className="mt-3 text-center text-note text-text-secondary">{t('searching')}</p>
    </div>
  )
}

function Deck() {
  const t = useTranslations('classify')
  const tc = useTranslations('common')
  const reduce = useReducedMotion()
  const guideDone = useUi((s) => s.classifyGuideDone)
  const finishGuide = useUi((s) => s.finishClassifyGuide)
  const pacingSeen = useUi((s) => s.classifyPacingSeen)
  const markPacingSeen = useUi((s) => s.markPacingSeen)
  const [guideActive] = useState(!guideDone)
  const guideQuery = useGuideCard(guideActive)
  const [guideOver, setGuideOver] = useState(false)
  const guiding = guideActive && !guideOver && !!guideQuery.data?.card
  const flow = useDeckFlow(!guideActive || guideOver || (guideQuery.isFetched && !guideQuery.data?.card))
  const [result, setResult] = useState<{ cardId: string; choice: Choice; data: VoteResult; pacing: boolean } | null>(null)
  const [pause, setPause] = useState(false)
  const [hintsOn, setHintsOn] = useState(false)
  const card: PlayCard | null = guiding ? (guideQuery.data?.card ?? null) : flow.card
  const img = useSprite(card?.sprite)
  const cardId = card?.id
  const voted = !!result && result.cardId === cardId
  const idle = useIdle(cardId ?? 'none')

  useEffect(() => {
    setHintsOn(voted)
  }, [cardId, voted])

  useEffect(() => {
    exploreQueue.start()
    return () => exploreQueue.stop()
  }, [])

  const endGuide = useCallback(() => {
    finishGuide()
    setGuideOver(true)
  }, [finishGuide])

  const onVoted = useCallback(
    (choice: Choice, data: VoteResult) => {
      let pacing = false
      if (!guiding) {
        quietRun = choice === 'moves' ? 0 : quietRun + 1
        if (!pacingSeen) {
          pacing = true
          markPacingSeen()
        } else if (quietRun > 0 && quietRun % QUIET_RUN === 0) pacing = true
      }
      if (card) setResult({ cardId: card.id, choice, data, pacing })
      if (guiding) finishGuide()
      sessionLooks++
    },
    [card, guiding, finishGuide, pacingSeen, markPacingSeen],
  )
  const loadNext = useCallback(() => {
    setResult(null)
    window.scrollTo({ top: 0 })
    exploreQueue.release(isSkyCard(flow.card) ? flow.card : null)
    if (guiding) {
      setGuideOver(true)
      return
    }
    if (sessionLooks > 0 && sessionLooks % PAUSE_EVERY === 0 && !pause) {
      setPause(true)
      return
    }
    setPause(false)
    void flow.reload()
  }, [flow, guiding, pause])

  if (pause) return <PauseCard looks={sessionLooks} onContinue={loadNext} />
  if (guideActive && guideQuery.isLoading) return <DeckSkeleton />
  if (!guiding && flow.status === 'searching') return <Searching />
  if (!guiding && flow.status === 'loading' && !result) return <DeckSkeleton />
  if (!guiding && flow.status === 'error')
    return (
      <EmptyState
        title={tc('retry')}
        action={
          <Button variant="primary" onClick={() => flow.reload()}>
            {tc('retry')}
          </Button>
        }
      />
    )
  if (!card) return <EmptyState art={<IconCards size={56} className="text-accent" />} title={t('done')} body={t('doneBody')} />

  const sky = isSkyCard(card)
  const header = (
    <div className="flex min-h-16 items-center gap-2 pb-2">
      <div className="min-w-0 flex-1">
        <h2 className="font-[family-name:var(--font-display)] text-title-lg font-bold leading-tight">{t('question')}</h2>
        {sky && <p className="text-meta text-text-secondary">{t('sky.label')}</p>}
      </div>
      {sky && <FlashlightButton on={hintsOn} onChange={setHintsOn} />}
    </div>
  )
  const hints = sky && hintsOn ? card.hints : null

  if (result && result.cardId === card.id)
    return (
      <motion.div initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        {header}
        <CardFrame>
          <PhotoViewer sprite={card.sprite} img={img} offsets={card.offsets_s} reveal={result.data.reveal} overlay={(panel) => (hints ? <HintsOverlay hints={hints} panel={panel} /> : <MarksOverlay marks={result.data.reveal.marks} panel={panel} />)} />
        </CardFrame>
        <RevealPanel cardId={card.id} choice={result.choice} result={result.data} pacing={result.pacing} onNext={loadNext} />
      </motion.div>
    )

  return (
    <VoteCard
      key={card.id}
      card={card}
      header={header}
      img={img}
      overlay={hints ? (panel) => <HintsOverlay hints={hints} panel={panel} /> : undefined}
      guide={guiding ? (guideQuery.data?.marks ?? []) : null}
      showHints={sessionLooks === 0 || idle}
      onVoted={onVoted}
      onStale={loadNext}
      onSkipGuide={endGuide}
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
  return (
    <main className="min-h-[calc(100dvh-var(--height-bottomnav))]">
      <TopBar
        title={t('title')}
        back={false}
        actions={
          <IconButton label={t('help.open')} onClick={() => setHelp(true)}>
            <IconQuestion size={26} />
          </IconButton>
        }
      />
      {isLoading ? (
        <div className="px-4 pt-2">
          <DeckSkeleton />
        </div>
      ) : !user ? (
        <LoginIntro />
      ) : (
        <div className="px-4 pb-6 pt-1">
          <Deck />
        </div>
      )}
      <HelpSheet open={help} onClose={() => setHelp(false)} />
    </main>
  )
}
