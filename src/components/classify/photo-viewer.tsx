'use client'

import { useReducedMotion } from 'framer-motion'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { IconChevronLeft, IconChevronRight, IconPause, IconPlay } from '@/components/icons'
import { Segmented, Skeleton, useLoopRestart } from '@/components/ui/primitives'
import type { Reveal } from '@/lib/api/client'
import { cx, formatDateTime, formatWavelength } from '@/lib/format'

export type PhotoRow = 0 | 1

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
  onPlayingChange,
  onLocate,
  fit = false,
}: {
  sprite: string
  img: HTMLImageElement | null
  offsets: number[]
  reveal?: Reveal
  overlay?: (panel: number) => ReactNode
  caption?: (panel: number) => ReactNode
  onPlayingChange?: (playing: boolean) => void
  onLocate?: (frame: number, x: number, y: number) => void
  fit?: boolean
}) {
  const t = useTranslations('classify')
  const locale = useLocale()
  const reduce = useReducedMotion()
  const label = useOffsetLabel()
  const canvas = useRef<HTMLCanvasElement>(null)
  const [row, setRow] = useState<PhotoRow>(0)
  const [panel, setPanel] = useState(0)
  const [playing, setPlaying] = useState(!reduce)
  const [chevrons, setChevrons] = useState(false)
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const hide = useRef<ReturnType<typeof setTimeout> | null>(null)
  const n = Math.max(1, offsets.length)
  const tile = img ? Math.round(img.naturalHeight / 2) : 1
  const running = playing && n > 1
  const restart = useLoopRestart(panel, running)

  useEffect(() => onPlayingChange?.(running), [running, onPlayingChange])

  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => setPanel((p) => (p + 1) % n), 700)
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
      setPlaying(false)
      setPanel((p) => (p + d + n) % n)
      flash()
    },
    [n, flash],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.shiftKey || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('[role="dialog"]')) return
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        step(e.key === 'ArrowLeft' ? -1 : 1)
      } else if (e.key === ' ') {
        e.preventDefault()
        setPlaying((p) => !p)
        flash()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, flash])

  const pos = dotPositions(offsets)
  const frame = reveal?.frames[panel]
  const current = label(offsets[panel] ?? 0)

  const stage = (
      <div
        className={cx('relative select-none', onLocate && 'cursor-crosshair', fit && 'mx-auto aspect-square')}
        style={fit ? { width: 'min(100cqw, 100cqh)' } : undefined}
        onPointerDown={(e) => {
          swipe.current = { x: e.clientX, y: e.clientY }
        }}
        onPointerUp={(e) => {
          const start = swipe.current
          swipe.current = null
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
            setPlaying((p) => !p)
            flash()
          }
        }}
      >
        <canvas
          ref={canvas}
          width={tile}
          height={tile}
          role="img"
          aria-label={t('photoAlt', { n: panel + 1, total: n, when: current })}
          className="pixelated block aspect-square w-full bg-media-bg"
          data-sprite={sprite}
        />
        {!img && <Skeleton className="absolute inset-0 rounded-none" />}
        {overlay?.(panel)}
        {n > 1 && (
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

      <div className={cx('px-3', fit ? 'pt-1' : 'pt-3')}>
        <FrameTimeline
          positions={pos}
          current={panel}
          restart={restart}
          label={t('timeline')}
          dotLabel={(i) => t('photoAt', { n: i + 1, when: label(offsets[i] ?? 0) })}
          onPick={(i) => {
            setPlaying(false)
            setPanel(i)
            flash()
          }}
        />
        <div className="mt-1 flex items-center gap-2">
          <p className="min-w-0 flex-1 text-note font-medium text-text-secondary first-letter:uppercase" aria-live="off">
            {current}
          </p>
          <Segmented
            label={t('view')}
            value={row === 0 ? 'photos' : 'changes'}
            onChange={(v) => setRow(v === 'photos' ? 0 : 1)}
            options={[
              { value: 'photos', label: t('photos') },
              { value: 'changes', label: t('changes') },
            ]}
          />
          {n > 1 && (
            <button
              type="button"
              aria-label={running ? t('pause') : t('play')}
              onClick={() => {
                setPlaying((p) => !p)
                flash()
              }}
              className="-mr-1 inline-flex size-11 items-center justify-center rounded-full text-text active:scale-90"
            >
              {running ? <IconPause size={24} /> : <IconPlay size={24} />}
            </button>
          )}
        </div>
        {caption?.(panel)}
        {frame && !fit && <p className="pb-2 text-meta text-text-muted">{t('frameWhen', { date: formatDateTime(frame.t, locale), wavelength: formatWavelength([frame.wl_min, frame.wl_max]) })}</p>}
      </div>
    </div>
  )
}
