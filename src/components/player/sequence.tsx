'use client'

import { useTranslations } from 'next-intl'
import { useRef, type ReactNode } from 'react'
import { IconInfo, IconPause, IconPlay, IconStepBack, IconStepForward } from '@/components/icons'
import { Glass, glassClass, GlassTabs } from '@/components/ui/glass'
import { IconButton } from '@/components/ui/primitives'
import { cx } from '@/lib/format'
import { nearestIndex, type TrackLayout } from '@/lib/passes'

export function pillDate(ms: number, locale: string): string {
  const parts = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).formatToParts(new Date(ms))
  return parts
    .filter((p) => p.type === 'day' || p.type === 'month' || p.type === 'year')
    .map((p) => (p.type === 'month' ? p.value.replace('.', '') : p.value))
    .join(' ')
}

export function MediaPills({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-x-2 top-2 z-10 flex items-start justify-between gap-2" data-testid="media-pills">
      <span className="flex min-w-0 items-center gap-1.5">{left}</span>
      <span className="flex shrink-0 items-center gap-1.5">{right}</span>
    </div>
  )
}

export function PillPair({ a, b }: { a: string; b: string }) {
  return (
    <>
      <span className="truncate">{a}</span>
      <span className="mx-1.5 size-[3px] shrink-0 rounded-full bg-current opacity-70" aria-hidden="true" />
      <span className="shrink-0">{b}</span>
    </>
  )
}

export function MediaPill({ children, className, testId }: { children: ReactNode; className?: string; testId?: string }) {
  return (
    <Glass tone="media" className={cx('inline-flex h-7 min-w-0 items-center truncate rounded-full px-2.5 text-meta font-semibold tabular-nums', className)} data-testid={testId}>
      {children}
    </Glass>
  )
}

export function MediaPillButton({ label, pressed, onClick, children, testId }: { label: string; pressed?: boolean; onClick: () => void; children: ReactNode; testId?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      data-testid={testId}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      className={cx(glassClass('media'), 'hit-44 pointer-events-auto inline-flex size-7 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent')}
    >
      <span className={cx('inline-flex', pressed && 'text-crosshair')}>{children}</span>
    </button>
  )
}

export function Track({ layout, current, onPick, label, valueText }: { layout: TrackLayout; current: number; onPick: (i: number) => void; label: string; valueText: string }) {
  const box = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const { positions, segments } = layout
  const n = positions.length
  const x = (p: number) => `calc(7px + ${p} * (100% - 14px))`
  const pick = (clientX: number) => {
    const r = box.current?.getBoundingClientRect()
    if (!r || r.width <= 14) return
    onPick(nearestIndex(positions, Math.min(1, Math.max(0, (clientX - r.left - 7) / (r.width - 14)))))
  }
  return (
    <div
      ref={box}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={1}
      aria-valuemax={n}
      aria-valuenow={current + 1}
      aria-valuetext={valueText}
      data-testid="seq-track"
      className="relative h-11 touch-none select-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent"
      onKeyDown={(e) => {
        const to = e.key === 'ArrowRight' ? current + 1 : e.key === 'ArrowLeft' ? current - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : null
        if (to === null) return
        e.preventDefault()
        onPick(Math.min(n - 1, Math.max(0, to)))
      }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        dragging.current = true
        pick(e.clientX)
      }}
      onPointerMove={(e) => {
        if (dragging.current) pick(e.clientX)
      }}
      onPointerUp={() => {
        dragging.current = false
      }}
      onPointerCancel={() => {
        dragging.current = false
      }}
    >
      {segments.map((s, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={cx(
            'absolute top-1/2 -translate-y-1/2',
            s.kind === 'faint' ? 'h-0 border-t-[1.5px] border-dotted border-ring-seen opacity-70' : cx('h-1 rounded-full', s.kind === 'accent' ? 'bg-accent/45' : 'bg-text-muted/45'),
          )}
          style={{ left: s.to > s.from ? x(s.from) : `calc(${x(s.from)} - 2px)`, width: s.to > s.from ? `calc(${s.to - s.from} * (100% - 14px))` : '4px' }}
        />
      ))}
      {n <= 80 &&
        positions.map((p, i) => (
          <span key={i} aria-hidden="true" className={cx('absolute top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full', i <= current ? 'bg-accent' : 'bg-text-muted')} style={{ left: x(p) }} />
        ))}
      {n > 0 && <span aria-hidden="true" className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-text shadow ring-2 ring-accent motion-safe:transition-[left] motion-safe:duration-150" style={{ left: x(positions[current] ?? 0) }} />}
    </div>
  )
}

export function PlaybackBar({ playing, onToggle, onStep, disabled = false, children }: { playing: boolean; onToggle: () => void; onStep: (d: 1 | -1) => void; disabled?: boolean; children?: ReactNode }) {
  const t = useTranslations('player')
  return (
    <div className="flex items-center gap-0.5 px-1.5" data-testid="seq-bar">
      <IconButton label={t('prev')} onClick={() => onStep(-1)} disabled={disabled}>
        <IconStepBack size={24} />
      </IconButton>
      <button
        type="button"
        aria-label={playing ? t('pause') : t('play')}
        onClick={onToggle}
        disabled={disabled}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-surface text-text transition-transform active:scale-90 disabled:opacity-40"
      >
        {playing ? <IconPause size={24} /> : <IconPlay size={24} />}
      </button>
      <IconButton label={t('next')} onClick={() => onStep(1)} disabled={disabled}>
        <IconStepForward size={24} />
      </IconButton>
      <div className="min-w-0 flex-1 pl-2 pr-1.5">{children}</div>
    </div>
  )
}

export function ModeRow<K extends string>({ items, value, onChange, onInfo }: { items: { key: K; label: string }[]; value: K; onChange: (k: K) => void; onInfo?: () => void }) {
  const t = useTranslations('seq')
  return (
    <div className="flex items-center gap-1.5 px-3 pt-2" data-testid="seq-modes">
      <div className="min-w-0 flex-1">{items.length > 1 && <GlassTabs items={items} value={value} onChange={onChange} label={t('modes')} dense />}</div>
      {onInfo && (
        <IconButton label={t('info')} onClick={onInfo} className="text-text-secondary" data-testid="seq-info">
          <IconInfo size={24} />
        </IconButton>
      )}
    </div>
  )
}
