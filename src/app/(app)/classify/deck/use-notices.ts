'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type Strip = { kind: 'known'; name: string } | { kind: 'badge'; name: string } | { kind: 'fast' }

const NOTICE_MS = 5000

export function useNotices() {
  const [strip, setStrip] = useState<Strip | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const waiting = useRef<Strip[]>([])

  const pump = useCallback(() => {
    if (timer.current) return
    const notice = waiting.current.shift()
    if (!notice) return
    setStrip(notice)
    timer.current = setTimeout(() => {
      timer.current = null
      setStrip(null)
      pump()
    }, NOTICE_MS)
  }, [])

  const show = useCallback(
    (strips: Strip[]) => {
      waiting.current.push(...strips)
      pump()
    },
    [pump],
  )

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  return { strip, show }
}
