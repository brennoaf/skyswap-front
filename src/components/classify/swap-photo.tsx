'use client'

import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useTransform, type MotionValue } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useCardGestures } from '@/components/classify/card-gestures'
import { useOffsetLabel } from '@/components/classify/photo-viewer'
import { IconCheck, IconClose, IconPause, IconPlay, IconQuestion, IconRobot, IconShrink, IconSliders, IconWarning } from '@/components/icons'
import { PhotoStrip } from '@/components/player/player-bar'
import type { Playback } from '@/components/player/use-playback'
import { Sheet, Skeleton, Switch } from '@/components/ui/primitives'
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
  primary: 'flex h-[60px] min-w-0 flex-1 items-center justify-center rounded-2xl bg-accent px-2 text-center text-[18px] font-semibold leading-tight text-on-accent active:bg-accent-pressed disabled:opacity-50',
}

export const photoFrame = 'relative rounded-[var(--radius-sheet)] bg-reels-bg'
const SWAP_FRAME = 'relative rounded-[20px] bg-reels-bg transition-shadow duration-200'
const FRAME_RING = {
  rest: 'shadow-[0_0_0_1px_var(--color-divider)]',
  chosen: 'shadow-[0_0_0_2px_var(--color-text),0_0_32px_color-mix(in_srgb,var(--color-text)_12%,transparent)]',
  yes: 'shadow-[0_0_0_2px_var(--color-accent),0_0_32px_color-mix(in_srgb,var(--color-accent)_35%,transparent)]',
} as const
const LEAVE = {
  still: { x: '-120%', rotate: -10, opacity: 0 },
  moves: { x: '120%', rotate: 10, opacity: 0 },
  unsure: { y: '-60%', opacity: 0 },
  glitch: { scale: 0.9, opacity: 0 },
} as const
export const answerCircle = 'grid place-items-center rounded-full bg-surface ring-1 ring-inset ring-divider'
export const photoInset = 'absolute inset-1.5'

const DRAG_STARTS_PX = 12
const STAMP_FULL_PX = 34
export const ANSWER_ICONS = { still: IconClose, glitch: IconWarning, unsure: IconQuestion, moves: IconCheck } as const
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
  doubleTap = true,
  onRelease,
  onCancel,
  onTap,
  onHold,
  overlay,
  banner,
  hint,
  ring = 'rest',
  leaving,
}: {
  img: HTMLImageElement | null
  sprite: string
  panel: number
  row: 0 | 1
  alt: string
  x: MotionValue<number>
  y: MotionValue<number>
  canSwipe: boolean
  doubleTap?: boolean
  onRelease: (dx: number, dy: number, vx: number, vy: number) => void
  onCancel: () => void
  onTap: (u: number, v: number) => void
  onHold: (held: boolean) => void
  overlay?: ReactNode
  banner?: ReactNode
  hint?: boolean
  ring?: keyof typeof FRAME_RING
  leaving?: keyof typeof LEAVE | null
}) {
  const t = useTranslations('classify')
  const reduce = useReducedMotion()
  const canvas = useRef<HTMLCanvasElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const tile = img ? Math.round(img.naturalHeight / 2) : 1
  const rotate = useTransform(x, [-240, 240], reduce ? [0, 0] : [-6, 6])

  useLayoutEffect(() => {
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
    doubleTap,
    threshold: SWIPE,
    onRelease,
    onCancel,
    onHold,
    onTap: (cx0, cy0) => {
      const r = inner.current?.getBoundingClientRect()
      if (r) onTap(Math.min(1, Math.max(0, (cx0 - r.left) / r.width)), Math.min(1, Math.max(0, (cy0 - r.top) / r.height)))
    },
  })

  const zoomed = gestures.zoom.scale > 1

  return (
    <div className="relative z-10 flex shrink-0 justify-center pb-1.5" data-testid="swap-photo-slot">
      <CardBehind size="var(--swap-photo)" />
      <motion.div
        className="relative"
        initial={reduce ? false : { y: 24, scale: 0.96, opacity: 0 }}
        animate={leaving ? LEAVE[leaving] : { x: 0, y: 0, rotate: 0, scale: 1, opacity: 1 }}
        transition={{ duration: reduce ? 0 : 0.35, ease: [0.2, 0.8, 0.2, 1] }}
        data-leaving={leaving ?? undefined}
      >
      <motion.div
        {...gestures.bind}
        style={{ x, y, rotate, width: 'var(--swap-photo)', height: 'var(--swap-photo)' }}
        className={cx(SWAP_FRAME, FRAME_RING[ring], 'touch-none select-none')}
        data-testid="swap-photo"
        data-tour="swap-photo"
        data-ring={ring}
        data-zoomed={zoomed || undefined}
      >
        <div className={cx(photoInset, zoomed && 'overflow-hidden')}>
          <div ref={inner} className="relative size-full origin-center" style={zoomed ? { transform: `translate(${gestures.zoom.x}px, ${gestures.zoom.y}px) scale(${gestures.zoom.scale})` } : undefined}>
            <canvas ref={canvas} width={tile} height={tile} role="img" aria-label={alt} className="pixelated block size-full bg-reels-bg" data-sprite={sprite} data-frame={panel} />
            {!img && <Skeleton className="absolute inset-0 rounded-none" />}
            {overlay}
          </div>
        </div>
        {banner}
        {hint && <GestureHint x={x} y={y} />}
        <SwapStamps x={x} y={y} />
      </motion.div>
      {zoomed && !leaving && (
        <button type="button" aria-label={t('zoom.reset')} onClick={gestures.resetZoom} className="absolute right-3 top-3 z-20 grid size-11 place-items-center rounded-full bg-bg text-text shadow-[0_2px_10px_rgb(0_0_0/0.35)] ring-1 ring-inset ring-divider active:bg-surface-pressed" data-testid="zoom-reset">
          <IconShrink size={22} />
        </button>
      )}
      </motion.div>
    </div>
  )
}

