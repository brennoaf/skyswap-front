'use client'

import { useMotionValue, useReducedMotion, type MotionValue } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useCardGestures } from '@/components/classify/card-gestures'
import { IconChevronLeft, IconChevronRight } from '@/components/icons'
import { PlayerBar } from '@/components/player/player-bar'
import { usePlayback } from '@/components/player/use-playback'
import { Skeleton } from '@/components/ui/primitives'
import type { Reveal } from '@/lib/api/client'
import { cx } from '@/lib/format'
import { hasOutsideArea } from '@/lib/out-of-field'

export type PhotoRow = 0 | 1

const FRAME_MS = 700

export type CardSwipe = {
  x: MotionValue<number>
  y: MotionValue<number>
  enabled: boolean
  threshold: number
  onRelease: (dx: number, dy: number, vx: number, vy: number) => void
  onCancel: () => void
}

const NO_SWIPE: CardSwipe['onCancel'] = () => undefined

export function useOffsetLabel() {
  const t = useTranslations('classify.time')
  return useCallback(
    (s: number) => {
      if (s <= 0) return t('first')
      if (s < 60) return t('seconds', { n: Math.round(s) })
      if (s < 3600) return t('minutes', { n: Math.round(s / 60) })
      if (s < 86400) {
        const h = Math.floor(s / 3600)
        const m = Math.round((s - h * 3600) / 60)
        return m ? t('hoursMinutes', { h, m }) : t('hours', { h })
      }
      return t('days', { n: Math.round(s / 86400) })
    },
    [t],
  )
}

export function dotPositions(offsets: number[]): number[] {
  const last = offsets[offsets.length - 1] ?? 0
  if (offsets.length < 2 || last <= 0) return offsets.map(() => 0)
  const raw = offsets.map((o) => o / last)
  const gap = Math.min(0.08, 1 / (offsets.length * 1.5))
  const out: number[] = []
  for (const r of raw) out.push(Math.max(r, (out[out.length - 1] ?? -gap) + gap))
  const end = out[out.length - 1] ?? 1
  return end > 1 ? out.map((v) => v / end) : out
}

export function FrameTimeline({ positions, current, restart, label, dotLabel, onPick }: { positions: number[]; current: number; restart: boolean; label: string; dotLabel: (i: number) => string; onPick: (i: number) => void }) {
  return (
    <div className="relative h-6" role="group" aria-label={label}>
      <span className="absolute inset-x-1 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-divider" aria-hidden="true" />
      {positions.map((p, i) => (
        <button
          key={i}
          type="button"
          aria-label={dotLabel(i)}
          aria-current={i === current ? 'true' : undefined}
          onClick={() => onPick(i)}
          className="absolute top-1/2 flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
          style={{ left: `calc(4px + ${p} * (100% - 8px))` }}
        >
          <span
            className={cx(
              'block rounded-full motion-safe:transition-all motion-safe:duration-300',
              i === current ? 'size-3 bg-accent' : 'size-2 bg-ring-seen',
              i === 0 && restart ? 'ring-4 ring-accent/40' : i === current && 'ring-2 ring-accent/30',
            )}
          />
        </button>
      ))}
    </div>
  )
}

