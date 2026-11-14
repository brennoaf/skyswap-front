'use client'

import { animate, motion, useMotionValue, useReducedMotion, useTransform, type PanInfo } from 'framer-motion'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { IconCheck, IconClose, IconPause, IconPlay, IconQuestion } from '@/components/icons'
import { LoginForm } from '@/components/shell/login-sheet'
import { Button, EmptyState, Notice, Skeleton, TopBar } from '@/components/ui/primitives'
import { ApiError, type DeckCard, type Reveal } from '@/lib/api/client'
import { useNextCard, useSession, useVote, type Label } from '@/lib/api/hooks'
import { cx, formatDateTime, formatWavelength } from '@/lib/format'
import { useUi } from '@/lib/state/ui'

type VoteResult = NonNullable<ReturnType<typeof useVote>['data']>
type Row = 0 | 1

const SWIPE = 110

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

function isTyping(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

function Viewer({ card, img, marks, reveal }: { card: DeckCard; img: HTMLImageElement | null; marks?: { u: number; v: number }[]; reveal?: Reveal }) {
  const locale = useLocale()
  const t = useTranslations('classify')
  const reduce = useReducedMotion()
  const canvas = useRef<HTMLCanvasElement>(null)
  const [row, setRow] = useState<Row>(0)
  const [panel, setPanel] = useState(0)
  const [playing, setPlaying] = useState(true)
  const n = card.n_frames
  const tile = img ? Math.round(img.naturalHeight / 2) : 1
  const running = playing && !reduce && n > 1

  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => setPanel((p) => (p + 1) % n), 600)
    return () => clearInterval(timer)
  }, [running, n])

  useEffect(() => {
    const c = canvas.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx || !img) return
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.drawImage(img, panel * tile, row * tile, tile, tile, 0, 0, tile, tile)
  }, [img, panel, row, tile])

  const frame = reveal?.frames[panel]
  const mark = marks?.[panel]

  return (
    <div>
      <div className="relative">
        <canvas
          ref={canvas}
          width={tile}
          height={tile}
          role="img"
          aria-label={t('cardAlt', { n: panel + 1, total: n })}
          className="pixelated block aspect-square w-full bg-media-bg"
          onClick={() => setPanel((p) => (p + 1) % n)}
        />
        {!img && <Skeleton className="absolute inset-0 rounded-none" />}
        {mark && (
          <svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 100 100" aria-hidden="true">
            <circle cx={mark.u * 100} cy={mark.v * 100} r="7" fill="none" stroke="var(--color-warning)" strokeWidth="0.9" />
            <circle cx={mark.u * 100} cy={mark.v * 100} r="9.5" fill="none" stroke="var(--color-mark-halo)" strokeOpacity="0.5" strokeWidth="0.6" />
          </svg>
        )}
      </div>
      <div className="flex items-center gap-2 px-3 pt-2.5">
        <div role="radiogroup" aria-label={t('view')} className="flex rounded-[var(--radius-button)] bg-surface p-0.5">
          {([0, 1] as Row[]).map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={row === r}
              onClick={() => setRow(r)}
              className={cx('min-h-9 rounded-[6px] px-3 text-note font-semibold', row === r ? 'bg-bg text-text shadow-sm' : 'text-text-secondary')}
            >
              {r === 0 ? t('blink') : t('difference')}
            </button>
          ))}
        </div>
        <span className="min-w-0 flex-1 truncate text-right text-note text-text-secondary" aria-live="off">
          {t('panel', { n: panel + 1, total: n })}
        </span>
        {n > 1 && !reduce && (
          <button
            type="button"
            aria-label={playing ? t('pause') : t('play')}
            title={playing ? t('pause') : t('play')}
            onClick={() => setPlaying((p) => !p)}
            className="-mr-1 inline-flex size-11 items-center justify-center rounded-full text-text active:scale-90"
          >
            {playing ? <IconPause size={24} /> : <IconPlay size={24} />}
          </button>
        )}
      </div>
      {frame && (
        <p className="px-3 pb-3 pt-1 text-meta text-text-muted">
          {formatDateTime(frame.t, locale)} · {formatWavelength([frame.wl_min, frame.wl_max])}
        </p>
      )}
    </div>
  )
}

