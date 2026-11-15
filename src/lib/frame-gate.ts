'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export const MEDIA_WAIT_MS = 1500
const AHEAD = 3
const loaded = new Set<string>()

export function useFrameGate(srcs: string[], index: number, active: boolean) {
  const src = active ? srcs[index] : undefined
  const [ready, setReady] = useState<string | null>(null)
  const inflight = useRef(new Map<string, HTMLImageElement>())

  const markLoaded = useCallback((s: string) => {
    loaded.add(s)
    setReady(s)
  }, [])

  useEffect(() => {
    if (!src || loaded.has(src)) return
    const timer = setTimeout(() => setReady(src), MEDIA_WAIT_MS)
    return () => clearTimeout(timer)
  }, [src])

  useEffect(() => {
    const map = inflight.current
    const want = new Set(active ? srcs.slice(index + 1, index + 1 + AHEAD).filter((s) => !loaded.has(s)) : [])
    for (const [s, img] of map) {
      if (want.has(s)) continue
      img.onload = null
      img.onerror = null
      img.src = ''
      map.delete(s)
    }
    for (const s of want) {
      if (map.has(s)) continue
      const img = new window.Image()
      img.onload = () => {
        loaded.add(s)
        map.delete(s)
      }
      img.onerror = () => map.delete(s)
      img.src = s
      map.set(s, img)
    }
  }, [srcs, index, active])

  useEffect(() => {
    const map = inflight.current
    return () => {
      for (const img of map.values()) {
        img.onload = null
        img.onerror = null
        img.src = ''
      }
      map.clear()
    }
  }, [])

  return { waiting: !!src && !loaded.has(src) && ready !== src, markLoaded }
}