const ROBOT_TIP = 'robotFirst'

export function PhotoBar({
  playback,
  offsets,
  onTools,
  open = false,
  strip,
  hints,
}: {
  playback: Playback
  offsets: number[]
  onTools: () => void
  open?: boolean
  strip?: ReactNode
  hints?: { on: boolean; onChange: (on: boolean) => void }
}) {
  const t = useTranslations('classify')
  const tp = useTranslations('player')
  const label = useOffsetLabel()
  const reduce = useReducedMotion()
  const robotSeen = useUi((s) => s.tipsSeen.includes(ROBOT_TIP))
  const markTip = useUi((s) => s.markTip)
  const [robotNote, setRobotNote] = useState(false)
  const closeRobotNote = () => {
    markTip(ROBOT_TIP)
    setRobotNote(false)
    hints?.onChange(true)
  }
  return (
    <div className="flex items-center gap-3 px-4 pt-3.5" data-testid="player-bar">
      <div className="flex min-w-0 flex-1 items-center gap-3" data-tour="swap-play">
        <button type="button" aria-label={playback.playing ? tp('pause') : tp('play')} onClick={() => playback.setPlaying(!playback.playing)} className={cx(answerCircle, 'size-11 shrink-0 text-text active:bg-surface-pressed')}>
          {playback.playing ? <IconPause size={24} /> : <IconPlay size={24} />}
        </button>
        {open && strip ? (
          <div className="min-w-0 flex-1 [&_[role=slider]]:!h-11" onPointerDownCapture={playback.stopBlink}>
            {strip}
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            <p className="text-[16px] font-semibold leading-tight" data-testid="player-counter">
              {tp('counter', { n: playback.index + 1, total: playback.n })}
            </p>
            <p className="truncate text-ui leading-snug text-text-secondary">{label(offsets[playback.index] ?? 0)}</p>
          </div>
        )}
      </div>
      {hints && !open && (
        <button
          type="button"
          aria-label={t('flashlight.button')}
          aria-pressed={hints.on}
          onClick={() => (!hints.on && !robotSeen ? setRobotNote(true) : hints.onChange(!hints.on))}
          className={cx(answerCircle, 'size-11 shrink-0 transition-colors duration-150', hints.on ? 'bg-text text-bg ring-text' : 'text-text active:bg-surface-pressed')}
          data-testid="hints-toggle"
        >
          <IconRobot size={24} />
        </button>
      )}
      <button
        type="button"
        aria-label={open ? t('tools.close') : t('tools.open')}
        aria-expanded={open}
        onClick={onTools}
        className={cx(answerCircle, 'relative size-11 shrink-0 overflow-hidden transition-colors duration-150', open ? 'bg-text text-bg ring-text' : 'text-text active:bg-surface-pressed')}
        data-tour="swap-tools"
        data-testid="tools-toggle"
      >
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={open ? 'close' : 'open'}
            initial={reduce ? false : { opacity: 0, rotate: -90, scale: 0.6 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, rotate: 90, scale: 0.6 }}
            transition={{ duration: 0.18 }}
            className="grid place-items-center"
          >
            {open ? <IconClose size={24} /> : <IconSliders size={24} />}
          </motion.span>
        </AnimatePresence>
      </button>
      {hints && (
        <Sheet open={robotNote} onClose={closeRobotNote} title={t('flashlight.firstTitle')}>
          <div className="flex flex-col gap-4 px-4 pb-4 pt-2" data-testid="robot-first">
            <p className="text-[16px] leading-snug text-text-secondary">{t('flashlight.firstBody')}</p>
            <button type="button" onClick={closeRobotNote} className={`${swapButton.mid} flex-none`}>
              {t('flashlight.firstOk')}
            </button>
          </div>
        </Sheet>
      )}
    </div>
  )
}

