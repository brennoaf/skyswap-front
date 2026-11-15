'use client'

import { motion, useMotionValueEvent, useReducedMotion, useTransform, type MotionValue } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useCardGestures } from '@/components/classify/card-gestures'
import { useOffsetLabel } from '@/components/classify/photo-viewer'
import { IconCheck, IconClose, IconPause, IconPlay, IconQuestion, IconSliders, IconWarning } from '@/components/icons'
import { PhotoStrip } from '@/components/player/player-bar'
import type { Playback } from '@/components/player/use-playback'
import { Skeleton } from '@/components/ui/primitives'
import { cx } from '@/lib/format'
import { useUi } from '@/lib/state/ui'

export const SWIPE = 110
const SPEED_CHOICES = [
  { key: 'slower', value: 0.5 },
  { key: 'normal', value: 1 },
  { key: 'faster', value: 2 },
] as const

export const swapButton = {
  big: 'flex h-[60px] min-w-0 flex-1 items-center justify-center rounded-2xl border border-text-muted px-2 text-center text-[18px] font-semibold leading-tight active:bg-surface-pressed disabled:opacity-50',
  mid: 'flex h-12 min-w-0 flex-1 items-center justify-center rounded-2xl border border-text-muted px-2 text-center text-[16px] font-semibold leading-tight active:bg-surface-pressed disabled:opacity-50',
  toggle: (on: boolean) => cx('flex h-12 min-w-0 flex-1 items-center justify-center rounded-2xl px-2 text-center text-[15px] font-semibold leading-tight', on ? 'bg-accent text-on-accent active:bg-accent-pressed' : 'border border-text-muted active:bg-surface-pressed'),
  primary: 'flex h-[60px] min-w-0 flex-1 items-center justify-center rounded-2xl bg-accent px-2 text-center text-[18px] font-semibold leading-tight text-on-accent active:bg-accent-pressed disabled:opacity-50',
}

export const photoFrame = 'relative rounded-[var(--radius-sheet)] bg-reels-bg'
export const photoInset = 'absolute inset-1.5'

const DRAG_STARTS_PX = 12
const STAMP_FULL_PX = 34
const ANSWERS = [
  { answer: 'still', Icon: IconClose, big: true, lit: 'border-text bg-text text-bg' },
  { answer: 'glitch', Icon: IconWarning, big: false, lit: '' },
  { answer: 'unsure', Icon: IconQuestion, big: false, lit: 'border-warning bg-warning text-on-warning' },
  { answer: 'moves', Icon: IconCheck, big: true, lit: 'border-accent bg-accent text-on-accent' },
] as const

export function FrameBars({ n, index }: { n: number; index: number }) {
  return (
    <div className="flex h-3 shrink-0 gap-1 px-3 pb-2" aria-hidden="true" data-testid="frame-bars">
      {Array.from({ length: n }, (_, i) => (
        <i key={i} className={cx('h-1 flex-1 rounded-sm', i === index ? 'bg-text' : 'bg-divider')} />
      ))}
    </div>
  )
}

export function CardBehind({ size }: { size: string }) {
  return <i aria-hidden="true" style={{ width: `calc(${size} - 24px)`, height: size }} className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-[var(--radius-sheet)] bg-surface-pressed" data-testid="card-behind" />
}

function Stamp({ label, opacity, className }: { label: string; opacity: MotionValue<number>; className: string }) {
  const scale = useTransform(opacity, [0, 1], [1.25, 1])
  return (
    <motion.span aria-hidden="true" style={{ opacity, scale }} className={cx('pointer-events-none absolute top-3.5 z-10 whitespace-nowrap rounded-full bg-bg px-3.5 py-2 text-display font-bold leading-none ring-2', className)}>
      {label}
    </motion.span>
  )
}

