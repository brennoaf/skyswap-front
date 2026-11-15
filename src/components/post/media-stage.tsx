'use client'

import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Crosshair } from '@/components/feed/post-media'
import { usePlayback } from '@/components/player/use-playback'
import type { Frame } from '@/lib/api/client'
import { cx, formatWavelength } from '@/lib/format'
import { useFmt } from '@/lib/use-fmt'
import { frameYear, telescopeOf, TIMELAPSE_FPS } from '@/lib/long-baseline'
import { hasOutsideArea } from '@/lib/out-of-field'
import { useUi } from '@/lib/state/ui'
import { useBandName } from '@/lib/use-band'

export type Point = { frame: number; x: number; y: number }
export type StageMode = 'play' | 'mark' | 'compare'

const PRELOAD_AHEAD = 7
export const STAGE_BOX =
  'aspect-[4/5] max-h-[calc(100dvh-var(--height-topbar)-var(--height-bottomnav)-env(safe-area-inset-bottom)-102px)] min-h-[240px]'

export function usePlayer(length: number, enabled: boolean, fps = TIMELAPSE_FPS, maxFps = Infinity) {
  return usePlayback(length, { baseMs: 1000 / fps, minMs: 1000 / maxFps, enabled })
}

export type Player = ReturnType<typeof usePlayer>

function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('rounded-full bg-reels-bg px-2 py-0.5 text-meta font-medium text-on-media', className)}>{children}</span>
}

function Dot({ x, y, tone }: { x: number; y: number; tone: 'mine' | 'community' }) {
  return (
    <span
      className={cx('pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-mark-outline', tone === 'mine' ? 'bg-mark-mine' : 'bg-mark-community')}
      style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
    />
  )
}

