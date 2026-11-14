'use client'

import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Crosshair } from '@/components/feed/post-media'
import { IconCrosshair, IconPause, IconPlay, IconStepBack, IconStepForward } from '@/components/icons'
import type { Frame } from '@/lib/api/client'
import { cx, formatWavelength } from '@/lib/format'
import { useFmt } from '@/lib/use-fmt'
import { frameYear, telescopeOf, TIMELAPSE_FPS } from '@/lib/long-baseline'
import { useUi } from '@/lib/state/ui'

export type Point = { frame: number; x: number; y: number }
export type StageMode = 'play' | 'mark' | 'compare'

const SPEEDS = [0.5, 1, 2]

export function usePlayer(length: number, enabled: boolean, fps = TIMELAPSE_FPS, maxFps = Infinity) {
  const speed = useUi((s) => s.speed)
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  useEffect(() => setIndex((i) => Math.min(i, Math.max(0, length - 1))), [length])
  useEffect(() => {
    if (!playing || !enabled || length < 2) return
    const timer = setInterval(() => setIndex((i) => (i + 1) % length), 1000 / Math.min(fps * speed, maxFps))
    return () => clearInterval(timer)
  }, [playing, enabled, length, speed, fps, maxFps])
  return { index, setIndex, playing, setPlaying, speed }
}

export type Player = ReturnType<typeof usePlayer>