export function SwapStamps({ x, y, upFull = STAMP_FULL_PX }: { x: MotionValue<number>; y: MotionValue<number>; upFull?: number }) {
  const t = useTranslations('classify')
  const moves = useTransform(x, [DRAG_STARTS_PX, STAMP_FULL_PX], [0, 1])
  const still = useTransform(x, [-STAMP_FULL_PX, -DRAG_STARTS_PX], [1, 0])
  const unsure = useTransform(y, [-upFull, -DRAG_STARTS_PX], [1, 0])
  return (
    <>
      <Stamp label={t('moves')} opacity={moves} className="left-3.5 -rotate-10 text-accent ring-accent" />
      <Stamp label={t('still')} opacity={still} className="right-3.5 rotate-10 text-text ring-text-secondary" />
      <Stamp label={t('unsure')} opacity={unsure} className="left-1/2 -translate-x-1/2 -rotate-8 text-warning ring-warning" />
    </>
  )
}

export function GestureHint({ x, y }: { x: MotionValue<number>; y: MotionValue<number> }) {
  const touch = useTransform([x, y], ([a, b]: number[]) => Math.min(1, Math.max(Math.abs(a ?? 0), Math.abs(b ?? 0)) / 16))
  const left = useTransform(x, [-16, -3], [1, 0])
  const right = useTransform(x, [3, 16], [0, 1])
  const up = useTransform(y, [-16, -3], [1, 0])
  const line = { fill: 'none', stroke: 'var(--color-on-media)', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[5]" data-testid="gesture-hand">
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full">
        <motion.g style={{ opacity: left }} {...line}>
          <path d="M42 50H18" strokeDasharray="3.5 3" />
          <path d="M25 43L18 50L25 57" />
        </motion.g>
        <motion.g style={{ opacity: right }} {...line}>
          <path d="M58 50H82" strokeDasharray="3.5 3" />
          <path d="M75 43L82 50L75 57" />
        </motion.g>
        <motion.g style={{ opacity: up }} {...line}>
          <path d="M50 42V18" strokeDasharray="3.5 3" />
          <path d="M43 25L50 18L57 25" />
        </motion.g>
      </svg>
      <motion.i style={{ opacity: touch }} className="absolute left-1/2 top-1/2 size-11 -translate-x-1/2 -translate-y-1/2 rounded-full bg-on-media/35 ring-2 ring-on-media" />
    </div>
  )
}

export function SwapStage({
  img,
  sprite,
  panel,
  row,
  alt,
  x,
  y,
  canSwipe,
  onRelease,
  onCancel,
  onTap,
  onHold,
  overlay,
  hint,
}: {
  img: HTMLImageElement | null
  sprite: string
  panel: number
  row: 0 | 1
  alt: string
  x: MotionValue<number>
  y: MotionValue<number>
  canSwipe: boolean
  onRelease: (dx: number, dy: number, vx: number, vy: number) => void
  onCancel: () => void
  onTap: (u: number, v: number) => void
  onHold: (held: boolean) => void
  overlay?: ReactNode
  hint?: boolean
}) {
  const reduce = useReducedMotion()
  const canvas = useRef<HTMLCanvasElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const tile = img ? Math.round(img.naturalHeight / 2) : 1
  const rotate = useTransform(x, [-240, 240], reduce ? [0, 0] : [-6, 6])

  useEffect(() => {
    const c = canvas.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx || !img) return
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.drawImage(img, panel * tile, row * tile, tile, tile, 0, 0, tile, tile)
  }, [img, panel, row, tile])

  const gestures = useCardGestures({
    box: inner,
    x,
    y,
    canSwipe,
    threshold: SWIPE,
    onRelease,
    onCancel,
    onHold,
    onTap: (cx0, cy0) => {
      const r = inner.current?.getBoundingClientRect()
      if (r) onTap(Math.min(1, Math.max(0, (cx0 - r.left) / r.width)), Math.min(1, Math.max(0, (cy0 - r.top) / r.height)))
    },
  })

  return (
    <div className="relative z-10 flex shrink-0 justify-center pb-1.5" data-testid="swap-photo-slot">
      <CardBehind size="var(--swap-photo)" />
      <motion.div
        {...gestures.bind}
        style={{ x, y, rotate, width: 'var(--swap-photo)', height: 'var(--swap-photo)' }}
        className={cx(photoFrame, 'touch-none select-none')}
        data-testid="swap-photo"
        data-tour="swap-photo"
      >
        <div className={cx(photoInset, gestures.zoom.scale > 1 && 'overflow-hidden')}>
          <div ref={inner} className="relative size-full origin-center" style={gestures.zoom.scale > 1 ? { transform: `translate(${gestures.zoom.x}px, ${gestures.zoom.y}px) scale(${gestures.zoom.scale})` } : undefined}>
            <canvas ref={canvas} width={tile} height={tile} role="img" aria-label={alt} className="pixelated block size-full bg-reels-bg" data-sprite={sprite} data-frame={panel} />
            {!img && <Skeleton className="absolute inset-0 rounded-none" />}
            {overlay}
          </div>
        </div>
        {hint && <GestureHint x={x} y={y} />}
        <SwapStamps x={x} y={y} />
      </motion.div>
    </div>
  )
}

