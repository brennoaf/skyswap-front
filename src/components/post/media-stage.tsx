'use client'

import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Crosshair } from '@/components/feed/post-media'
import { MediaPill, MediaPills, PillPair, pillDate } from '@/components/player/sequence'
import { MarkPad, MarkRing } from '@/components/ui/mark-pad'
import { usePlayback } from '@/components/player/use-playback'
import type { Frame } from '@/lib/api/client'
import { cx, formatWavelength } from '@/lib/format'
import { useFmt } from '@/lib/use-fmt'
import { telescopeOf, TIMELAPSE_FPS } from '@/lib/long-baseline'
import { hasOutsideArea } from '@/lib/out-of-field'
import { useUi } from '@/lib/state/ui'
import { useBandName } from '@/lib/use-band'

export type Point = { frame: number; x: number; y: number }
export type StageMode = 'play' | 'mark' | 'compare' | 'path'
export type Trail = { mine: { x: number; y: number }[]; predicted: { x: number; y: number }[] }

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

function TrailLines({ trail }: { trail: Trail }) {
  const line = (pts: { x: number; y: number }[]) => pts.map((p) => `${p.x * 100},${p.y * 100}`).join(' ')
  return (
    <svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" data-testid="mark-trail">
      {trail.predicted.length > 1 && <polyline points={line(trail.predicted)} fill="none" stroke="var(--color-crosshair)" strokeWidth="1.5" strokeDasharray="3 2.5" vectorEffect="non-scaling-stroke" data-testid="trail-predicted" />}
      {trail.mine.length > 1 && (
        <>
          <polyline points={line(trail.mine)} fill="none" stroke="var(--color-mark-halo)" strokeWidth="4" opacity="0.5" vectorEffect="non-scaling-stroke" />
          <polyline points={line(trail.mine)} fill="none" stroke="var(--color-mark-mine)" strokeWidth="2" vectorEffect="non-scaling-stroke" data-testid="trail-mine" />
        </>
      )}
    </svg>
  )
}

export function MediaStage({
  frames,
  index,
  playing,
  onPlaying,
  onIndex,
  predicted,
  mode,
  myMarks,
  flash = null,
  banner = null,
  markLabel = '',
  trail = null,
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
  mode: StageMode
  myMarks: Point[]
  flash?: Point | null
  banner?: ReactNode
  markLabel?: string
  trail?: Trail | null
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
  const mine = myMarks.find((m) => m.frame === index)
  const marking = mode === 'mark'
  const after = mode === 'play' || mode === 'path'
  const avg = community?.find((c) => c.frame === index)

  if (!frame) return <div className={cx('w-full bg-media-bg', STAGE_BOX)} />

  return (
    <div className={cx('relative flex w-full select-none flex-col overflow-hidden bg-media-bg', STAGE_BOX)} style={mode === 'compare' ? undefined : { aspectRatio: String(aspect) }} data-testid="post-stage">
      <div className="flex min-h-0 flex-1 items-center justify-center [container-type:size]">
        <div
          className={cx('relative', !marking && 'touch-pan-y')}
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
            if (marking) return
            onPlaying(!playing)
          }}
          role={marking ? undefined : 'button'}
          tabIndex={marking ? undefined : 0}
          aria-label={marking ? undefined : playing ? t('pause') : t('play')}
          onKeyDown={(e) => {
            if (marking) return
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
          {mode === 'path' && trail && <TrailLines trail={trail} />}
          {((mode === 'play' && (crosshair || path)) || mode === 'path') && pred && <Crosshair x={pred.x} y={pred.y} />}
          {after && avg && <Dot x={avg.x} y={avg.y} tone="community" />}
          {after && mine && <Dot x={mine.x} y={mine.y} tone="mine" />}
          {marking && flash && flash.frame === index && <MarkRing u={flash.x} v={flash.y} />}
          {marking && banner}
          {!marking && (
            <MediaPills
              left={
                mode === 'compare' && compareFrames ? (
                  <MediaPill>{`${t('compareA')}, ${fmt.shortDate(compareFrames[0].t)}`}</MediaPill>
                ) : frame.t ? (
                  <MediaPill testId="post-date-pill">
                    <PillPair a={pillDate(Date.parse(frame.t), fmt.locale)} b={frame.telescope || frame.release === 'wise' || frame.release === 'neowise' ? telescopeOf(frame) : frame.band} />
                  </MediaPill>
                ) : null
              }
              right={
                mode === 'compare' && compareFrames ? (
                  <MediaPill>{`${t('compareB')}, ${fmt.shortDate(compareFrames[1].t)}`}</MediaPill>
                ) : (
                  <>
                    {saturated && <Pill className="bg-warning text-on-warning">{t('saturatedPill')}</Pill>}
                    {length > 1 && <MediaPill testId="post-counter">{`${index + 1}/${length}`}</MediaPill>}
                  </>
                )
              }
            />
          )}
          {marking && <MarkPad key={index} source={{ src: frame.src }} label={markLabel} onPick={(u, v) => onMark({ frame: index, x: u, y: v })} />}
        </div>
      </div>
    </div>
  )
}
