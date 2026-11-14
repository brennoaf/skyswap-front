'use client'

import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { Crosshair } from '@/components/feed/post-media'
import { IconCrosshair, IconPause, IconPlay, IconStepBack, IconStepForward } from '@/components/icons'
import { IconButton } from '@/components/ui/primitives'
import type { Frame } from '@/lib/api/client'
import { cx, formatShortDate, formatWavelength } from '@/lib/format'
import { useUi } from '@/lib/state/ui'

export type Point = { frame: number; x: number; y: number }

const SPEEDS = [0.5, 1, 2]

export function usePlayer(length: number, enabled: boolean) {
  const speed = useUi((s) => s.speed)
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  useEffect(() => setIndex((i) => Math.min(i, Math.max(0, length - 1))), [length])
  useEffect(() => {
    if (!playing || !enabled || length < 2) return
    const timer = setInterval(() => setIndex((i) => (i + 1) % length), 1000 / (6 * speed))
    return () => clearInterval(timer)
  }, [playing, enabled, length, speed])
  return { index, setIndex, playing, setPlaying, speed }
}

export function Stage({
  frames,
  index,
  predicted,
  mode,
  myMarks,
  draftMarks,
  community,
  onMark,
  compare,
  onCompareChange,
}: {
  frames: Frame[]
  index: number
  predicted: Map<number, { x: number; y: number }>
  mode: 'play' | 'mark' | 'compare'
  myMarks: Point[]
  draftMarks: Point[]
  community: { frame: number; x: number; y: number }[] | null
  onMark: (p: Point) => void
  compare: number
  onCompareChange: (v: number) => void
}) {
  const t = useTranslations('viewer')
  const crosshair = useUi((s) => s.crosshair)
  const frame = frames[index]
  const pred = predicted.get(index)
  const mine = [...draftMarks, ...myMarks.filter((m) => !draftMarks.some((d) => d.frame === m.frame))].find((m) => m.frame === index)
  const avg = community?.find((c) => c.frame === index)
  const first = frames[0]
  const last = frames[frames.length - 1]

  useEffect(() => {
    for (const f of frames.slice(index + 1, index + 8)) {
      const img = new window.Image()
      img.src = f.src
    }
  }, [frames, index])

  if (!frame) return <div className="aspect-[4/5] w-full bg-media-bg" />

  return (
    <div className="relative flex aspect-[4/5] w-full items-center justify-center overflow-hidden bg-media-bg">
      <div
        className={cx('relative aspect-square w-full', mode === 'mark' && 'cursor-crosshair')}
        onClick={(e) => {
          if (mode !== 'mark') return
          const r = e.currentTarget.getBoundingClientRect()
          onMark({ frame: index, x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) })
        }}
        role={mode === 'mark' ? 'button' : undefined}
        aria-label={mode === 'mark' ? t('markHint') : undefined}
      >
        {mode === 'compare' && first && last ? (
          <>
            <Image src={last.src} alt={`${t('compareB')}: ${formatShortDate(last.t)}`} fill sizes="470px" className="pixelated object-contain" unoptimized />
            <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - compare}% 0 0)` }}>
              <Image src={first.src} alt={`${t('compareA')}: ${formatShortDate(first.t)}`} fill sizes="470px" className="pixelated object-contain" unoptimized />
            </div>
            <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white" style={{ left: `${compare}%` }}>
              <span className="absolute top-1/2 -ml-[15px] flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[14px] font-bold text-black shadow">⇆</span>
            </div>
            <span className="absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-[12px] text-white">
              {t('compareA')} · {formatShortDate(first.t)}
            </span>
            <span className="absolute right-2 top-2 rounded bg-black/60 px-2 py-0.5 text-[12px] text-white">
              {t('compareB')} · {formatShortDate(last.t)}
            </span>
            <label className="absolute inset-0 cursor-ew-resize">
              <span className="sr-only">{t('compareHint')}</span>
              <input type="range" min={0} max={100} value={compare} onChange={(e) => onCompareChange(Number(e.target.value))} className="size-full cursor-ew-resize opacity-0" />
            </label>
          </>
        ) : (
          <Image src={frame.src} alt={t('frameInfo', { band: frame.band, wavelength: formatWavelength(frame.wavelength_um), date: formatShortDate(frame.t), release: frame.release.toUpperCase() })} fill sizes="470px" className="pixelated object-contain" priority unoptimized />
        )}
        {mode !== 'compare' && crosshair && pred && <Crosshair x={pred.x} y={pred.y} size={mode === 'mark' ? 44 : 34} />}
        {mode !== 'compare' && avg && <span className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#ff00d7]" style={{ left: `${avg.x * 100}%`, top: `${avg.y * 100}%` }} />}
        {mode !== 'compare' && mine && <span className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-accent" style={{ left: `${mine.x * 100}%`, top: `${mine.y * 100}%` }} />}
      </div>
      <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-1 text-[12px] text-white">
        {frame.band ? `${frame.band} · ${formatWavelength(frame.wavelength_um)} · ` : ''}
        {t('frame', { n: index + 1, total: frames.length })}
      </span>
    </div>
  )
}

export function PlayerControls({ length, player, onStep }: { length: number; player: ReturnType<typeof usePlayer>; onStep?: (i: number) => void }) {
  const t = useTranslations('viewer')
  const crosshair = useUi((s) => s.crosshair)
  const setCrosshair = useUi((s) => s.setCrosshair)
  const setSpeed = useUi((s) => s.setSpeed)
  const go = (i: number) => {
    const n = (i + length) % length
    player.setIndex(n)
    onStep?.(n)
  }
  return (
    <div className="flex items-center gap-0.5 px-1 pt-1">
      <IconButton label={player.playing ? t('pause') : t('play')} onClick={() => player.setPlaying(!player.playing)} disabled={length < 2}>
        {player.playing ? <IconPause /> : <IconPlay />}
      </IconButton>
      <IconButton label={t('prev')} onClick={() => go(player.index - 1)} disabled={length < 2}>
        <IconStepBack />
      </IconButton>
      <label className="flex min-w-0 flex-1 items-center">
        <span className="sr-only">{t('frame', { n: player.index + 1, total: length })}</span>
        <input type="range" min={0} max={Math.max(0, length - 1)} value={player.index} onChange={(e) => go(Number(e.target.value))} disabled={length < 2} className="h-11 w-full accent-[var(--color-text)]" />
      </label>
      <IconButton label={t('next')} onClick={() => go(player.index + 1)} disabled={length < 2}>
        <IconStepForward />
      </IconButton>
      <button
        type="button"
        aria-label={`${t('speed')} ${player.speed}×`}
        onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(player.speed) + 1) % SPEEDS.length] ?? 1)}
        className="h-11 min-w-11 rounded-full px-1 text-[14px] font-semibold"
      >
        {player.speed}×
      </button>
      <IconButton label={t('crosshair')} title={t('crosshairHint')} aria-pressed={crosshair} onClick={() => setCrosshair(!crosshair)} className={crosshair ? 'text-warning' : 'text-icon-muted'}>
        <IconCrosshair />
      </IconButton>
    </div>
  )
}
