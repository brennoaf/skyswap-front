'use client'

import type { MotionValue } from 'framer-motion'
import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react'

const MOVE_START = 8
const HOLD_MS = 180
const TAP_MS = 260
const DOUBLE_PX = 30
const MAX_ZOOM = 6
const DOUBLE_ZOOM = 2.5

export type CardZoom = { scale: number; x: number; y: number }

const NO_ZOOM: CardZoom = { scale: 1, x: 0, y: 0 }

type Mode = 'idle' | 'swipe' | 'pan' | 'pinch'

function clampZoom(z: CardZoom, box: DOMRect | undefined): CardZoom {
  const scale = Math.min(MAX_ZOOM, Math.max(1, z.scale))
  if (scale === 1 || !box) return NO_ZOOM
  const maxX = (box.width * (scale - 1)) / 2
  const maxY = (box.height * (scale - 1)) / 2
  return { scale, x: Math.min(maxX, Math.max(-maxX, z.x)), y: Math.min(maxY, Math.max(-maxY, z.y)) }
}

export function useCardGestures({
  box,
  x,
  y,
  canSwipe,
  threshold,
  onRelease,
  onCancel,
  onTap,
  onHold,
}: {
  box: RefObject<HTMLElement | null>
  x: MotionValue<number>
  y: MotionValue<number>
  canSwipe: boolean
  threshold: number
  onRelease: (dx: number, dy: number, vx: number, vy: number) => void
  onCancel: () => void
  onTap?: (clientX: number, clientY: number) => void
  onHold: (held: boolean) => void
}) {
  const [zoom, setZoom] = useState<CardZoom>(NO_ZOOM)
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef({ mode: 'idle' as Mode, x: 0, y: 0, t: 0, lastX: 0, lastY: 0, lastT: 0, vx: 0, vy: 0, crossed: false })
  const pinch = useRef({ dist: 1, cx: 0, cy: 0, zoom: NO_ZOOM })
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTap = useRef<{ x: number; y: number; t: number } | null>(null)
  const held = useRef(false)

  const clearHold = useCallback(() => {
    if (holdTimer.current) clearTimeout(holdTimer.current)
    holdTimer.current = null
    if (held.current) {
      held.current = false
      onHold(false)
    }
  }, [onHold])

  useEffect(
    () => () => {
      if (holdTimer.current) clearTimeout(holdTimer.current)
      if (tapTimer.current) clearTimeout(tapTimer.current)
    },
    [],
  )

  const startPinch = () => {
    const [a, b] = [...pointers.current.values()]
    if (!a || !b) return
    pinch.current = { dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, zoom: zoomRef.current }
    gesture.current.mode = 'pinch'
  }

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      clearHold()
      if (gesture.current.mode === 'swipe') onCancel()
      startPinch()
      return
    }
    if (pointers.current.size > 2) return
    const now = performance.now()
    gesture.current = { mode: 'idle', x: e.clientX, y: e.clientY, t: now, lastX: e.clientX, lastY: e.clientY, lastT: now, vx: 0, vy: 0, crossed: false }
    holdTimer.current = setTimeout(() => {
      held.current = true
      onHold(true)
    }, HOLD_MS)
  }

  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesture.current
    if (g.mode === 'pinch') {
      const [a, b] = [...pointers.current.values()]
      if (!a || !b) return
      const p = pinch.current
      const scale = p.zoom.scale * (Math.hypot(a.x - b.x, a.y - b.y) / p.dist)
      setZoom(clampZoom({ scale, x: p.zoom.x + (a.x + b.x) / 2 - p.cx, y: p.zoom.y + (a.y + b.y) / 2 - p.cy }, box.current?.getBoundingClientRect()))
      return
    }
    const dx = e.clientX - g.x
    const dy = e.clientY - g.y
    if (g.mode === 'idle') {
      if (Math.hypot(dx, dy) < MOVE_START) return
      if (holdTimer.current) clearTimeout(holdTimer.current)
      g.mode = zoomRef.current.scale > 1 ? 'pan' : canSwipe ? 'swipe' : 'idle'
      if (g.mode === 'idle') return
    }
    if (g.mode === 'pan') {
      setZoom((z) => clampZoom({ scale: z.scale, x: z.x + e.clientX - g.lastX, y: z.y + e.clientY - g.lastY }, box.current?.getBoundingClientRect()))
    } else {
      x.set(dx)
      y.set(Math.min(0, dy) + Math.max(0, dy) / 4)
      const crossed = Math.abs(dx) > threshold || dy < -threshold
      if (crossed && !g.crossed) navigator.vibrate?.(10)
      g.crossed = crossed
    }
    const now = performance.now()
    const dt = Math.max(1, now - g.lastT)
    g.vx = ((e.clientX - g.lastX) / dt) * 1000
    g.vy = ((e.clientY - g.lastY) / dt) * 1000
    g.lastX = e.clientX
    g.lastY = e.clientY
    g.lastT = now
  }

  const onPointerUp = (e: PointerEvent<HTMLElement>) => {
    if (!pointers.current.delete(e.pointerId)) return
    const g = gesture.current
    if (g.mode === 'pinch') {
      if (pointers.current.size === 0) g.mode = 'idle'
      else {
        const [rest] = [...pointers.current.values()]
        const now = performance.now()
        if (rest) gesture.current = { mode: 'pan', x: rest.x, y: rest.y, t: now, lastX: rest.x, lastY: rest.y, lastT: now, vx: 0, vy: 0, crossed: false }
      }
      return
    }
    if (pointers.current.size) return
    const wasHeld = held.current
    clearHold()
    if (g.mode === 'swipe') {
      onRelease(e.clientX - g.x, e.clientY - g.y, g.vx, g.vy)
      return
    }
    if (g.mode !== 'idle' || wasHeld || Math.hypot(e.clientX - g.x, e.clientY - g.y) >= MOVE_START) return
    const now = performance.now()
    const last = lastTap.current
    if (last && now - last.t < TAP_MS + 60 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < DOUBLE_PX) {
      if (tapTimer.current) clearTimeout(tapTimer.current)
      tapTimer.current = null
      lastTap.current = null
      const r = box.current?.getBoundingClientRect()
      if (zoomRef.current.scale > 1 || !r) setZoom(NO_ZOOM)
      else setZoom(clampZoom({ scale: DOUBLE_ZOOM, x: (r.left + r.width / 2 - e.clientX) * (DOUBLE_ZOOM - 1), y: (r.top + r.height / 2 - e.clientY) * (DOUBLE_ZOOM - 1) }, r))
      return
    }
    lastTap.current = { x: e.clientX, y: e.clientY, t: now }
    const { clientX, clientY } = e
    if (onTap) tapTimer.current = setTimeout(() => onTap(clientX, clientY), TAP_MS)
  }

  const onPointerCancel = (e: PointerEvent<HTMLElement>) => {
    pointers.current.delete(e.pointerId)
    clearHold()
    if (gesture.current.mode === 'swipe') onCancel()
    gesture.current.mode = 'idle'
  }

  return { zoom, bind: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel } }
}
