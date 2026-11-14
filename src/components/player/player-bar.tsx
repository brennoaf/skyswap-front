'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { IconPause, IconPlay, IconStepBack, IconStepForward } from '@/components/icons'
import type { Playback } from '@/components/player/use-playback'
import { cx } from '@/lib/format'

const MIN_CELL = 44
const MAX_CELL = 64
const WINDOW = 6
const BIG_GAP_S = 3600
const BIG_GAP_RATIO = 5

export function useGapLabel() {
  const t = useTranslations('player')
  return (seconds: number) => {
    if (seconds < 60) return t('gaps.seconds', { n: Math.max(1, Math.round(seconds)) })
    if (seconds < 3600) return t('gaps.minutes', { n: Math.round(seconds / 60) })
    if (seconds < 86400) {
      const h = Math.floor(seconds / 3600)
      const m = Math.round((seconds - h * 3600) / 60)
      return m ? t('gaps.hoursMinutes', { h, m }) : t('gaps.hours', { h })
    }
    const days = Math.round(seconds / 86400)
    return days < 730 ? t('gaps.days', { n: days }) : t('gaps.years', { n: Math.round(days / 365.25) })
  }
}

function bigGaps(seconds: number[]): boolean[] {
  const diffs = seconds.slice(1).map((s, i) => s - (seconds[i] ?? 0))
  const median = [...diffs].sort((a, b) => a - b)[Math.floor(diffs.length / 2)] ?? 0
  return seconds.map((_, i) => i > 0 && (diffs[i - 1] ?? 0) > BIG_GAP_S && (diffs[i - 1] ?? 0) > median * BIG_GAP_RATIO)
}

function PhotoStrip({ playback, seconds, thumb, label, tone }: { playback: Playback; seconds: number[]; thumb: (i: number) => ReactNode; label: string; tone: 'surface' | 'media' }) {
  const { n, index, setIndex, setPlaying } = playback
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const drag = useRef<{ x: number; start: number; moved: boolean } | null>(null)
  const gaps = useMemo(() => bigGaps(seconds), [seconds])

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(e?.contentRect.width ?? 0))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const fits = width >= n * MIN_CELL
  const cell = fits && n ? Math.min(MAX_CELL, width / n) : MIN_CELL
  const shift = fits ? (width - n * cell) / 2 : width / 2 - (index + 0.5) * cell
  const clamp = (i: number) => Math.min(n - 1, Math.max(0, i))
  const pick = (clientX: number) => {
    const r = box.current?.getBoundingClientRect()
    if (!r) return index
    return fits ? clamp(Math.floor((clientX - r.left - shift) / cell)) : clamp(index + Math.round((clientX - r.left - width / 2) / cell))
  }

  return (
    <div
      ref={box}
      role="slider"
      aria-label={label}
      aria-valuemin={1}
      aria-valuemax={n}
      aria-valuenow={index + 1}
      tabIndex={0}
      data-testid="photo-strip"
      className="relative h-11 touch-none select-none overflow-hidden rounded-lg [@media(min-height:700px)]:h-14"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        setPlaying(false)
        drag.current = { x: e.clientX, start: index, moved: false }
        if (fits) setIndex(pick(e.clientX))
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d) return
        if (fits) {
          setIndex(pick(e.clientX))
          return
        }
        const dx = e.clientX - d.x
        if (Math.abs(dx) > 6) d.moved = true
        if (d.moved) setIndex(clamp(d.start - Math.round(dx / cell)))
      }}
      onPointerUp={(e) => {
        const d = drag.current
        drag.current = null
        if (d && !fits && !d.moved) setIndex(pick(e.clientX))
      }}
      onPointerCancel={() => {
        drag.current = null
      }}
    >
      <div className="absolute inset-y-0 left-0 motion-safe:transition-transform motion-safe:duration-100" style={{ transform: `translateX(${shift}px)`, width: n * cell }}>
        {Array.from({ length: n }, (_, i) => {
          if (!fits && Math.abs(i - index) > WINDOW) return null
          return (
            <span key={i} className="absolute inset-y-0 p-px" style={{ left: i * cell, width: cell }}>
              <span className={cx('relative block size-full overflow-hidden rounded-md bg-media-bg', i === index && 'ring-2 ring-inset ring-accent', i !== index && 'opacity-70')}>
                {thumb(i)}
                {i === index && <span className="pointer-events-none absolute inset-0 rounded-md ring-2 ring-inset ring-accent" />}
              </span>
              {gaps[i] && <span className={cx('absolute inset-y-1 left-0 w-0.5 rounded-full', tone === 'media' ? 'bg-on-media' : 'bg-text')} aria-hidden="true" />}
            </span>
          )
        })}
      </div>
    </div>
  )
}