function CardFrame({ card, reveal, children }: { card: DeckCard; reveal?: Reveal; children: ReactNode }) {
  const t = useTranslations('classify')
  return (
    <div className="overflow-hidden rounded-2xl border-[0.5px] border-divider bg-bg-elevated shadow-[0_6px_24px_rgb(0_0_0/0.18)]">
      <p className="px-3 py-2.5 text-note font-semibold">{reveal ? t('cardInfo', { band: reveal.band, size: reveal.size_arcmin, n: card.n_frames }) : t('cardInfoBefore', { n: card.n_frames })}</p>
      {children}
    </div>
  )
}

function Stamp({ label, tone, className, style }: { label: string; tone: 'success' | 'danger' | 'warning'; className?: string; style: React.ComponentProps<typeof motion.span>['style'] }) {
  return (
    <motion.span
      aria-hidden="true"
      style={style}
      className={cx(
        'pointer-events-none absolute z-10 rounded-lg border-[3px] bg-black/40 px-3 py-1 font-[family-name:var(--font-display)] text-title-lg font-extrabold uppercase tracking-wide',
        tone === 'success' && 'border-success text-success',
        tone === 'danger' && 'border-danger text-danger',
        tone === 'warning' && 'border-warning text-warning',
        className,
      )}
    >
      {label}
    </motion.span>
  )
}

function VoteButton({ label, onClick, disabled, size, className, children }: { label: string; onClick: () => void; disabled: boolean; size: number; className: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
        className={cx('inline-flex items-center justify-center rounded-full border-[0.5px] border-divider bg-bg-elevated shadow-[0_4px_16px_rgb(0_0_0/0.18)] transition-transform active:scale-90 disabled:opacity-50', className)}
        style={{ width: size, height: size }}
      >
        {children}
      </button>
      <span className="text-meta font-medium text-text-secondary" aria-hidden="true">
        {label}
      </span>
    </div>
  )
}

