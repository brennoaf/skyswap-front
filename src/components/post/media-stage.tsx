'use client'

import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Crosshair } from '@/components/feed/post-media'
import { IconCrosshair } from '@/components/icons'
import { PlayerBar } from '@/components/player/player-bar'
import { usePlayback } from '@/components/player/use-playback'
import type { Frame } from '@/lib/api/client'
import { cx, formatWavelength } from '@/lib/format'
import { useFmt } from '@/lib/use-fmt'
import { frameYear, telescopeOf, TIMELAPSE_FPS } from '@/lib/long-baseline'
import { hasOutsideArea } from '@/lib/out-of-field'
import { useUi } from '@/lib/state/ui'

export type Point = { frame: number; x: number; y: number }
export type StageMode = 'play' | 'mark' | 'compare'

export function usePlayer(length: number, enabled: boolean, fps = TIMELAPSE_FPS, maxFps = Infinity) {
  return usePlayback(length, { baseMs: 1000 / fps, minMs: 1000 / maxFps, enabled })
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
  revealPrediction = false,
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
  revealPrediction?: boolean
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
  const [outside, setOutside] = useState<Record<string, boolean>>({})
  const [compare, setCompare] = useState(50)
  const [aspect, setAspect] = useState(1)
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const frame = frames[player.index]
  const length = frames.length

  useEffect(() => {
    for (const f of frames.slice(player.index + 1, player.index + 8)) {
      const img = new window.Image()
      img.src = f.src
    }
  }, [frames, player.index])

  const go = (i: number) => player.setIndex(((i % length) + length) % length)
  const seconds = frames.map((f) => (Date.parse(f.t) - Date.parse(frames[0]?.t ?? f.t)) / 1000)
  const pred = predicted.get(player.index)
  const mine = draftMarks.find((m) => m.frame === player.index) ?? myMarks.find((m) => m.frame === player.index)
  const avg = community?.find((c) => c.frame === player.index)
  const boxStyle = aspect >= 0.8 ? { width: '100%', aspectRatio: String(aspect) } : { height: '100%', aspectRatio: String(aspect) }

  if (!frame) return <div className="aspect-[4/5] w-full bg-media-bg" />

  return (
    <div>
    <div className="relative flex aspect-[4/5] w-full select-none items-center justify-center overflow-hidden bg-media-bg">
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
            if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 12) return
            const r = e.currentTarget.getBoundingClientRect()
            onMark({ frame: player.index, x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) })
            return
          }
          player.setPlaying(!player.playing)
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
            alt={t('frameInfo', { band: frame.band, wavelength: formatWavelength(frame.wavelength_um), date: fmt.shortDate(frame.t), release: frame.release.toUpperCase() })}
            fill
            sizes="470px"
            className="pixelated object-contain"
            priority
            unoptimized
            onLoad={(e) => {
              const img = e.currentTarget
              if (img.naturalWidth && img.naturalHeight) setAspect(img.naturalWidth / img.naturalHeight)
              if (!(frame.src in outside) && img.naturalWidth === img.naturalHeight) setOutside((o) => ({ ...o, [frame.src]: hasOutsideArea(img, 0, 0, img.naturalWidth) }))
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

      <div className="pointer-events-none absolute inset-x-2 top-2 flex items-start justify-between gap-2">
        {mode === 'mark' ? (
          <Pill className="mx-auto">{t('markHint')}</Pill>
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
            {(saturated || (length > 1 && !player.playing)) && (
              <span className="ml-auto flex items-center gap-1.5">
                {saturated && <Pill className="bg-warning text-on-warning">{t('saturatedPill')}</Pill>}
                {length > 1 && !player.playing && <Pill>{`${player.index + 1}/${length}`}</Pill>}
              </span>
            )}
          </>
        )}
      </div>

      {mode === 'mark' && markBar && <div className="absolute inset-x-2 bottom-1">{markBar}</div>}

    </div>
    {mode === 'play' && length > 1 && (
      <div className="px-3 pb-1 pt-2">
        <PlayerBar
          playback={player}
          seconds={seconds}
          dates={frames.map((f) => f.t)}
          outside={!!outside[frame.src]}
          thumb={(i) => {
            const f = frames[i]
            return f ? <Image src={f.src} alt="" fill sizes="56px" className="pixelated object-contain" unoptimized /> : null
          }}
          extra={
            <button type="button" aria-label={t('crosshair')} title={t('crosshairHint')} aria-pressed={crosshair} onClick={() => setCrosshair(!crosshair)} className={cx('inline-flex size-10 items-center justify-center rounded-full', crosshair ? 'text-warning' : 'text-icon-muted')}>
              <IconCrosshair size={26} />
            </button>
          }
        />
      </div>
    )}
    </div>
  )
}