export function PlayerBar({
  playback,
  seconds,
  dates,
  thumb,
  extra,
  tone = 'surface',
  compact = false,
  outside = false,
  reserve = false,
  note,
  className,
}: {
  playback: Playback
  seconds: number[]
  dates?: (string | null | undefined)[]
  thumb: (i: number) => ReactNode
  extra?: ReactNode
  tone?: 'surface' | 'media'
  compact?: boolean
  outside?: boolean
  reserve?: boolean
  note?: ReactNode
  className?: string
}) {
  const t = useTranslations('player')
  const locale = useLocale()
  const gap = useGapLabel()
  const reduce = useReducedMotion()
  const { n, index, running, blinking } = playback
  if (n < 2) return null
  const after = (seconds[index] ?? 0) - (seconds[0] ?? 0)
  const date = dates?.[index]
  const fullDate = date ? new Date(date).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' }) : null
  const soft = tone === 'media' ? 'bg-media-scrim text-on-media' : 'bg-surface text-text active:bg-surface-pressed'
  const small = cx('inline-flex size-10 shrink-0 items-center justify-center rounded-full', tone === 'media' ? 'text-on-media' : 'text-text')
  const counter = t('counter', { n: index + 1, total: n })
  const tools = !playback.playing
  const steps = (
    <div className="flex items-center">
      <button type="button" aria-label={t('prev')} onClick={() => playback.setIndex((i) => i - 1)} className={small}>
        <IconStepBack size={26} />
      </button>
      <button type="button" aria-label={t('next')} onClick={() => playback.setIndex((i) => i + 1)} className={small}>
        <IconStepForward size={26} />
      </button>
    </div>
  )
  return (
    <div className={cx('space-y-1', tone === 'media' && 'text-on-media', className)} data-testid="player-bar">
      <div className="flex items-center gap-3">
        <button type="button" aria-label={playback.playing ? t('pause') : t('play')} onClick={() => playback.setPlaying(!playback.playing)} className={cx('inline-flex size-14 shrink-0 items-center justify-center rounded-full', soft)}>
          {playback.playing ? <IconPause size={30} /> : <IconPlay size={30} />}
        </button>
        <div className="min-w-0 flex-1" aria-live="off">
          <p className="text-[15px] font-medium leading-5" data-testid="player-counter">
            {running || after <= 0 ? counter : t('counterAfter', { counter, gap: gap(after) })}
          </p>
          {note ? (
            <div className="text-note font-medium leading-snug text-link">{note}</div>
          ) : outside ? (
            <p className="truncate text-note font-medium leading-5 text-warning">{t('outside')}</p>
          ) : (
            !running && fullDate && <p className={cx('truncate text-note leading-5', tone === 'media' ? 'text-on-media-muted' : 'text-text-secondary')}>{fullDate}</p>
          )}
        </div>
        {compact && tools && steps}
      </div>
      <AnimatePresence initial={false}>
      {!compact && (tools || reserve) && (
        <motion.div key="tools" initial={reduce ? false : { height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={reduce ? undefined : { height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className={cx('space-y-1 overflow-hidden', !tools && 'invisible')} aria-hidden={!tools}>
          <PhotoStrip playback={playback} seconds={seconds} thumb={thumb} label={t('strip')} tone={tone} />
          <div className="flex items-center justify-between gap-1">
            {steps}
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" aria-label={t('speed', { value: playback.speed })} onClick={playback.cycleSpeed} className={cx('h-10 min-w-10 shrink-0 rounded-full px-1 text-note font-semibold', soft)}>
                {t('speedValue', { value: playback.speed })}
              </button>
              <button
                type="button"
                aria-label={t('blinkHint')}
                aria-pressed={blinking}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId)
                  playback.startBlink()
                }}
                onPointerUp={playback.stopBlink}
                onPointerCancel={playback.stopBlink}
                onContextMenu={(e) => e.preventDefault()}
                className={cx('h-10 touch-none select-none whitespace-nowrap rounded-full px-3 text-note font-semibold', blinking ? 'bg-accent text-on-accent' : soft)}
              >
                {t('blink')}
              </button>
              {extra}
            </div>
          </div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  )
}
