'use client'

import { animate, motion, useMotionValue, useReducedMotion, useTransform, type MotionValue, type PanInfo } from 'framer-motion'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { DipoleFigure } from '@/components/classify/dipole-figure'
import { PhotoViewer, useOffsetLabel } from '@/components/classify/photo-viewer'
import { IconCards, IconChevronDownSmall, IconFlashlight, IconMore, IconMoves, IconQuestion, IconStill } from '@/components/icons'
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

function CardHeader({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex min-h-[var(--height-topbar)] shrink-0 items-center gap-1 pl-4 pr-1">
      <div className="min-w-0 flex-1">
        <h1 className="line-clamp-2 font-[family-name:var(--font-display)] text-handle font-bold leading-tight">{title}</h1>
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
          <path d="M0 0L10 5L0 10Z" fill="var(--color-crosshair)" />
        </marker>
      </defs>
      <line x1={a.u * 100} y1={a.v * 100} x2={a.u * 100 + (b.u - a.u) * 100 * 0.86} y2={a.v * 100 + (b.v - a.v) * 100 * 0.86} stroke="var(--color-crosshair)" strokeWidth="1.4" markerEnd="url(#guide-head)" />
      <circle cx={a.u * 100} cy={a.v * 100} r="6" fill="none" stroke="var(--color-crosshair)" strokeWidth={panel === 0 ? 1.6 : 0.8} opacity={panel === 0 ? 1 : 0.55} />
      <circle cx={b.u * 100} cy={b.v * 100} r="6" fill="none" stroke="var(--color-crosshair)" strokeWidth={panel === 1 ? 1.6 : 0.8} opacity={panel === 1 ? 1 : 0.55} />
    </svg>
  )
}