function VoteCard({ card, img, onVoted, onStale }: { card: DeckCard; img: HTMLImageElement | null; onVoted: (label: Label, r: VoteResult) => void; onStale: () => void }) {
  const t = useTranslations('classify')
  const reduce = useReducedMotion()
  const toast = useUi((s) => s.toast)
  const vote = useVote()
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const rotate = useTransform(x, [-240, 240], [-14, 14])
  const realOpacity = useTransform(x, [24, SWIPE], [0, 1])
  const artOpacity = useTransform(x, [-SWIPE, -24], [1, 0])
  const unsureOpacity = useTransform(y, [-SWIPE, -24], [1, 0])
  const shownAt = useRef<number | null>(null)
  const busy = useRef(false)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (img && shownAt.current === null) shownAt.current = performance.now()
  }, [img])

  const commit = useCallback(
    async (label: Label) => {
      if (busy.current || shownAt.current === null) return
      busy.current = true
      setPending(true)
      const target = label === 'real' ? { x: 520, y: 0 } : label === 'artifact' ? { x: -520, y: 0 } : { x: 0, y: -720 }
      const fly = reduce
        ? Promise.resolve()
        : Promise.race([
            Promise.all([animate(x, target.x, { duration: 0.28, ease: 'easeIn' }), animate(y, target.y, { duration: 0.28, ease: 'easeIn' })]),
            new Promise((resolve) => setTimeout(resolve, 400)),
          ])
      try {
        const [r] = await Promise.all([vote.mutateAsync({ card_id: card.id, label }), fly])
        onVoted(label, r)
      } catch (err) {
        if (err instanceof ApiError && err.code === 'already_voted') {
          onStale()
          return
        }
        toast({ kind: 'info', key: 'classify.voteFailed' })
        animate(x, 0, { type: 'spring', stiffness: 400, damping: 30 })
        animate(y, 0, { type: 'spring', stiffness: 400, damping: 30 })
        busy.current = false
        setPending(false)
      }
    },
    [card.id, onStale, onVoted, reduce, toast, vote, x, y],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e) || document.querySelector('[role="dialog"]')) return
      const label: Label | null = e.key === 'ArrowLeft' ? 'artifact' : e.key === 'ArrowRight' ? 'real' : e.key === 'ArrowUp' ? 'unsure' : null
      if (!label) return
      e.preventDefault()
      void commit(label)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [commit])

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const dx = info.offset.x
    const dy = info.offset.y
    if (dx > SWIPE || info.velocity.x > 700) void commit('real')
    else if (dx < -SWIPE || info.velocity.x < -700) void commit('artifact')
    else if (dy < -SWIPE || info.velocity.y < -700) void commit('unsure')
    else {
      animate(x, 0, { type: 'spring', stiffness: 500, damping: 32 })
      animate(y, 0, { type: 'spring', stiffness: 500, damping: 32 })
    }
  }

  return (
    <>
      <motion.div
        drag={!pending}
        dragMomentum={false}
        onDragEnd={onDragEnd}
        style={{ x, y, rotate, touchAction: 'none' }}
        initial={reduce ? false : { opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative cursor-grab active:cursor-grabbing"
      >
        <Stamp label={t('real')} tone="success" style={{ opacity: realOpacity, rotate: -14 }} className="left-4 top-14" />
        <Stamp label={t('artifact')} tone="danger" style={{ opacity: artOpacity, rotate: 14 }} className="right-4 top-14" />
        <Stamp label={t('unsure')} tone="warning" style={{ opacity: unsureOpacity }} className="bottom-28 left-1/2 -translate-x-1/2 whitespace-nowrap" />
        <CardFrame card={card}>
          <Viewer card={card} img={img} />
        </CardFrame>
      </motion.div>
      <div className="mt-5 flex items-start justify-center gap-7">
        <VoteButton label={t('artifact')} onClick={() => void commit('artifact')} disabled={pending || !img} size={64} className="text-danger">
          <IconClose size={34} />
        </VoteButton>
        <VoteButton label={t('unsure')} onClick={() => void commit('unsure')} disabled={pending || !img} size={52} className="mt-1.5 text-warning">
          <IconQuestion size={28} />
        </VoteButton>
        <VoteButton label={t('real')} onClick={() => void commit('real')} disabled={pending || !img} size={64} className="text-success">
          <IconCheck size={36} />
        </VoteButton>
      </div>
      <p className="mt-3 text-center text-meta text-text-muted">
        <span className="[@media(pointer:fine)]:hidden">{t('swipeHint')}</span>
        <span className="hidden [@media(pointer:fine)]:inline">{t('keys')}</span>
      </p>
    </>
  )
}

function RevealPanel({ label, result, onNext }: { label: Label; result: VoteResult; onNext: () => void }) {
  const t = useTranslations('classify')
  const actions = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLElement>(null)
  const { reveal, counted } = result
  const rate = reveal.rate_arcsec_h ?? reveal.known?.rate_arcsec_h ?? null
  const total = reveal.votes.real + reveal.votes.artifact + reveal.votes.unsure
  const pct = reveal.p_real === null ? null : Math.round(reveal.p_real * 100)
  const control = reveal.control

  useEffect(() => {
    actions.current?.querySelector('button')?.focus({ preventScroll: true })
    const el = panel.current
    if (!el) return
    const timer = setTimeout(() => el.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }), 350)
    return () => clearTimeout(timer)
  }, [])

  return (
    <section ref={panel} aria-labelledby="reveal-title" className="mt-4 scroll-mb-[calc(var(--height-bottomnav)+12px)] rounded-2xl bg-surface px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="reveal-title" className="text-title-sm font-semibold">
          {t('revealTitle')}
        </h2>
        <span
          className={cx(
            'shrink-0 rounded-full px-2.5 py-1 text-meta font-semibold',
            label === 'real' && 'bg-success/15 text-success',
            label === 'artifact' && 'bg-danger/15 text-danger',
            label === 'unsure' && 'bg-warning/15 text-warning',
          )}
        >
          {t('yourVote', { label: t(label) })}
        </span>
      </div>
      {!counted && (
        <div className="mt-3">
          <Notice tone="warning">{t('tooFast')}</Notice>
        </div>
      )}
      <p className="mt-2 text-body leading-snug">{t(`kinds.${reveal.kind}`)}</p>
      {(reveal.known || rate !== null) && (
        <ul className="mt-2 space-y-0.5 text-note text-text-secondary">
          {reveal.known && <li>{reveal.known.V !== null ? t('knownV', { name: reveal.known.name, v: reveal.known.V }) : t('known', { name: reveal.known.name })}</li>}
          {rate !== null && <li>{t('rate', { rate })}</li>}
        </ul>
      )}
      {reveal.marks.length > 0 && <p className="mt-2 text-meta text-text-muted">{t('marksHint')}</p>}

      {control ? (
        <div className="mt-3 rounded-xl bg-bg-elevated px-3 py-3">
          <p className="text-note text-text-secondary">{t('control')}</p>
          {control.correct !== null && (
            <p className="mt-1.5 flex items-center gap-1.5 text-body font-semibold">
              <span className={control.correct ? 'text-success' : 'text-danger'}>{control.correct ? <IconCheck size={20} /> : <IconClose size={20} />}</span>
              {control.correct ? t('correct') : t('wrong')}
            </p>
          )}
          <p className="mt-1 text-body font-medium">{t('truth', { label: t(control.truth === 'real' ? 'real' : 'artifact') })}</p>
        </div>
      ) : (
        <div className="mt-3 rounded-xl bg-bg-elevated px-3 py-3">
          {pct !== null && (
            <>
              <div className="h-2 overflow-hidden rounded-full bg-surface" aria-hidden="true">
                <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-2 text-note">{t('consensus', { pct, n: total })}</p>
            </>
          )}
          <p className="mt-1 text-note font-semibold">{t(`status.${reveal.status}`)}</p>
        </div>
      )}

      <div ref={actions} className="mt-4">
        <Button variant="primary" full className="h-11" onClick={onNext}>
          {t('next')}
        </Button>
      </div>
    </section>
  )
}