export function ToolsStrip({ playback, sprite, offsets, row }: { playback: Playback; sprite: string; offsets: number[]; row: 0 | 1 }) {
  const tp = useTranslations('player')
  const n = playback.n
  const thumb = (i: number) => <span className="pixelated mx-auto block aspect-square h-full bg-no-repeat" style={{ backgroundImage: `url(${sprite})`, backgroundSize: `${n * 100}% 200%`, backgroundPosition: `${n > 1 ? (i / (n - 1)) * 100 : 0}% ${row * 100}%` }} />
  return <PhotoStrip playback={playback} seconds={offsets} thumb={thumb} label={tp('strip')} tone="surface" />
}

function ToolRow({ name, note, checked, onChange }: { name: string; note?: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="relative flex min-h-12 shrink-0 items-center gap-3 border-t-[0.5px] border-divider py-1.5" data-testid="tool-row">
      <span className="min-w-0 flex-1">
        <span className="block text-title-sm font-semibold leading-tight">{name}</span>
        {note && <span className="mt-0.5 block text-ui leading-tight text-text-secondary">{note}</span>}
      </span>
      <Switch aria-label={name} checked={checked} offTone="bg-text-muted" onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

export function ToolsPanel({
  playback,
  row,
  onRow,
}: {
  playback: Playback
  row: 0 | 1
  onRow: (row: 0 | 1) => void
}) {
  const t = useTranslations('classify')
  const setSpeed = useUi((s) => s.setSpeed)
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pt-1" data-testid="tools-panel">
      <div role="group" aria-label={t('tools.speed')} className="flex shrink-0 rounded-[14px] bg-surface">
        {SPEED_CHOICES.map((s) => (
          <button key={s.key} type="button" aria-pressed={playback.speed === s.value} onClick={() => setSpeed(s.value)} className={cx('h-11 flex-1 rounded-[14px] text-[15px] font-semibold', playback.speed === s.value ? 'bg-text text-bg' : 'text-text-secondary')}>
            {t(`tools.${s.key}`)}
          </button>
        ))}
      </div>
      <ToolRow name={t('tools.blink')} checked={playback.blinking} onChange={(on) => (on ? playback.startBlink() : playback.stopBlink())} />
      <ToolRow name={t('tools.diff')} note={row === 1 ? t('tools.diffNote') : undefined} checked={row === 1} onChange={(on) => onRow(on ? 1 : 0)} />    </div>
  )
}

export function AnswerFace({ big, className, children }: { big: boolean; className?: string; children: ReactNode }) {
  return <span className={cx(answerCircle, 'relative transition-[color,background-color,transform] duration-100', big ? 'size-[68px]' : 'size-14', className)}>{children}</span>
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

export function AnswerPanel({
  labels,
  disabled,
  x,
  y,
  onChoose,
}: {
  labels: { still: string; moves: string; glitch: string; unsure: string }
  disabled: boolean
  x: MotionValue<number>
  y: MotionValue<number>
  onChoose: (a: 'still' | 'moves' | 'glitch' | 'unsure') => void
}) {
  const direction = useDragDirection(x, y)
  return (
    <div className="flex shrink-0 items-start justify-between" data-testid="swap-answers" data-tour="swap-answers">
      {ANSWERS.map(({ answer, Icon, big, lit }) => (
        <button
          key={answer}
          type="button"
          disabled={disabled}
          onClick={() => onChoose(answer)}
          data-answer={answer}
          data-lit={direction === answer ? '' : undefined}
          className={cx('group flex w-20 flex-col items-center gap-2 text-ui font-semibold leading-tight disabled:opacity-50', !big && 'text-text-secondary')}
        >
          <AnswerFace big={big} className={cx(!big && 'mt-1.5 text-text', direction === answer ? lit : 'group-active:scale-[0.92] group-active:bg-surface-pressed')}>
            <Icon size={big ? 30 : 26} />
          </AnswerFace>
          <span className="whitespace-nowrap">{labels[answer]}</span>
        </button>
      ))}
    </div>
  )
}
