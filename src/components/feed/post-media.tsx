'use client'

import Image from 'next/image'
import { useTranslations, useLocale } from 'next-intl'
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { IconCarousel, IconReel } from '@/components/icons'
import type { Post } from '@/lib/api/client'
import { cx, formatShortDate } from '@/lib/format'
import { frameYear, isLongBaseline, LONG_BASELINE_FPS, PLAYABLE, telescopeOf, yearsSpanned } from '@/lib/long-baseline'
import { useUi } from '@/lib/state/ui'

export function Crosshair({ x, y, size = 34, color = 'var(--color-warning)' }: { x: number; y: number; size?: number; color?: string }) {
  return (
    <svg className="pointer-events-none absolute" style={{ left: `calc(${x * 100}% - ${size / 2}px)`, top: `calc(${y * 100}% - ${size / 2}px)` }} width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
      <g stroke={color} strokeWidth="2" strokeLinecap="round" fill="none">
        <path d="M17 1V9M17 25V33M1 17H9M25 17H33" />
        <circle cx="17" cy="17" r="5" strokeOpacity="0.55" />
      </g>
    </svg>
  )
}

function useInView<T extends Element>(threshold = 0.6) {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setInView(!!e && e.isIntersecting), { threshold })
    io.observe(el)
    return () => io.disconnect()
  }, [threshold])
  return { ref, inView }
}

const MULTI = new Set(['band_compare', 'pass_blink'])
const DRAG_START = 8
const SNAP_SHARE = 0.18

export function PostMedia({ post, priority = false }: { post: Post; priority?: boolean }) {
  const locale = useLocale()
  const t = useTranslations('post')
  const crosshair = useUi((s) => s.crosshair)
  const { ref, inView } = useInView<HTMLDivElement>()
  const [frame, setFrame] = useState(0)
  const [slide, setSlide] = useState(0)
  const [offset, setOffset] = useState(0)
  const [paused, setPaused] = useState(false)
  const drag = useRef<{ x: number; y: number; frame: number; active: boolean } | null>(null)
  const dragged = useRef(false)
  const isTimelapse = PLAYABLE.has(post.type) && post.frames.length > 1
  const longBaseline = isLongBaseline(post)
  const isMulti = MULTI.has(post.type) && post.frames.length > 1

  useEffect(() => {
    if (!inView) setPaused(false)
  }, [inView])

  useEffect(() => {
    if (!isTimelapse || !inView || paused || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = setInterval(() => setFrame((f) => (f + 1) % post.frames.length), longBaseline ? 1000 / LONG_BASELINE_FPS : 160)
    return () => clearInterval(timer)
  }, [isTimelapse, inView, paused, post.frames.length, longBaseline])

  const shown = isTimelapse ? post.frames[frame] : isMulti ? post.frames[slide] : post.frames[0]
  const mark = post.marks.find((m) => m.frame === (isTimelapse ? frame : isMulti ? slide : 0))
  const yearChip = shown && longBaseline ? `${frameYear(shown)}, ${telescopeOf(shown)}` : null
  const isChart = !post.frames.length
  const n = post.frames.length
  const swipeable = isTimelapse || isMulti

  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.active) {
      if (Math.abs(dx) < DRAG_START && Math.abs(dy) < DRAG_START) return
      if (Math.abs(dy) > Math.abs(dx)) {
        drag.current = null
        return
      }
      d.active = true
      dragged.current = true
      e.currentTarget.setPointerCapture(e.pointerId)
      if (isTimelapse) setPaused(true)
    }
    if (isMulti) {
      const atEnd = (dx > 0 && slide === 0) || (dx < 0 && slide === n - 1)
      setOffset(atEnd ? dx / 3 : dx)
    } else {
      const step = Math.min(40, Math.max(8, e.currentTarget.clientWidth / n))
      setFrame((((d.frame - Math.round(dx / step)) % n) + n) % n)
    }
  }
  const end = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    drag.current = null
    if (!d?.active || !isMulti) return
    const dx = e.clientX - d.x
    if (Math.abs(dx) > e.currentTarget.clientWidth * SNAP_SHARE) setSlide((v) => Math.max(0, Math.min(n - 1, v + (dx < 0 ? 1 : -1))))
    setOffset(0)
  }
  const cancel = () => {
    drag.current = null
    setOffset(0)
  }

  return (
    <div
      ref={ref}
      className={cx('relative aspect-[4/5] w-full overflow-hidden bg-media-bg', swipeable && 'touch-pan-y select-none')}
      onPointerDown={swipeable ? (e) => {
        drag.current = { x: e.clientX, y: e.clientY, frame, active: false }
        dragged.current = false
      } : undefined}
      onPointerMove={swipeable ? move : undefined}
      onPointerUp={swipeable ? end : undefined}
      onPointerCancel={swipeable ? cancel : undefined}
      onDragStart={swipeable ? (e) => e.preventDefault() : undefined}
      onClickCapture={(e) => {
        if (!dragged.current) return
        dragged.current = false
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      {isMulti ? (
        <div className={cx('flex h-full', !offset && 'motion-safe:transition-transform motion-safe:duration-200')} style={{ transform: `translateX(calc(${-slide * 100}% + ${offset}px))` }}>
          {post.frames.map((f, i) => (
            <div key={f.src} className="relative h-full w-full shrink-0">
              <Image src={f.src} alt={t('frameAlt', { band: f.band, date: formatShortDate(f.t, locale) })} fill sizes="(max-width: 470px) 100vw, 470px" className="pixelated object-contain" priority={priority && i === 0} />
            </div>
          ))}
        </div>
      ) : (
        <Image
          src={isTimelapse && shown ? shown.src : post.cover}
          alt={isChart ? t('chartAlt', { title: post.title }) : t('frameAlt', { band: shown?.band ?? post.band ?? '', date: formatShortDate(shown?.t ?? post.date_range[0] ?? '', locale) })}
          fill
          sizes="(max-width: 470px) 100vw, 470px"
          className={isChart ? 'object-contain' : 'pixelated object-contain'}
          priority={priority}
          unoptimized
        />
      )}
      {crosshair && mark && !isChart && (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 aspect-square -translate-y-1/2">
          <Crosshair x={mark.x} y={mark.y} />
        </div>
      )}
      {longBaseline ? (
        <span className="absolute right-2 top-2 rounded-full bg-media-scrim px-2 py-0.5 text-meta font-semibold text-on-media">{t('yearsBadge', { n: yearsSpanned(post) })}</span>
      ) : (
        <span className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-media-scrim text-on-media">
          {isTimelapse ? <IconReel size={26} /> : isMulti ? <IconCarousel size={26} /> : null}
        </span>
      )}
      {(isMulti || (isTimelapse && paused)) && (
        <span className="absolute right-3 top-11 rounded-full bg-black/60 px-2 py-0.5 text-meta font-medium text-white">
          {(isMulti ? slide : frame) + 1}/{n}
        </span>
      )}
      {yearChip && <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-1 text-meta text-white">{yearChip}</span>}
      {isMulti && (
        <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1" aria-hidden="true">
          {post.frames.map((f, i) => (
            <span key={f.src} className={i === slide ? 'size-1.5 rounded-full bg-accent' : 'size-1.5 rounded-full bg-white/50'} />
          ))}
        </div>
      )}
    </div>
  )
}