function HintRings({ hints, panel }: { hints: CardHint[]; panel: number }) {
  return (
    <svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 100 100" aria-hidden="true">
      {hints.map((h, i) => (
        <circle key={i} cx={h.u * 100} cy={h.v * 100} r="7.5" fill="none" stroke="var(--color-crosshair)" strokeWidth={h.visit === panel ? 1 : 0.6} opacity={h.visit === panel ? 0.95 : 0.35} />
      ))}
    </svg>
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
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border-[0.5px] border-divider bg-bg-elevated">
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
  caption,
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
  caption?: (panel: number) => ReactNode
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
        <div role="status" aria-live="polite" className="shrink-0">
          <CardHeader
            title={t('locate.prompt')}
            actions={
              <Button variant="ghost" className="h-11 text-link" onClick={() => void commit('moves')} disabled={pending}>
                {t('locate.skip')}
              </Button>
            }
          />
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
        className={cx('relative flex min-h-0 flex-1 flex-col px-3', playing && !locating && 'cursor-grab active:cursor-grabbing')}
      >
        <Stamp label={t('moves')} tone="moves" style={{ opacity: movesOpacity }} className="left-4 top-4" />
        <Stamp label={t('still')} tone="still" style={{ opacity: stillOpacity }} className="right-4 top-4" />
        <Stamp label={t('unsure')} tone="unsure" style={{ opacity: unsureOpacity }} className="left-1/2 top-4 -translate-x-1/2" />
        <CardFrame x={x} y={y}>
          <PhotoViewer fit sprite={card.sprite} img={img} offsets={card.offsets_s} onPlayingChange={setPlaying} overlay={viewerOverlay} caption={caption} onLocate={locating && !pending ? locate : undefined} />
        </CardFrame>
      </motion.div>

      {guide && (
        <div className="relative mx-3 mt-2 flex shrink-0 items-center gap-2 rounded-2xl bg-accent py-1 pl-4 pr-1 text-on-accent" role="note">
          <span className="absolute -top-1.5 left-8 size-3 rotate-45 bg-accent" aria-hidden="true" />
          <p className="flex-1 text-note font-medium leading-snug">{t('guide.body')}</p>
          <button type="button" onClick={onSkipGuide} className="min-h-11 shrink-0 rounded-full px-3 text-note font-semibold underline underline-offset-2">
            {t('guide.skip')}
          </button>
        </div>
      )}

      {((showHints && !guide) || locating) && <p className="shrink-0 truncate px-3 pt-1 text-center text-meta text-text-secondary">{locating ? t('locate.hint') : playing ? t('hints.swipe') : t('hints.paused')}</p>}
      <div className="shrink-0 px-3 pb-2 pt-2">
        <div className="flex gap-2">
          <ChoiceButton label={t('still')} onClick={() => choose('still')} disabled={pending || !img} primary>
            <IconStill size={24} />
          </ChoiceButton>
          <ChoiceButton label={t('moves')} onClick={() => (locating ? void commit('moves') : choose('moves'))} disabled={pending || !img} pressed={locating} primary>
            <IconMoves size={24} />
          </ChoiceButton>
        </div>
        <div className="mt-1 flex">
          <ChoiceButton label={t('unsure')} onClick={() => choose('unsure')} disabled={pending || !img}>
            <IconQuestion size={20} />
          </ChoiceButton>
        </div>
      </div>
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

function WhyLesson() {
  const t = useTranslations('classify')
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-2">
      <button type="button" aria-expanded={open} aria-controls={open ? 'why-lesson' : undefined} onClick={() => setOpen((v) => !v)} className="-ml-1 inline-flex min-h-11 items-center gap-0.5 px-1 text-note font-semibold text-link">
        {t('whyLook')}
        <IconChevronDownSmall size={20} className={cx('motion-safe:transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div id="why-lesson" className="mt-1 rounded-xl bg-bg-elevated px-3 py-3 ring-1 ring-divider">
          <h3 className="text-ui font-semibold">{t('help.slowTitle')}</h3>
          <p className="mt-1 mb-3 text-note leading-snug text-text-secondary">{t('help.slowBody')}</p>
          <DipoleFigure />
        </div>
      )}
    </div>
  )
}

function RevealPanel({ cardId, choice, result, pacing }: { cardId: string; choice: Choice; result: VoteResult; pacing: boolean }) {
  const t = useTranslations('classify')
  const glitch = useGlitch()
  const [glitchState, setGlitchState] = useState<'ask' | 'yes' | 'skipped'>('ask')
  const [about, setAbout] = useState(false)
  const panel = useRef<HTMLElement>(null)
  const { reveal, counted, guided } = result
  const control = reveal.control
  const known = reveal.known
  const decided = reveal.outcome === 'moves' || reveal.outcome === 'still'
  const verdict = control
    ? known
      ? t('known', { name: known.name })
      : t(`verdicts.${reveal.kind}`)
    : reveal.outcome === 'moves' || reveal.outcome === 'still' || reveal.outcome === 'undecided'
      ? t(`outcome.${reveal.outcome}`)
      : t('nobodyKnows')
  const comparison = !control ? null : guided && !counted ? t('practice') : control.correct === null ? t('checks.unsure') : control.correct ? t('checks.same') : t('checks.different')

  useEffect(() => {
    const el = panel.current
    if (!el) return
    const timer = setTimeout(() => el.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }), 350)
    return () => clearTimeout(timer)
  }, [])

  return (
    <section ref={panel} aria-labelledby="reveal-title" className="mt-4 scroll-mb-[calc(var(--height-bottomnav)+72px)] rounded-2xl bg-surface px-4 py-4">
      <div className="flex items-start gap-2">
        <h2 id="reveal-title" className="min-w-0 flex-1 pt-2 text-title-sm font-semibold leading-snug">
          {verdict}
        </h2>
        <IconButton label={t('about.open')} onClick={() => setAbout(true)} className="-mr-2 -mt-1">
          <IconMore />
        </IconButton>
      </div>

      {control ? (
        <p className="mt-1.5 text-body leading-snug text-text-secondary">{t(`kinds.${reveal.kind}`)}</p>
      ) : (
        <>
          {reveal.kind === 'sky' ? <p className="mt-1.5 text-note text-text-secondary">{t('sky.reveal')}</p> : !decided && <p className="mt-1.5 text-note text-text-secondary">{t('guess', { guess: t(`guesses.${reveal.kind}`) })}</p>}
          {reveal.outcome === 'open' && <p className="mt-1.5 text-note text-text-secondary">{t('outcome.open', { n: reveal.looked })}</p>}
        </>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="rounded-full bg-bg-elevated px-3 py-1 text-meta font-semibold text-text-secondary ring-1 ring-divider">{t('yourVote', { choice: t(choice) })}</span>
        {comparison && <span className="text-note text-text-secondary">{comparison}</span>}
      </div>

      {!counted && !guided && (
        <div className="mt-3">
          <Notice>{t('tooFast')}</Notice>
        </div>
      )}

      {(guided || (control && reveal.kind === 'mover')) && <WhyLesson />}

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

      <AboutCardSheet open={about} onClose={() => setAbout(false)} reveal={reveal} />
    </section>
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
    <div aria-live="polite" className="flex min-h-0 flex-1 flex-col">
      <p className="pb-2 text-center text-note text-text-secondary">{t('searching')}</p>
      <DeckSkeleton />
    </div>
  )
}

function Deck({ onHelp }: { onHelp: () => void }) {
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
          {sky && <FlashlightButton on={hintsOn} onChange={setHintsOn} />}
          {help}
        </>
      }
    />
  )
  const hints = sky && hintsOn ? card.hints : null

  if (result && result.cardId === card.id)
    return (
      <motion.div initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="min-h-0 flex-1 overflow-y-auto px-3">
        {header}
        <CardFrame>
          <PhotoViewer sprite={card.sprite} img={img} offsets={card.offsets_s} reveal={result.data.reveal} overlay={(panel) => (hints ? <HintRings hints={hints} panel={panel} /> : <MarksOverlay marks={result.data.reveal.marks} panel={panel} />)} caption={hints ? (panel) => <HintCaption hints={hints} panel={panel} /> : undefined} />
        </CardFrame>
        <RevealPanel cardId={card.id} choice={result.choice} result={result.data} pacing={result.pacing} />
        <div className="sticky bottom-[calc(var(--height-bottomnav)+env(safe-area-inset-bottom))] z-20 -mx-4 mt-2 bg-bg px-4 py-2">
          <Button variant="primary" full className="h-11" onClick={loadNext}>
            {t('next')}
          </Button>
        </div>
      </motion.div>
    )

  return (
    <Fill>
    <VoteCard
      key={card.id}
      card={card}
      header={header}
      img={img}
      overlay={hints ? (panel) => <HintRings hints={hints} panel={panel} /> : undefined}
      caption={hints ? (panel) => <HintCaption hints={hints} panel={panel} /> : undefined}
      guide={guiding ? (guideQuery.data?.marks ?? []) : null}
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
