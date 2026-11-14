'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Skeleton } from '@/components/ui/primitives'
import { usePost } from '@/lib/api/hooks'
import { differenceGrey, differenceImages, differenceScale } from '@/lib/explore/sky-card'
import { useFmt } from '@/lib/use-fmt'

export const DIPOLE_POST = 'wise-0855-0714-03'
const LOUPE = 0.12

type Diff = { w: number; h: number; grey: Uint8ClampedArray }

async function greyPixels(src: string): Promise<{ w: number; h: number; data: Float32Array }> {
  const img = new Image()
  img.src = src
  await img.decode()
  const c = document.createElement('canvas')
  c.width = img.naturalWidth
  c.height = img.naturalHeight
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('canvas')
  ctx.drawImage(img, 0, 0)
  const px = ctx.getImageData(0, 0, c.width, c.height).data
  const data = new Float32Array(c.width * c.height)
  for (let k = 0; k < data.length; k++) data[k] = px[k * 4] as number
  return { w: c.width, h: c.height, data }
}

function paint(canvas: HTMLCanvasElement | null, d: Diff, crop: { x: number; y: number; size: number } | null) {
  const ctx = canvas?.getContext('2d')
  if (!canvas || !ctx) return
  const sx = crop ? crop.x : 0
  const sy = crop ? crop.y : 0
  const sw = crop ? crop.size : d.w
  const sh = crop ? crop.size : d.h
  canvas.width = sw
  canvas.height = sh
  const out = ctx.createImageData(sw, sh)
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const g = d.grey[(sy + y) * d.w + sx + x] ?? 128
      const o = (y * sw + x) * 4
      out.data[o] = g
      out.data[o + 1] = g
      out.data[o + 2] = g
      out.data[o + 3] = 255
    }
  }
  ctx.putImageData(out, 0, 0)
}

export function DipoleFigure() {
  const t = useTranslations('classify.dipole')
  const fmt = useFmt()
  const { data } = usePost(DIPOLE_POST)
  const [diff, setDiff] = useState<Diff | null>(null)
  const whole = useRef<HTMLCanvasElement>(null)
  const loupe = useRef<HTMLCanvasElement>(null)

  const pair = useMemo(() => {
    const frames = data?.post.frames ?? []
    const idx = frames.flatMap((f, i) => (f.telescope === 'SPHEREx' ? [i] : []))
    const a = idx[0]
    const b = idx[idx.length - 1]
    if (a === undefined || b === undefined || a === b) return null
    const marks = data?.post.marks ?? []
    const ma = marks.find((m) => m.frame === a)
    const mb = marks.find((m) => m.frame === b)
    if (!ma || !mb) return null
    return { first: frames[a], last: frames[b], u: (ma.x + mb.x) / 2, v: (ma.y + mb.y) / 2 }
  }, [data])

  useEffect(() => {
    if (!pair?.first || !pair.last) return
    let live = true
    void Promise.all([greyPixels(pair.first.src), greyPixels(pair.last.src)])
      .then(([a, b]) => {
        if (!live || a.w !== b.w || a.h !== b.h) return
        const [, d] = differenceImages([a.data, b.data])
        if (!d) return
        const scale = differenceScale([d])
        setDiff({ w: a.w, h: a.h, grey: Uint8ClampedArray.from(d, (v) => differenceGrey(v, scale)) })
      })
      .catch(() => null)
    return () => {
      live = false
    }
  }, [pair])

  const crop = useMemo(() => {
    if (!diff || !pair) return null
    const size = Math.round(diff.w * LOUPE)
    return {
      size,
      x: Math.max(0, Math.min(diff.w - size, Math.round(pair.u * diff.w - size / 2))),
      y: Math.max(0, Math.min(diff.h - size, Math.round(pair.v * diff.h - size / 2))),
    }
  }, [diff, pair])

  useEffect(() => {
    if (!diff) return
    paint(whole.current, diff, null)
    paint(loupe.current, diff, crop)
  }, [diff, crop])

  return (
    <figure>
      <div className="grid grid-cols-2 gap-2">
        <div className="relative aspect-square overflow-hidden rounded-lg bg-media-bg">
          {diff && crop ? (
            <>
              <canvas ref={whole} role="img" aria-label={t('wholeAlt')} className="pixelated absolute inset-0 size-full object-contain" />
              <span
                className="pointer-events-none absolute rounded-sm ring-1 ring-crosshair"
                style={{ left: `${(crop.x / diff.w) * 100}%`, top: `${(crop.y / diff.h) * 100}%`, width: `${(crop.size / diff.w) * 100}%`, height: `${(crop.size / diff.h) * 100}%` }}
                aria-hidden="true"
              />
            </>
          ) : (
            <Skeleton className="absolute inset-0 rounded-none" />
          )}
        </div>
        <div className="relative aspect-square overflow-hidden rounded-lg bg-media-bg">
          {diff ? <canvas ref={loupe} role="img" aria-label={t('zoomAlt')} className="pixelated absolute inset-0 size-full" /> : <Skeleton className="absolute inset-0 rounded-none" />}
        </div>
      </div>
      <figcaption className="mt-1.5 grid grid-cols-2 gap-2 text-meta text-text-secondary">
        <span>{t('whole')}</span>
        <span>{t('zoom')}</span>
      </figcaption>
      {pair?.first && pair.last && data && (
        <p className="mt-1 text-meta text-text-secondary">{t('source', { name: data.object.name, first: fmt.shortDate(pair.first.t), last: fmt.shortDate(pair.last.t) })}</p>
      )}
    </figure>
  )
}
