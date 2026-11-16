'use client'

import { useRef, useState, type HTMLAttributes, type KeyboardEvent, type ReactNode } from 'react'
import { cx } from '@/lib/format'

export type GlassTone = 'surface' | 'media'

export const glassClass = (tone: GlassTone = 'surface') => cx('glass', tone === 'media' && 'glass-media')

export function Glass({ tone = 'surface', className, children, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: GlassTone; children: ReactNode }) {
  return (
    <span {...rest} className={cx(glassClass(tone), className)}>
      {children}
    </span>
  )
}

export function GlassTabs<K extends string>({ items, value, onChange, label, dense = false }: { items: { key: K; label: string }[]; value: K; onChange: (k: K) => void; label: string; dense?: boolean }) {
  const index = Math.max(0, items.findIndex((i) => i.key === value))
  const [moving, setMoving] = useState(false)
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const pick = (i: number, focus = false) => {
    const item = items[(i + items.length) % items.length]
    if (!item) return
    if (item.key !== value) setMoving(true)
    onChange(item.key)
    if (focus) refs.current[(i + items.length) % items.length]?.focus()
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const move = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (move) {
      e.preventDefault()
      pick(index + move, true)
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      pick(e.key === 'Home' ? 0 : items.length - 1, true)
    }
  }
  return (
    <div role="tablist" aria-label={label} onKeyDown={onKey} className={cx(glassClass(), 'relative grid rounded-full p-1')} style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }} data-testid="glass-tabs">
      <span
        aria-hidden="true"
        data-moving={moving ? '' : undefined}
        onAnimationEnd={() => setMoving(false)}
        className="glass-drop pointer-events-none absolute inset-y-1 left-1 rounded-full"
        style={{ width: `calc((100% - 0.5rem) / ${items.length})`, transform: `translateX(${index * 100}%)` }}
      />
      {items.map((item, i) => (
        <button
          key={item.key}
          ref={(el) => {
            refs.current[i] = el
          }}
          type="button"
          role="tab"
          aria-selected={i === index}
          tabIndex={i === index ? 0 : -1}
          onClick={() => pick(i)}
          className={cx('hit-44 relative z-10 rounded-full font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent', dense ? 'min-h-9 px-1 py-1 text-meta leading-tight [text-wrap:balance]' : 'h-9 text-note', i === index ? 'text-text' : 'text-text-secondary')}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
