'use client'

import { useEffect, useState } from 'react'
import { BAND_EDGES } from '@/components/charts/chart-math'
import { HIPS_TILE, orderFor, renderHips, surveyFor, type HipsSurvey } from './hips'

export const OLD_SKY_BLINK_MS = 800

const tiles = new Map<string, Promise<Uint8ClampedArray | null>>()

function readTile(survey: HipsSurvey['id'], order: number, npix: number): Promise<Uint8ClampedArray | null> {
  const key = `${survey}/${order}/${npix}`
  const hit = tiles.get(key)
  if (hit) return hit
  const load = (async () => {
    const r = await fetch(`/api/hips/${survey}/${order}/${npix}`)
    if (!r.ok) return null
    const bitmap = await createImageBitmap(await r.blob())
    const canvas = new OffscreenCanvas(HIPS_TILE, HIPS_TILE)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(bitmap, 0, 0, HIPS_TILE, HIPS_TILE)
    return ctx.getImageData(0, 0, HIPS_TILE, HIPS_TILE).data
  })().catch(() => null)
  tiles.set(key, load)
  return load
}

export type OldSky = { state: 'idle' | 'loading' | 'ready' | 'failed'; img: Float32Array | null; survey: HipsSurvey | null }

export function useOldSky(on: boolean, band: string | null, n: number, fovDeg: number, pix2world: (x: number, y: number) => [number, number]): OldSky {
  const [result, setResult] = useState<OldSky>({ state: 'idle', img: null, survey: null })
  const edges = band ? BAND_EDGES[band] : undefined
  const survey = surveyFor(edges ? (edges[0] + edges[1]) / 2 : null)
  useEffect(() => {
    if (!on || !n) return
    let alive = true
    setResult({ state: 'loading', img: null, survey })
    const order = orderFor(fovDeg / n, survey.maxOrder)
    renderHips(n, pix2world, order, (npix) => readTile(survey.id, order, npix))
      .then((img) => alive && setResult({ state: img.some((v) => Number.isFinite(v)) ? 'ready' : 'failed', img, survey }))
      .catch(() => alive && setResult({ state: 'failed', img: null, survey }))
    return () => {
      alive = false
    }
  }, [on, n, fovDeg, pix2world, survey])
  return on ? result : { state: 'idle', img: null, survey: null }
}
