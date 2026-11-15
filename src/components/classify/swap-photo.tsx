'use client'

import { motion, useReducedMotion, useTransform, type MotionValue } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, type ReactNode } from 'react'
import { useCardGestures } from '@/components/classify/card-gestures'
import { useOffsetLabel } from '@/components/classify/photo-viewer'
import { IconPause, IconPlay } from '@/components/icons'
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
  big: 'flex h-[60px] min-w-0 flex-1 items-center justify-center rounded-2xl border border-divider bg-bg-elevated px-2 text-center text-[18px] font-semibold leading-tight active:bg-surface-pressed disabled:opacity-50',
  mid: 'flex h-12 min-w-0 flex-1 items-center justify-center rounded-2xl bg-surface px-2 text-center text-[16px] font-semibold leading-tight active:bg-surface-pressed disabled:opacity-50',
  primary: 'flex h-[60px] min-w-0 flex-1 items-center justify-center rounded-2xl bg-accent px-2 text-center text-[18px] font-semibold leading-tight text-on-accent active:bg-accent-pressed disabled:opacity-50',
}

export function FrameBars({ n, index }: { n: number; index: number }) {
  return (
    <div className="flex h-3 shrink-0 gap-1 px-3 pb-2" aria-hidden="true" data-testid="frame-bars">
      {Array.from({ length: n }, (_, i) => (
        <i key={i} className={cx('h-1 flex-1 rounded-sm', i === index ? 'bg-text' : 'bg-divider')} />
      ))}
    </div>
  )
}

function Stamp({ label, opacity, className }: { label: string; opacity: MotionValue<number>; className: string }) {
  return (
    <motion.span aria-hidden="true" style={{ opacity }} className={cx('pointer-events-none absolute top-3.5 z-10 whitespace-nowrap rounded-full bg-bg px-3.5 py-2 text-[17px] font-bold ring-2', className)}>
      {label}
    </motion.span>
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
  onTouch,
  overlay,
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
  onTouch?: () => void
  overlay?: ReactNode
}) {
  const t = useTranslations('classify')
  const reduce = useReducedMotion()
  const canvas = useRef<HTMLCanvasElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const tile = img ? Math.round(img.naturalHeight / 2) : 1
  const rotate = useTransform(x, [-240, 240], reduce ? [0, 0] : [-6, 6])
  const moves = useTransform(x, [12, 50], [0, 1])
  const still = useTransform(x, [-50, -12], [1, 0])
  const unsure = useTransform(y, [-50, -12], [1, 0])

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
    <div className="relative z-10 flex shrink-0 justify-center" data-testid="swap-photo-slot">
      <motion.div
        {...gestures.bind}
        onPointerDownCapture={onTouch}
        style={{ x, y, rotate, width: 'var(--swap-photo)', height: 'var(--swap-photo)' }}
        className="relative touch-none select-none overflow-hidden bg-media-bg"
        data-testid="swap-photo"
      >
        <div ref={inner} className="relative size-full origin-center" style={gestures.zoom.scale > 1 ? { transform: `translate(${gestures.zoom.x}px, ${gestures.zoom.y}px) scale(${gestures.zoom.scale})` } : undefined}>
          <canvas ref={canvas} width={tile} height={tile} role="img" aria-label={alt} className="pixelated block size-full bg-media-bg" data-sprite={sprite} data-frame={panel} />
          {!img && <Skeleton className="absolute inset-0 rounded-none" />}
          {overlay}
        </div>
        <Stamp label={t('moves')} opacity={moves} className="left-3.5 text-accent ring-accent" />
        <Stamp label={t('still')} opacity={still} className="right-3.5 text-text ring-text-secondary" />
        <Stamp label={t('unsure')} opacity={unsure} className="left-1/2 -translate-x-1/2 text-warning ring-warning" />
      </motion.div>
    </div>
  )
}

export function PhotoBar({ playback, offsets, onTools }: { playback: Playback; offsets: number[]; onTools: () => void }) {
  const t = useTranslations('classify')
  const tp = useTranslations('player')
  const label = useOffsetLabel()
  return (
    <div className="flex h-[60px] shrink-0 items-center gap-3 px-4" data-testid="player-bar">
      <button type="button" aria-label={playback.playing ? tp('pause') : tp('play')} onClick={() => playback.setPlaying(!playback.playing)} className="flex size-12 shrink-0 items-center justify-center rounded-full bg-surface text-text active:bg-surface-pressed">
        {playback.playing ? <IconPause size={26} /> : <IconPlay size={26} />}
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-[16px] font-semibold leading-tight" data-testid="player-counter">
          {tp('counter', { n: playback.index + 1, total: playback.n })}
        </p>
        <p className="truncate text-[14px] leading-tight text-text-secondary">{label(offsets[playback.index] ?? 0)}</p>
      </div>
      <button type="button" onClick={onTools} className="h-11 shrink-0 rounded-full bg-surface px-4 text-[15px] font-semibold active:bg-surface-pressed">
        {t('tools.open')}
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
        <p className="shrink-0 text-[14px] leading-snug text-text-secondary">{t('tools.diffNote')}</p>
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
          className={cx(swapButton.mid, 'touch-none select-none text-[15px]', playback.blinking && 'bg-accent text-on-accent')}
        >
          {t('tools.blink')}
        </button>
        <button type="button" aria-pressed={row === 1} onClick={() => onRow(row === 0 ? 1 : 0)} className={cx(swapButton.mid, 'text-[15px]', row === 1 && 'bg-accent text-on-accent active:bg-accent-pressed')}>
          {t('tools.diff')}
        </button>
      </div>
      <div className="flex shrink-0 gap-2">
        {hints && (
          <button type="button" aria-pressed={hints.on} onClick={() => hints.onChange(!hints.on)} className={cx(swapButton.mid, 'text-[15px]', hints.on && 'bg-accent text-on-accent active:bg-accent-pressed')}>
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

export function AnswerPanel({ labels, disabled, onChoose }: { labels: { still: string; moves: string; glitch: string; unsure: string }; disabled: boolean; onChoose: (a: 'still' | 'moves' | 'glitch' | 'unsure') => void }) {
  return (
    <div className="mt-auto flex shrink-0 flex-col gap-2 px-4 pb-4 pt-1">
      <div className="flex gap-2">
        <button type="button" disabled={disabled} onClick={() => onChoose('still')} className={swapButton.big}>
          {labels.still}
        </button>
        <button type="button" disabled={disabled} onClick={() => onChoose('moves')} className={swapButton.big}>
          {labels.moves}
        </button>
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={disabled} onClick={() => onChoose('glitch')} className={swapButton.mid}>
          {labels.glitch}
        </button>
        <button type="button" disabled={disabled} onClick={() => onChoose('unsure')} className={swapButton.mid}>
          {labels.unsure}
        </button>
      </div>
    </div>
  )
}

export function SwapPanel({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <section aria-label={label} className="relative mt-auto flex max-h-full shrink-0 flex-col gap-2 overflow-y-auto rounded-t-[20px] bg-sheet px-4 pb-3.5 pt-3.5 shadow-[var(--shadow-sheet)]" data-testid="swap-panel">
      {children}
    </section>
  )
}
