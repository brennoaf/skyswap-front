'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useUi } from '@/lib/state/ui'

const LAST_FRAME_HOLD = 2.5
const BLINK_MS = 350
export const SPEEDS = [0.5, 1, 2]

export function usePlayback(n: number, opts: { baseMs: number; minMs?: number; autoplay?: boolean; enabled?: boolean; frozen?: boolean; loop?: boolean; onEnd?: () => void }) {
  const { baseMs, minMs = 0, autoplay = false, enabled = true, frozen = false, loop = true, onEnd } = opts
  const speed = useUi((s) => s.speed)
  const setSpeed = useUi((s) => s.setSpeed)
  const [raw, setRaw] = useState(0)
  const [playing, setPlaying] = useState(autoplay)
  const [blinking, setBlinking] = useState(false)
  const [phase, setPhase] = useState(false)
  const end = useRef(onEnd)
  end.current = onEnd
  const running = playing && enabled && !frozen && !blinking && n > 1

  useEffect(() => setRaw((i) => Math.min(i, Math.max(0, n - 1))), [n])

  useEffect(() => {
    if (!running) return
    const delay = Math.max(baseMs / speed, minMs) * (raw === n - 1 ? LAST_FRAME_HOLD : 1)
    const timer = setTimeout(() => {
      if (raw + 1 < n) setRaw(raw + 1)
      else if (loop) setRaw(0)
      else end.current?.()
    }, delay)
    return () => clearTimeout(timer)
  }, [running, raw, n, baseMs, minMs, speed, loop])

  useEffect(() => {
    if (!blinking) return
    const timer = setInterval(() => setPhase((p) => !p), BLINK_MS)
    return () => clearInterval(timer)
  }, [blinking])

  const stopBlink = useCallback(() => setBlinking(false), [])

  const setIndex = useCallback(
    (next: number | ((i: number) => number)) => {
      setRaw((i) => {
        const v = typeof next === 'function' ? next(i) : next
        return n ? ((v % n) + n) % n : 0
      })
    },
    [n],
  )

  return {
    n,
    index: blinking ? (phase ? n - 1 : 0) : raw,
    setIndex,
    playing,
    setPlaying,
    running,
    speed,
    cycleSpeed: () => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length] ?? 1),
    blinking,
    startBlink: () => {
      setPhase(false)
      setBlinking(true)
    },
    stopBlink,
  }
}

export type Playback = ReturnType<typeof usePlayback>
