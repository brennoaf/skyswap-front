'use client'

import Image from 'next/image'
import { useTranslations, useLocale } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import { IconCarousel, IconReel } from '@/components/icons'
import type { Post } from '@/lib/api/client'
import { formatShortDate, formatWavelength } from '@/lib/format'
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

export function PostMedia({ post, priority = false }: { post: Post; priority?: boolean }) {
  const locale = useLocale()
  const t = useTranslations('post')
  const crosshair = useUi((s) => s.crosshair)
  const { ref, inView } = useInView<HTMLDivElement>()
  const [frame, setFrame] = useState(0)
  const [slide, setSlide] = useState(0)
  const scroller = useRef<HTMLDivElement>(null)
  const isTimelapse = PLAYABLE.has(post.type) && post.frames.length > 1
  const longBaseline = isLongBaseline(post)
  const isMulti = MULTI.has(post.type) && post.frames.length > 1

  useEffect(() => {
    if (!isTimelapse || !inView || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = setInterval(() => setFrame((f) => (f + 1) % post.frames.length), longBaseline ? 1000 / LONG_BASELINE_FPS : 160)
    return () => clearInterval(timer)
  }, [isTimelapse, inView, post.frames.length, longBaseline])

  const shown = isTimelapse ? post.frames[frame] : isMulti ? post.frames[slide] : post.frames[0]
  const mark = post.marks.find((m) => m.frame === (isTimelapse ? frame : isMulti ? slide : 0))
  const caption = shown && longBaseline ? `${frameYear(shown)}, ${telescopeOf(shown)}` : shown ? `${shown.band}, ${formatWavelength(shown.wavelength_um)}` : post.band ? `${post.band}, ${formatWavelength(post.wavelength_um)}` : null
  const isChart = !post.frames.length

  return (
    <div ref={ref} className="relative aspect-[4/5] w-full overflow-hidden bg-media-bg">
      {isMulti ? (
        <div
          ref={scroller}
          className="no-scrollbar flex h-full snap-x snap-mandatory overflow-x-auto"
          onScroll={(e) => {
            const el = e.currentTarget
            setSlide(Math.round(el.scrollLeft / el.clientWidth))
          }}
        >
          {post.frames.map((f, i) => (
            <div key={f.src} className="relative h-full w-full shrink-0 snap-center">
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
        <span className="absolute right-2 top-2 flex size-8 items-center justify-center text-white drop-shadow">
          {isTimelapse ? <IconReel size={26} /> : isMulti ? <IconCarousel size={26} /> : null}
        </span>
      )}
      {isMulti && (
        <span className="absolute right-3 top-11 rounded-full bg-black/60 px-2 py-0.5 text-meta font-medium text-white">
          {slide + 1}/{post.frames.length}
        </span>
      )}
      {caption && !isChart && (
        <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-1 text-meta text-white">
          {caption}, {t('falseColour')}
        </span>
      )}
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