export function PhotoViewer({
  sprite,
  img,
  offsets,
  reveal,
  overlay,
  caption,
  onLocate,
  fit = false,
  swipe,
  hold = false,
  onTouchPhoto,
  compact = false,
}: {
  sprite: string
  img: HTMLImageElement | null
  offsets: number[]
  reveal?: Reveal
  overlay?: (panel: number) => ReactNode
  caption?: (panel: number) => ReactNode
  onLocate?: (frame: number, x: number, y: number) => void
  fit?: boolean
  swipe?: CardSwipe
  hold?: boolean
  onTouchPhoto?: () => void
  compact?: boolean
}) {
  const t = useTranslations('classify')
  const reduce = useReducedMotion()
  const label = useOffsetLabel()
  const canvas = useRef<HTMLCanvasElement>(null)
  const [row, setRow] = useState<PhotoRow>(0)
  const [chevrons, setChevrons] = useState(false)
  const [frozen, setFrozen] = useState(false)
  const inner = useRef<HTMLDivElement>(null)
  const restX = useMotionValue(0)
  const restY = useMotionValue(0)
  const drag = useRef<{ x: number; y: number } | null>(null)
  const hide = useRef<ReturnType<typeof setTimeout> | null>(null)
  const n = Math.max(1, offsets.length)
  const tile = img ? Math.round(img.naturalHeight / 2) : 1
  const playback = usePlayback(n, { baseMs: FRAME_MS, autoplay: !reduce, frozen: frozen || hold })
  const panel = playback.index
  const { running } = playback
  const outside = useMemo(() => (img ? offsets.map((_, i) => hasOutsideArea(img, i * tile, 0, tile)) : []), [img, offsets, tile])

  useEffect(() => {
    const c = canvas.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx || !img) return
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.drawImage(img, panel * tile, row * tile, tile, tile, 0, 0, tile, tile)
  }, [img, panel, row, tile])

  useEffect(() => () => {
    if (hide.current) clearTimeout(hide.current)
  }, [])

  const flash = useCallback(() => {
    setChevrons(true)
    if (hide.current) clearTimeout(hide.current)
    hide.current = setTimeout(() => setChevrons(false), 2000)
  }, [])

  const step = useCallback(
    (d: number) => {
      playback.setPlaying(false)
      playback.setIndex((p) => p + d)
      flash()
    },
    [playback, flash],
  )

  const gestures = useCardGestures({
    box: inner,
    x: swipe?.x ?? restX,
    y: swipe?.y ?? restY,
    canSwipe: !!swipe?.enabled,
    threshold: swipe?.threshold ?? 0,
    onRelease: swipe?.onRelease ?? NO_SWIPE,
    onCancel: swipe?.onCancel ?? NO_SWIPE,
    onHold: setFrozen,
    onTap: onLocate
      ? (cx0, cy0) => {
          const r = inner.current?.getBoundingClientRect()
          if (r) onLocate(panel, Math.min(1, Math.max(0, (cx0 - r.left) / r.width)), Math.min(1, Math.max(0, (cy0 - r.top) / r.height)))
        }
      : undefined,
  })
  const current = label(offsets[panel] ?? 0)
  const seconds = offsets
  const dates = reveal?.frames.map((f) => f.t)
  const thumb = (i: number) => (
    <span
      className="pixelated mx-auto block aspect-square h-full bg-no-repeat"
      style={{ backgroundImage: `url(${sprite})`, backgroundSize: `${n * 100}% 200%`, backgroundPosition: `${n > 1 ? (i / (n - 1)) * 100 : 0}% ${row * 100}%` }}
    />
  )

  const stage = (
    <div
      className={cx('relative select-none overflow-hidden', onLocate && 'cursor-crosshair', fit && 'mx-auto aspect-square', swipe && 'touch-none')}
      style={fit ? { width: 'min(100cqw, 100cqh)' } : undefined}
      {...(swipe ? gestures.bind : {})}
      onPointerDownCapture={onTouchPhoto}
      onPointerDown={swipe ? gestures.bind.onPointerDown : (e) => {
        drag.current = { x: e.clientX, y: e.clientY }
      }}
      onPointerUp={swipe ? gestures.bind.onPointerUp : (e) => {
        const start = drag.current
        drag.current = null
        if (!start) return
        const dx = e.clientX - start.x
        const dy = e.clientY - start.y
        if (!running && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
          step(dx < 0 ? 1 : -1)
          return
        }
        if (Math.abs(dx) > 8 || Math.abs(dy) > 8) return
        const r = e.currentTarget.getBoundingClientRect()
        const x = (e.clientX - r.left) / r.width
        if (onLocate) {
          onLocate(panel, Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)))
          return
        }
        if (x < 1 / 3) step(-1)
        else if (x > 2 / 3) step(1)
        else {
          playback.setPlaying(!playback.playing)
          flash()
        }
      }}
    >
      <div ref={inner} className="relative origin-center" style={gestures.zoom.scale > 1 ? { transform: `translate(${gestures.zoom.x}px, ${gestures.zoom.y}px) scale(${gestures.zoom.scale})` } : undefined}>
        <canvas
          ref={canvas}
          width={tile}
          height={tile}
          role="img"
          aria-label={t('photoAlt', { n: panel + 1, total: n, when: current })}
          className="pixelated block aspect-square w-full bg-media-bg"
          data-sprite={sprite}
          data-frame={panel}
        />
        {!img && <Skeleton className="absolute inset-0 rounded-none" />}
        {overlay?.(panel)}
      </div>
      {n > 1 && !swipe && (
        <>
          <span className={cx('pointer-events-none absolute left-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-media-scrim text-on-media transition-opacity duration-300', chevrons && !running ? 'opacity-100' : 'opacity-0')} aria-hidden="true">
            <IconChevronLeft size={26} />
          </span>
          <span className={cx('pointer-events-none absolute right-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-media-scrim text-on-media transition-opacity duration-300', chevrons && !running ? 'opacity-100' : 'opacity-0')} aria-hidden="true">
            <IconChevronRight size={26} />
          </span>
        </>
      )}
    </div>
  )

  return (
    <div className={fit ? 'flex min-h-0 flex-1 flex-col' : undefined}>
      {fit ? <div className="flex min-h-0 flex-1 items-center justify-center [container-type:size]">{stage}</div> : stage}
      <div className="px-2 pb-1 pt-1">
        <PlayerBar
          playback={playback}
          seconds={seconds}
          dates={dates}
          thumb={thumb}
          compact={compact}
          outside={!!outside[panel]}
          extra={
            <button type="button" aria-label={t('changes')} aria-pressed={row === 1} onClick={() => setRow(row === 0 ? 1 : 0)} className={cx('h-10 whitespace-nowrap rounded-full px-2.5 text-note font-semibold', row === 1 ? 'bg-text text-bg' : 'bg-surface text-text')}>
              {t('changesShort')}
            </button>
          }
        />
        {caption?.(panel)}
      </div>
    </div>
  )
}