export function PhotoBar({ playback, offsets, onTools }: { playback: Playback; offsets: number[]; onTools: () => void }) {
  const t = useTranslations('classify')
  const tp = useTranslations('player')
  const label = useOffsetLabel()
  return (
    <div className="flex h-[60px] min-h-12 shrink items-center gap-3 px-4" data-testid="player-bar">
      <div className="flex min-w-0 flex-1 items-center gap-3" data-tour="swap-play">
        <button type="button" aria-label={playback.playing ? tp('pause') : tp('play')} onClick={() => playback.setPlaying(!playback.playing)} className="flex size-12 shrink-0 items-center justify-center rounded-full border border-text-muted text-text active:bg-surface-pressed">
          {playback.playing ? <IconPause size={26} /> : <IconPlay size={26} />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-semibold leading-tight" data-testid="player-counter">
            {tp('counter', { n: playback.index + 1, total: playback.n })}
          </p>
          <p className="truncate text-ui leading-tight text-text-secondary">{label(offsets[playback.index] ?? 0)}</p>
        </div>
      </div>
      <button type="button" aria-label={t('tools.open')} onClick={onTools} className="flex size-12 shrink-0 items-center justify-center rounded-full border border-text-muted text-text active:bg-surface-pressed" data-tour="swap-tools">
        <IconSliders size={26} />
      </button>
    </div>
  )
}

export function ToolsPanel({
  playback,
  sprite,
  offsets,
  row,
  onRow,
  onBack,
  hints,
}: {
  playback: Playback
  sprite: string
  offsets: number[]
  row: 0 | 1
  onRow: (row: 0 | 1) => void
  onBack: () => void
  hints?: { on: boolean; onChange: (on: boolean) => void }
}) {
  const t = useTranslations('classify')
  const tp = useTranslations('player')
  const setSpeed = useUi((s) => s.setSpeed)
  const n = playback.n
  const thumb = (i: number) => <span className="pixelated mx-auto block aspect-square h-full bg-no-repeat" style={{ backgroundImage: `url(${sprite})`, backgroundSize: `${n * 100}% 200%`, backgroundPosition: `${n > 1 ? (i / (n - 1)) * 100 : 0}% ${row * 100}%` }} />
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-4 pb-2 pt-2">
      <PhotoStrip playback={playback} seconds={offsets} thumb={thumb} label={tp('strip')} tone="surface" />
      {row === 0 ? (
        <div role="group" aria-label={t('tools.speed')} className="flex shrink-0 rounded-[14px] bg-surface p-[3px]">
          {SPEED_CHOICES.map((s) => (
            <button key={s.key} type="button" aria-pressed={playback.speed === s.value} onClick={() => setSpeed(s.value)} className={cx('h-11 flex-1 rounded-[11px] text-[15px] font-semibold', playback.speed === s.value ? 'bg-text text-bg' : 'text-text-secondary')}>
              {t(`tools.${s.key}`)}
            </button>
          ))}
        </div>
      ) : (
        <p className="shrink-0 text-ui leading-snug text-text-secondary">{t('tools.diffNote')}</p>
      )}
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          aria-pressed={playback.blinking}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            playback.startBlink()
          }}
          onPointerUp={playback.stopBlink}
          onPointerCancel={playback.stopBlink}
          onContextMenu={(e) => e.preventDefault()}
          className={cx(swapButton.toggle(playback.blinking), 'touch-none select-none')}
        >
          {t('tools.blink')}
        </button>
        <button type="button" aria-pressed={row === 1} onClick={() => onRow(row === 0 ? 1 : 0)} className={swapButton.toggle(row === 1)}>
          {t('tools.diff')}
        </button>
      </div>
      <div className="flex shrink-0 gap-2">
        {hints && (
          <button type="button" aria-pressed={hints.on} onClick={() => hints.onChange(!hints.on)} className={swapButton.toggle(hints.on)}>
            {t('flashlight.button')}
          </button>
        )}
        <button type="button" onClick={onBack} className={swapButton.mid}>
          {t('tools.back')}
        </button>
      </div>
    </div>
  )
}