function DeckSkeleton() {
  return (
    <div aria-hidden="true">
      <Skeleton className="aspect-[0.84] w-full rounded-2xl" />
      <div className="mt-5 flex justify-center gap-7">
        <Skeleton className="size-16 rounded-full" />
        <Skeleton className="mt-1.5 size-[52px] rounded-full" />
        <Skeleton className="size-16 rounded-full" />
      </div>
    </div>
  )
}

function Deck() {
  const t = useTranslations('classify')
  const tc = useTranslations('common')
  const next = useNextCard(true)
  const [result, setResult] = useState<{ cardId: string; label: Label; data: VoteResult } | null>(null)
  const card = next.data?.card ?? null
  const img = useSprite(card?.sprite)
  const reduce = useReducedMotion()

  const onVoted = useCallback((label: Label, data: VoteResult) => {
    if (card) setResult({ cardId: card.id, label, data })
  }, [card])
  const loadNext = useCallback(() => {
    setResult(null)
    window.scrollTo({ top: 0 })
    void next.refetch()
  }, [next])

  if (next.isLoading || (next.isFetching && !result)) return <DeckSkeleton />
  if (next.isError)
    return (
      <EmptyState
        title={tc('retry')}
        action={
          <Button variant="primary" onClick={() => next.refetch()}>
            {tc('retry')}
          </Button>
        }
      />
    )
  if (next.data?.done || !card) return <EmptyState art={<IconCheck size={56} className="text-success" />} title={t('done')} body={t('doneBody')} />

  if (result && result.cardId === card.id)
    return (
      <motion.div initial={reduce ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <CardFrame card={card} reveal={result.data.reveal}>
          <Viewer card={card} img={img} marks={result.data.reveal.marks} reveal={result.data.reveal} />
        </CardFrame>
        <RevealPanel label={result.label} result={result.data} onNext={loadNext} />
      </motion.div>
    )

  return <VoteCard key={card.id} card={card} img={img} onVoted={onVoted} onStale={loadNext} />
}

function LoginIntro() {
  const t = useTranslations('classify')
  return (
    <div className="pt-6">
      <div className="flex flex-col items-center px-6 text-center">
        <div className="mb-4 flex items-center gap-3" aria-hidden="true">
          <span className="inline-flex size-12 items-center justify-center rounded-full border-[0.5px] border-divider bg-bg-elevated text-danger">
            <IconClose size={26} />
          </span>
          <span className="inline-flex size-10 items-center justify-center rounded-full border-[0.5px] border-divider bg-bg-elevated text-warning">
            <IconQuestion size={22} />
          </span>
          <span className="inline-flex size-12 items-center justify-center rounded-full border-[0.5px] border-divider bg-bg-elevated text-success">
            <IconCheck size={28} />
          </span>
        </div>
        <h2 className="font-[family-name:var(--font-display)] text-title-lg font-bold leading-tight">{t('loginTitle')}</h2>
        <p className="mt-2 max-w-[320px] text-text-secondary">{t('loginBody')}</p>
      </div>
      <div className="mx-auto mt-4 max-w-[380px]">
        <LoginForm />
      </div>
    </div>
  )
}

export default function ClassifyPage() {
  const t = useTranslations('classify')
  const { data: user, isLoading } = useSession()
  return (
    <main className="min-h-[calc(100dvh-var(--height-bottomnav))]">
      <TopBar title={t('title')} back={false} />
      {isLoading ? (
        <div className="px-4 pt-2">
          <DeckSkeleton />
        </div>
      ) : !user ? (
        <LoginIntro />
      ) : (
        <div className="px-4 pb-6">
          <p className="mb-3 text-note leading-snug text-text-secondary">{t('intro')}</p>
          <Deck />
        </div>
      )}
    </main>
  )
}