function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('pointer-events-none rounded-full bg-media-scrim px-2 py-0.5 text-meta font-medium text-on-media backdrop-blur-sm', className)}>{children}</span>
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
  player,
  predicted,
  mode,
  myMarks,
  draftMarks,
  community,
  onMark,
  compareFrames,
  markBar,
  onSwipe,
  saturated,
  path,
}: {
  frames: Frame[]
  player: Player
  predicted: Map<number, { x: number; y: number }>
  mode: StageMode
  myMarks: Point[]
  draftMarks: Point[]
  community: { frame: number; x: number; y: number }[] | null
  onMark: (p: Point) => void
  compareFrames: [Frame, Frame] | null
  markBar?: ReactNode
  onSwipe?: (dir: 1 | -1) => void
  saturated?: boolean
  path?: { x: number; y: number }[] | null
}) {
  const t = useTranslations('viewer')
  const fmt = useFmt()
  const crosshair = useUi((s) => s.crosshair)
  const setCrosshair = useUi((s) => s.setCrosshair)
  const setSpeed = useUi((s) => s.setSpeed)
  const [controls, setControls] = useState(true)
  const [compare, setCompare] = useState(50)
  const [aspect, setAspect] = useState(1)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const frame = frames[player.index]
  const length = frames.length

  const poke = () => {
    setControls(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setControls(false), 2500)
  }

  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
  }, [])

  useEffect(() => {
    for (const f of frames.slice(player.index + 1, player.index + 8)) {
      const img = new window.Image()
      img.src = f.src
    }
  }, [frames, player.index])

  const go = (i: number) => player.setIndex(((i % length) + length) % length)
  const visible = controls || !player.playing
  const pred = predicted.get(player.index)
  const mine = draftMarks.find((m) => m.frame === player.index) ?? myMarks.find((m) => m.frame === player.index)
  const avg = community?.find((c) => c.frame === player.index)
  const boxStyle = aspect >= 0.8 ? { width: '100%', aspectRatio: String(aspect) } : { height: '100%', aspectRatio: String(aspect) }

  if (!frame) return <div className="aspect-[4/5] w-full bg-media-bg" />

  return (
    <div
      className="relative flex aspect-[4/5] w-full select-none items-center justify-center overflow-hidden bg-media-bg"
      onPointerMove={(e) => e.pointerType === 'mouse' && mode === 'play' && poke()}
    >
      <div
        className={cx('relative', mode === 'mark' && 'cursor-crosshair')}
        style={boxStyle}
        onPointerDown={(e) => {
          swipe.current = { x: e.clientX, y: e.clientY }
        }}
        onPointerUp={(e) => {
          const start = swipe.current
          swipe.current = null
          if (mode === 'compare') return
          if (start && Math.abs(e.clientX - start.x) > 50 && Math.abs(e.clientX - start.x) > Math.abs(e.clientY - start.y) && mode === 'play') {
            onSwipe?.(e.clientX < start.x ? 1 : -1)
            return
          }
          if (mode === 'mark') {
            const r = e.currentTarget.getBoundingClientRect()
            onMark({ frame: player.index, x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) })
            return
          }
          player.setPlaying(!player.playing)
          poke()
        }}
        role="button"
        tabIndex={0}
        aria-label={mode === 'mark' ? t('markHint') : player.playing ? t('pause') : t('play')}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault()
            if (mode === 'play') player.setPlaying(!player.playing)
          }
          if (e.key === 'ArrowRight') go(player.index + 1)
          if (e.key === 'ArrowLeft') go(player.index - 1)
        }}
      >
        {mode === 'compare' && compareFrames ? (
          <>
            <Image src={compareFrames[1].src} alt={`${t('compareB')}: ${fmt.shortDate(compareFrames[1].t)}`} fill sizes="470px" className="pixelated object-contain" unoptimized />
            <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - compare}% 0 0)` }}>
              <Image src={compareFrames[0].src} alt={`${t('compareA')}: ${fmt.shortDate(compareFrames[0].t)}`} fill sizes="470px" className="pixelated object-contain" unoptimized />
            </div>
            <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-mark-outline" style={{ left: `${compare}%` }}>
              <span className="absolute top-1/2 -ml-[15px] flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-mark-outline text-body font-bold text-mark-halo shadow">⇆</span>
            </div>
            <label className="absolute inset-0 cursor-ew-resize">
              <span className="sr-only">{t('compareHint')}</span>
              <input type="range" min={0} max={100} value={compare} onChange={(e) => setCompare(Number(e.target.value))} className="size-full cursor-ew-resize opacity-0" />
            </label>
          </>
        ) : (
          <Image
            src={frame.src}
            alt={t('frameInfo', { band: frame.band, wavelength: formatWavelength(frame.wavelength_um), date: fmt.shortDate(frame.t), release: frame.release.toUpperCase() })}
            fill
            sizes="470px"
            className="pixelated object-contain"
            priority
            unoptimized
            onLoad={(e) => {
              const img = e.currentTarget
              if (img.naturalWidth && img.naturalHeight) setAspect(img.naturalWidth / img.naturalHeight)
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
        {mode !== 'compare' && (crosshair || path) && pred && <Crosshair x={pred.x} y={pred.y} size={mode === 'mark' ? 44 : 34} />}
        {mode !== 'compare' && avg && <Dot x={avg.x} y={avg.y} tone="community" />}
        {mode !== 'compare' && mine && <Dot x={mine.x} y={mine.y} tone="mine" />}
      </div>

      <div className="pointer-events-none absolute inset-x-2 top-2 flex items-start justify-between gap-2">
        {mode === 'compare' && compareFrames ? (
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
            ) : (
              <Pill>{frame.band ? `${frame.band}, ${formatWavelength(frame.wavelength_um)}` : t('falseColourShort')}</Pill>
            )}
            {length > 1 && <Pill>{`${player.index + 1}/${length}`}</Pill>}
          </>
        )}
      </div>

      {mode === 'mark' && markBar && <div className="absolute inset-x-2 top-10">{markBar}</div>}

      {mode !== 'compare' && (
        <div className={cx('pointer-events-none absolute inset-x-0 bottom-0 transition-opacity duration-300', visible || mode === 'mark' ? 'opacity-100' : 'opacity-0')}>
          <div className="flex items-end justify-between px-2 pb-1">
            <Pill>{t('falseColourShort')}</Pill>
            {saturated && <Pill className="bg-warning text-on-warning">{t('saturatedPill')}</Pill>}
          </div>
          {length > 1 && mode === 'play' && (
            <div className="pointer-events-auto flex items-center gap-0.5 bg-gradient-to-t from-media-scrim to-transparent px-1 pb-1 pt-4 text-on-media">
              <button type="button" aria-label={player.playing ? t('pause') : t('play')} onClick={() => player.setPlaying(!player.playing)} className="inline-flex size-11 items-center justify-center">
                {player.playing ? <IconPause size={26} /> : <IconPlay size={26} />}
              </button>
              <button type="button" aria-label={t('prev')} onClick={() => { go(player.index - 1); poke() }} className="inline-flex size-11 items-center justify-center">
                <IconStepBack size={26} />
              </button>
              <label className="flex min-w-0 flex-1 items-center">
                <span className="sr-only">{t('frame', { n: player.index + 1, total: length })}</span>
                <input
                  type="range"
                  min={0}
                  max={length - 1}
                  value={player.index}
                  onChange={(e) => {
                    go(Number(e.target.value))
                    poke()
                  }}
                  className="h-11 w-full accent-[var(--color-on-media)]"
                />
              </label>
              <button type="button" aria-label={t('next')} onClick={() => { go(player.index + 1); poke() }} className="inline-flex size-11 items-center justify-center">
                <IconStepForward size={26} />
              </button>
              <button
                type="button"
                aria-label={`${t('speed')} ${player.speed}x`}
                onClick={() => {
                  setSpeed(SPEEDS[(SPEEDS.indexOf(player.speed) + 1) % SPEEDS.length] ?? 1)
                  poke()
                }}
                className="h-11 min-w-11 px-1 text-body font-semibold"
              >
                {player.speed}x
              </button>
              <button
                type="button"
                aria-label={t('crosshair')}
                title={t('crosshairHint')}
                aria-pressed={crosshair}
                onClick={() => {
                  setCrosshair(!crosshair)
                  poke()
                }}
                className={cx('inline-flex size-11 items-center justify-center', crosshair ? 'text-crosshair' : 'text-on-media-muted')}
              >
                <IconCrosshair size={26} />
              </button>
            </div>
          )}
        </div>
      )}

      {mode === 'play' && !player.playing && length > 1 && (
        <span className="pointer-events-none absolute left-1/2 top-1/2 flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-media-scrim text-on-media">
          <IconPlay size={40} />
        </span>
      )}
    </div>
  )
}