export function AnswerFace({ big, className, children }: { big: boolean; className?: string; children: ReactNode }) {
  return <span className={cx('flex items-center justify-center rounded-full border-[1.5px] border-text-muted transition-colors duration-75', big ? 'size-[68px]' : 'size-14', className)}>{children}</span>
}

function useDragDirection(x: MotionValue<number>, y: MotionValue<number>) {
  const [direction, setDirection] = useState<'still' | 'moves' | 'unsure' | null>(null)
  const update = () => {
    const a = x.get()
    const b = y.get()
    setDirection(Math.abs(a) >= Math.abs(b) ? (a > DRAG_STARTS_PX ? 'moves' : a < -DRAG_STARTS_PX ? 'still' : null) : b < -DRAG_STARTS_PX ? 'unsure' : null)
  }
  useMotionValueEvent(x, 'change', update)
  useMotionValueEvent(y, 'change', update)
  return direction
}

export function AnswerPanel({ labels, disabled, x, y, onChoose }: { labels: { still: string; moves: string; glitch: string; unsure: string }; disabled: boolean; x: MotionValue<number>; y: MotionValue<number>; onChoose: (a: 'still' | 'moves' | 'glitch' | 'unsure') => void }) {
  const direction = useDragDirection(x, y)
  return (
    <div className="mt-auto flex shrink-0 gap-1 px-2 pb-3 pt-2" data-testid="swap-answers" data-tour="swap-answers">
      {ANSWERS.map(({ answer, Icon, big, lit }) => (
        <button key={answer} type="button" disabled={disabled} onClick={() => onChoose(answer)} data-answer={answer} data-lit={direction === answer ? '' : undefined} className="group flex min-w-0 flex-1 flex-col items-center gap-1 disabled:opacity-50">
          <span className="flex h-[68px] items-center">
            <AnswerFace big={big} className={direction === answer ? lit : 'group-active:bg-surface-pressed'}>
              <Icon size={big ? 34 : 28} />
            </AnswerFace>
          </span>
          <span className="whitespace-nowrap text-ui font-semibold leading-tight">{labels[answer]}</span>
        </button>
      ))}
    </div>
  )
}

export function SwapStrip({ text, action, onAction }: { text: string; action?: string; onAction?: () => void }) {
  return (
    <div role="status" className="flex h-[60px] shrink-0 items-center gap-2 pl-4 pr-2 text-[16px] font-medium leading-tight" data-testid="swap-strip">
      <span className="min-w-0 flex-1">{text}</span>
      {action && (
        <button type="button" onClick={onAction} className="h-11 shrink-0 rounded-xl px-3 text-[16px] font-semibold text-link active:bg-surface-pressed">
          {action}
        </button>
      )}
    </div>
  )
}

export function SwapPanel({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <section aria-label={label} className="relative mt-auto flex max-h-full shrink-0 flex-col gap-2 overflow-y-auto px-4 pb-3.5 pt-3.5" data-testid="swap-panel">
      {children}
    </section>
  )
}