export function MediaStage({
  frames,
  index,
  playing,
  onPlaying,
  onIndex,
  predicted,
  revealPrediction = false,
  mode,
  myMarks,
  draftMarks,
  community,
  onMark,
  compareFrames,
  onSwipe,
  onOutside,
  saturated,
  path,
}: {
  frames: Frame[]
  index: number
  playing: boolean
  onPlaying: (on: boolean) => void
  onIndex: (i: number) => void
  predicted: Map<number, { x: number; y: number }>
  revealPrediction?: boolean
  mode: StageMode
  myMarks: Point[]
  draftMarks: Point[]
  community: { frame: number; x: number; y: number }[] | null
  onMark: (p: Point) => void
  compareFrames: [Frame, Frame] | null
  onSwipe?: (dir: 1 | -1) => void
  onOutside?: (src: string, outside: boolean) => void
  saturated?: boolean
  path?: { x: number; y: number }[] | null
}) {
  const t = useTranslations('viewer')
  const fmt = useFmt()
  const bandName = useBandName()
  const crosshair = useUi((s) => s.crosshair)
  const [compare, setCompare] = useState(50)
  const [aspect, setAspect] = useState(1)
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const warmed = useRef(new Set<string>())
  const checked = useRef(new Set<string>())
  const frame = frames[index]
  const length = frames.length

  useEffect(() => {
    for (let i = index + 1; i <= index + PRELOAD_AHEAD && i < frames.length; i++) {
      const src = frames[i]?.src
      if (!src || warmed.current.has(src)) continue
      warmed.current.add(src)
      const img = new window.Image()
      img.src = src
    }
  }, [frames, index])

  const pred = predicted.get(index)
  const mine = draftMarks.find((m) => m.frame === index) ?? myMarks.find((m) => m.frame === index)
  const avg = community?.find((c) => c.frame === index)

  if (!frame) return <div className={cx('w-full bg-media-bg', STAGE_BOX)} />

  return (
    <div className={cx('relative flex w-full select-none flex-col overflow-hidden bg-media-bg', STAGE_BOX)}>
      <div className="pointer-events-none flex h-8 shrink-0 items-center justify-between gap-2 px-2">
        {mode === 'mark' ? (
          <Pill className="mx-auto">{saturated ? t('markHintBright') : t('markHint')}</Pill>
        ) : mode === 'compare' && compareFrames ? (
          <>
            <Pill>
              {t('compareA')}, {fmt.shortDate(compareFrames[0].t)}
            </Pill>
            <Pill>
              {t('compareB')}, {fmt.shortDate(compareFrames[1].t)}
            </Pill>
          </>
        ) : (
          <>
            {frame.telescope || frame.release === 'wise' || frame.release === 'neowise' ? (
              <Pill className="text-note">{t('longBaseline.pill', { year: frameYear(frame), telescope: telescopeOf(frame) })}</Pill>
            ) : frame.t ? (
              <Pill>{fmt.shortDate(frame.t)}</Pill>
            ) : null}
            {(saturated || (length > 1 && !playing)) && (
              <span className="ml-auto flex items-center gap-1.5">
                {saturated && <Pill className="bg-warning text-on-warning">{t('saturatedPill')}</Pill>}
                {length > 1 && !playing && <Pill>{`${index + 1}/${length}`}</Pill>}
              </span>
            )}
          </>
        )}
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center [container-type:size]">
        <div
          className={cx('relative touch-pan-y', mode === 'mark' && 'cursor-crosshair')}
          style={{ width: `min(100cqw, calc(100cqh * ${aspect}))`, aspectRatio: String(aspect) }}
          onPointerDown={(e) => {
            swipe.current = { x: e.clientX, y: e.clientY }
          }}
          onPointerCancel={() => {
            swipe.current = null
          }}
          onPointerUp={(e) => {
            const start = swipe.current
            swipe.current = null
            if (mode === 'compare' || !start) return
            if (Math.abs(e.clientX - start.x) > 50 && Math.abs(e.clientX - start.x) > Math.abs(e.clientY - start.y) && mode === 'play') {
              onSwipe?.(e.clientX < start.x ? 1 : -1)
              return
            }
            if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 12) return
            if (mode === 'mark') {
              const r = e.currentTarget.getBoundingClientRect()
              onMark({ frame: index, x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) })
              return
            }
            onPlaying(!playing)
          }}
          role="button"
          tabIndex={0}
          aria-label={mode === 'mark' ? t('markHint') : playing ? t('pause') : t('play')}
          onKeyDown={(e) => {
            if (e.key === ' ' || e.key === 'Enter') {
              e.preventDefault()
              if (mode === 'play') onPlaying(!playing)
            }
            if (e.key === 'ArrowRight') onIndex(index + 1)
            if (e.key === 'ArrowLeft') onIndex(index - 1)
          }}
        >
          {mode === 'compare' && compareFrames ? (
            <>
              <Image src={compareFrames[1].src} alt={`${t('compareB')}: ${fmt.shortDate(compareFrames[1].t)}`} fill sizes="470px" className="pixelated object-contain" unoptimized />
              <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - compare}% 0 0)` }}>
                <Image src={compareFrames[0].src} alt={`${t('compareA')}: ${fmt.shortDate(compareFrames[0].t)}`} fill sizes="470px" className="pixelated object-contain" unoptimized />
              </div>
              <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-mark-outline" style={{ left: `${compare}%` }}>
                <span className="absolute top-3/4 -ml-[15px] flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-mark-outline text-body font-bold text-[var(--color-mark-halo)] shadow">⇆</span>
              </div>
              <label className="absolute inset-0 cursor-ew-resize">
                <span className="sr-only">{t('compareHint')}</span>
                <input type="range" min={0} max={100} value={compare} onChange={(e) => setCompare(Number(e.target.value))} className="size-full cursor-ew-resize opacity-0" />
              </label>
            </>
          ) : (
            <Image
              src={frame.src}
              alt={t('frameInfo', { band: bandName(frame.band), wavelength: formatWavelength(frame.wavelength_um, fmt.locale), date: fmt.shortDate(frame.t) })}
              fill
              sizes="470px"
              className="pixelated object-contain"
              priority
              unoptimized
              onLoad={(e) => {
                const img = e.currentTarget
                if (img.naturalWidth && img.naturalHeight) setAspect(img.naturalWidth / img.naturalHeight)
                if (checked.current.has(frame.src) || img.naturalWidth !== img.naturalHeight) return
                checked.current.add(frame.src)
                onOutside?.(frame.src, hasOutsideArea(img, 0, 0, img.naturalWidth))
              }}
            />
          )}
          {mode !== 'compare' && path && (
            <svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {path.map((m, i) => (
                <circle key={i} cx={m.x * 100} cy={m.y * 100} r="0.9" fill="var(--color-crosshair)" opacity="0.55" />
              ))}
            </svg>
          )}
          {mode === 'play' && (crosshair || path || revealPrediction) && pred && <Crosshair x={pred.x} y={pred.y} />}
          {mode === 'play' && avg && <Dot x={avg.x} y={avg.y} tone="community" />}
          {mode !== 'compare' && mine && <Dot x={mine.x} y={mine.y} tone="mine" />}
        </div>
      </div>
    </div>
  )
}
