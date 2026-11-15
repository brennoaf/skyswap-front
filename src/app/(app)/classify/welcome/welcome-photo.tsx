'use client'

import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import { CardBehind, GestureHint, photoFrame, photoInset, SwapStamps } from '@/components/classify/swap-photo'
import type { DeckCard, GuideData } from '@/lib/api/client'
import { cx } from '@/lib/format'
import { Spotlight } from './spotlight'

export type Mark = { u: number; v: number }
export type WelcomeExample = GuideData['examples'][number]
export type WelcomeStepPlan = { key: 'intro' | 'still' | 'moves' | 'mark' | 'particle' | 'streak' | 'unsure'; example?: WelcomeExample['example']; swipe?: { x: number; up: boolean; arrow: string }; follow?: boolean; trace?: boolean; spot?: { u: number; v: number; r: number }; tap?: boolean; hold?: number }
export type WelcomeStep = WelcomeStepPlan & { card: DeckCard; marks: Mark[] }

const INTRO_FRAME_MS = 800
const EXAMPLE_FRAME_MS = 1000
const DEMO_WAIT_MS = 300
const DEMO_RESET_S = 0.2
const DEMO_TOP_CLEAR_PX = 4
const DEMO_STAMP_UP_PX = 24
const DEMO_GESTURE = { duration: 2.9, times: [0, 0.5 / 2.9, 0.9 / 2.9, 1.4 / 2.9, 1], ease: 'easeInOut' as const, repeat: Infinity }
const SPOT_RADIUS = 12

export function WelcomePhoto({ step, index, sprites }: { step: WelcomeStep; index: number; sprites: Record<string, HTMLImageElement> }) {
  const tp = useTranslations('player')
  const canvas = useRef<HTMLCanvasElement>(null)
  const gap = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const rotate = useTransform(x, [-240, 240], [-6, 6])
  const [frame, setFrame] = useState(0)
  const img = sprites[step.card.sprite]
  const frames = Math.max(1, step.card.offsets_s.length)
  const { swipe, hold = 0 } = step
  const frameMs = step.example ? EXAMPLE_FRAME_MS : INTRO_FRAME_MS
  useEffect(() => {
    if (reduce) {
      x.set(0)
      y.set(0)
      return
    }
    const moves = [animate(x, 0, { duration: DEMO_RESET_S }), animate(y, 0, { duration: DEMO_RESET_S })]
    const timer = swipe
      ? setTimeout(() => {
          const up = swipe.up ? (gap.current?.offsetHeight ?? 0) - DEMO_TOP_CLEAR_PX : 0
          moves.push(animate(x, [0, swipe.x, swipe.x, 0, 0], DEMO_GESTURE), animate(y, [0, -up, -up, 0, 0], DEMO_GESTURE))
        }, DEMO_WAIT_MS)
      : undefined
    return () => {
      clearTimeout(timer)
      moves.forEach((m) => m.stop())
    }
  }, [index, reduce, swipe, x, y])
  useEffect(() => {
    setFrame(0)
    if (reduce || frames < 2) return
    const timer = setInterval(() => setFrame((f) => f + 1), frameMs)
    return () => clearInterval(timer)
  }, [frameMs, frames, index, reduce])
  const at = (reduce ? hold : frame) % frames
  useEffect(() => {
    const c = canvas.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx || !img) return
    const tile = Math.round(img.naturalHeight / 2)
    if (c.width !== tile) c.width = tile
    if (c.height !== tile) c.height = tile
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(img, at * tile, 0, tile, tile, 0, 0, tile, tile)
  }, [at, img])
  const mark = step.marks[at] ?? step.marks[0]
  const spot = step.follow && mark ? { u: mark.u, v: mark.v, r: SPOT_RADIUS } : step.spot
  return (
    <>
      <div ref={gap} className="flex h-[var(--welcome-up)] shrink-0 items-center justify-center" data-testid="welcome-gap">
        {(step.tap || step.trace) && (
          <p className="text-ui font-semibold leading-none" data-testid="welcome-counter">
            {tp('counter', { n: at + 1, total: frames })}
          </p>
        )}
      </div>
      <div className="relative flex shrink-0 justify-center overflow-x-clip pb-1.5" aria-hidden="true" data-testid="swipe-demo-slot">
        <CardBehind size="var(--welcome-photo)" />
        <motion.div style={{ x, y, rotate, width: 'var(--welcome-photo)', height: 'var(--welcome-photo)' }} className={cx(photoFrame, 'shrink-0')} data-testid="swipe-demo" data-sprite={step.card.sprite} data-frame={at}>
          <div className={photoInset}>
            <canvas ref={canvas} className="pixelated block size-full" />
            {spot && <Spotlight u={spot.u} v={spot.v} r={spot.r} />}
            {step.trace &&
              step.marks.slice(0, at + 1).map((m, i) =>
                i === at ? (
                  <span key={i} className="absolute size-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-[2.5px] border-accent" style={{ left: `${m.u * 100}%`, top: `${m.v * 100}%` }} data-testid="welcome-trace" />
                ) : (
                  <span key={i} className="absolute size-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-on-media-muted" style={{ left: `${m.u * 100}%`, top: `${m.v * 100}%` }} />
                ),
              )}
          </div>
          {swipe && !reduce && <GestureHint x={x} y={y} />}
          <SwapStamps x={x} y={y} upFull={DEMO_STAMP_UP_PX} />
        </motion.div>
      </div>
    </>
  )
}
