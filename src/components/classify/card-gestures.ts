'use client'

import type { MotionValue } from 'framer-motion'
import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react'
import { clampZoom, NO_ZOOM, startsAtEdge, type BoxSize, type CardZoom } from './zoom'

const MOVE_START = 8
const HOLD_MS = 180
const TAP_MS = 260
const DOUBLE_PX = 30
const DOUBLE_ZOOM = 2.5

type Mode = 'idle' | 'swipe' | 'pan' | 'pinch'

export function useCardGestures({
  box,
  x,
  y,
  canSwipe,
  doubleTap = true,
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
  doubleTap?: boolean
  threshold: number
  onRelease: (dx: number, dy: number, vx: number, vy: number) => void
  onCancel: () => void
  onTap?: (clientX: number, clientY: number) => void
  onHold: (held: boolean) => void
}) {
  const [zoom, setZoom] = useState<CardZoom>(NO_ZOOM)
  const zoomRef = useRef(zoom)
  const size = useRef<BoxSize | null>(null)
  const paint = useRef(0)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef({ mode: 'idle' as Mode, x: 0, y: 0, t: 0, lastX: 0, lastY: 0, lastT: 0, vx: 0, vy: 0, crossed: false, edge: false })
  const pinch = useRef({ dist: 1, cx: 0, cy: 0, zoom: NO_ZOOM })
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTap = useRef<{ x: number; y: number; t: number } | null>(null)
  const held = useRef(false)

  const applyZoom = useCallback((z: CardZoom, now = false) => {
    zoomRef.current = z
    if (now) {
      cancelAnimationFrame(paint.current)
      paint.current = 0
      setZoom(z)
      return
    }
    if (paint.current) return
    paint.current = requestAnimationFrame(() => {
      paint.current = 0
      setZoom(zoomRef.current)
    })
  }, [])

  const resetZoom = useCallback(() => applyZoom(NO_ZOOM, true), [applyZoom])

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
      cancelAnimationFrame(paint.current)
    },
    [],
  )

  const measure = () => {
    const el = box.current
    size.current = el ? { width: el.offsetWidth, height: el.offsetHeight } : null
  }

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
    measure()
    const now = performance.now()
    const edge = e.pointerType === 'touch' && startsAtEdge(e.clientX, window.innerWidth)
    gesture.current = { mode: 'idle', x: e.clientX, y: e.clientY, t: now, lastX: e.clientX, lastY: e.clientY, lastT: now, vx: 0, vy: 0, crossed: false, edge }
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
      applyZoom(clampZoom({ scale, x: p.zoom.x + (a.x + b.x) / 2 - p.cx, y: p.zoom.y + (a.y + b.y) / 2 - p.cy }, size.current))
      return
    }
    const dx = e.clientX - g.x
    const dy = e.clientY - g.y
    if (g.mode === 'idle') {
      if (Math.hypot(dx, dy) < MOVE_START) return
      if (holdTimer.current) clearTimeout(holdTimer.current)
      g.mode = zoomRef.current.scale > 1 ? 'pan' : canSwipe && !g.edge ? 'swipe' : 'idle'
      if (g.mode === 'idle') return
    }
    if (g.mode === 'pan') {
      const z = zoomRef.current
      applyZoom(clampZoom({ scale: z.scale, x: z.x + e.clientX - g.lastX, y: z.y + e.clientY - g.lastY }, size.current))
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
        if (rest) gesture.current = { mode: 'pan', x: rest.x, y: rest.y, t: now, lastX: rest.x, lastY: rest.y, lastT: now, vx: 0, vy: 0, crossed: false, edge: false }
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
    const { clientX, clientY } = e
    if (!doubleTap) {
      if (tapTimer.current) clearTimeout(tapTimer.current)
      tapTimer.current = null
      lastTap.current = null
      onTap?.(clientX, clientY)
      return
    }
    const now = performance.now()
    const last = lastTap.current
    if (last && now - last.t < TAP_MS + 60 && Math.hypot(clientX - last.x, clientY - last.y) < DOUBLE_PX) {
      if (tapTimer.current) clearTimeout(tapTimer.current)
      tapTimer.current = null
      lastTap.current = null
      const r = box.current?.getBoundingClientRect()
      if (zoomRef.current.scale > 1 || !r) applyZoom(NO_ZOOM, true)
      else applyZoom(clampZoom({ scale: DOUBLE_ZOOM, x: (r.left + r.width / 2 - clientX) * (DOUBLE_ZOOM - 1), y: (r.top + r.height / 2 - clientY) * (DOUBLE_ZOOM - 1) }, { width: r.width, height: r.height }), true)
      return
    }
    lastTap.current = { x: clientX, y: clientY, t: now }
    if (onTap) tapTimer.current = setTimeout(() => onTap(clientX, clientY), TAP_MS)
  }

  const onPointerCancel = (e: PointerEvent<HTMLElement>) => {
    pointers.current.delete(e.pointerId)
    clearHold()
    if (gesture.current.mode === 'swipe') onCancel()
    gesture.current.mode = 'idle'
  }

  return { zoom, resetZoom, bind: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel } }
}
