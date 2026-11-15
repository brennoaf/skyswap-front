'use client'

import { useEffect, useState } from 'react'

const preloaded = new Map<string, HTMLImageElement>()

export function preloadSprite(src: string) {
  if (preloaded.has(src)) return
  const el = new Image()
  el.src = src
  preloaded.set(src, el)
}

export function useSprite(src: string | undefined) {
  const [img, setImg] = useState<{ src: string; el: HTMLImageElement } | null>(null)
  useEffect(() => {
    if (!src) return
    const ready = preloaded.get(src)
    preloaded.delete(src)
    if (ready?.complete && ready.naturalHeight) {
      setImg({ src, el: ready })
      return
    }
    const el = ready ?? new Image()
    let live = true
    el.onload = () => live && setImg({ src, el })
    el.src = src
    return () => {
      live = false
    }
  }, [src])
  return img && img.src === src ? img.el : null
}

export function useSpriteSet(srcs: string[]) {
  const [loaded, setLoaded] = useState<Record<string, HTMLImageElement>>({})
  const key = srcs.join('|')
  useEffect(() => {
    let live = true
    for (const src of new Set(key.split('|'))) {
      const el = new Image()
      el.onload = () => live && setLoaded((now) => ({ ...now, [src]: el }))
      el.src = src
    }
    return () => {
      live = false
    }
  }, [key])
  return loaded
}
