'use client'

import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'

export type LoupeSource = { src: string; cols?: number; rows?: number; col?: number; row?: number }
type At = { u: number; v: number }

const ZOOM = 2.5
const SIZE = 112
const LIFT = 32
const KEY_STEP = 0.01
const KEY_JUMP = 0.05

const clamp = (n: number) => Math.min(1, Math.max(0, n))

function Loupe({ source, at, box }: { source: LoupeSource; at: At; box: { w: number; h: number } }) {
  const cols = source.cols ?? 1
  const rows = source.rows ?? 1
  const w = box.w * ZOOM
  const h = box.h * ZOOM
  const x = at.u * box.w
  const y = at.v * box.h
  const above = y - SIZE - LIFT
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute z-20 overflow-hidden rounded-full border-2 border-on-media bg-media-bg shadow-[0_4px_18px_rgb(0_0_0/0.5)]"
      style={{
        left: Math.min(Math.max(0, x - SIZE / 2), Math.max(0, box.w - SIZE)),
        top: above >= 0 ? above : y + LIFT,
        width: SIZE,
        height: SIZE,
        backgroundImage: `url("${source.src}")`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: `${w * cols}px ${h * rows}px`,
        backgroundPosition: `${SIZE / 2 - ((source.col ?? 0) + at.u) * w}px ${SIZE / 2 - ((source.row ?? 0) + at.v) * h}px`,
        imageRendering: 'pixelated',
      }}
      data-testid="mark-loupe"
    >
      <svg className="absolute inset-0 size-full" viewBox="0 0 100 100" aria-hidden="true">
        <g fill="none" strokeLinecap="round">
          <path d="M50 30v12M50 58v12M30 50h12M58 50h12" stroke="var(--color-mark-halo)" strokeWidth="4" opacity="0.6" />
          <path d="M50 30v12M50 58v12M30 50h12M58 50h12" stroke="var(--color-on-media)" strokeWidth="2" />
        </g>
      </svg>
    </span>
  )
}

export function MarkPad({ source, label, start, onPick }: { source: LoupeSource; label: string; start?: At | null; onPick: (u: number, v: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [press, setPress] = useState<At | null>(null)
  const pressing = useRef(false)
  const [cursor, setCursor] = useState<At | null>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })

  const pointOf = (e: PointerEvent<HTMLDivElement>): At => {
    const el = e.currentTarget
    const r = el.getBoundingClientRect()
    setBox({ w: el.offsetWidth, h: el.offsetHeight })
    return { u: clamp((e.clientX - r.left) / r.width), v: clamp((e.clientY - r.top) / r.height) }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const dx = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    const dy = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
    if (dx || dy) {
      e.preventDefault()
      e.stopPropagation()
      const el = ref.current
      if (el) setBox({ w: el.offsetWidth, h: el.offsetHeight })
      const step = e.shiftKey ? KEY_JUMP : KEY_STEP
      setCursor((c) => {
        const from = c ?? start ?? { u: 0.5, v: 0.5 }
        return { u: clamp(from.u + dx * step), v: clamp(from.v + dy * step) }
      })
      return
    }
    if ((e.key === 'Enter' || e.key === ' ') && cursor) {
      e.preventDefault()
      e.stopPropagation()
      onPick(cursor.u, cursor.v)
    }
  }

  const shown = press ?? cursor
  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      aria-label={label}
      className="absolute inset-0 z-10 cursor-crosshair touch-none outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
      onPointerDown={(e) => {
        e.stopPropagation()
        if (e.button !== 0) return
        e.currentTarget.setPointerCapture?.(e.pointerId)
        setCursor(null)
        pressing.current = true
        setPress(pointOf(e))
      }}
      onPointerMove={(e) => {
        e.stopPropagation()
        if (pressing.current) setPress(pointOf(e))
      }}
      onPointerUp={(e) => {
        e.stopPropagation()
        if (!pressing.current) return
        pressing.current = false
        const p = pointOf(e)
        setPress(null)
        onPick(p.u, p.v)
      }}
      onPointerCancel={(e) => {
        e.stopPropagation()
        pressing.current = false
        setPress(null)
      }}
      onKeyDown={onKeyDown}
      onBlur={() => setCursor(null)}
      data-testid="mark-pad"
    >
      {cursor && (
        <span aria-hidden="true" className="pointer-events-none absolute size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-on-media shadow-[0_0_0_1px_var(--color-mark-halo)]" style={{ left: `${cursor.u * 100}%`, top: `${cursor.v * 100}%` }} />
      )}
      {shown && box.w > 0 && <Loupe source={source} at={shown} box={box} />}
    </div>
  )
}

export function MarkRing({ u, v }: { u: number; v: number }) {
  return <span aria-hidden="true" className="pointer-events-none absolute size-11 -translate-x-1/2 -translate-y-1/2 rounded-full border-[2.5px] border-accent shadow-[0_0_0_1.5px_var(--color-mark-halo)]" style={{ left: `${u * 100}%`, top: `${v * 100}%` }} data-testid="mark-ring" />
}
