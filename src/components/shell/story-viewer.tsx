'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IconClose } from '@/components/icons'
import { PlayerBar } from '@/components/player/player-bar'
import { usePlayback } from '@/components/player/use-playback'
import { IconButton, ObjectAvatar, useModal } from '@/components/ui/primitives'
import { useStories } from '@/lib/api/hooks'
import { formatShortDate } from '@/lib/format'
import { useFrameGate } from '@/lib/frame-gate'
import { isControl, isTyping, plainKey } from '@/lib/keys'
import { frameYear, LONG_BASELINE_FPS, telescopeOf } from '@/lib/long-baseline'
import { usePageVisible } from '@/lib/page-visible'
import { useUi } from '@/lib/state/ui'
import { useBandName } from '@/lib/use-band'

const FPS = 8
const HOLD_MS = 250

export function StoryViewer() {
  const locale = useLocale()
  const t = useTranslations('stories')
  const start = useUi((s) => s.storyStart)
  const open = useUi((s) => s.openStory)
  const markSeen = useUi((s) => s.markStorySeen)
  const { data: stories } = useStories()
  const reduce = useReducedMotion()
  const list = useMemo(() => (stories ?? []).filter((s) => s.frames.length > 0), [stories])
  const [index, setIndex] = useState(0)
  const [held, setHeld] = useState(false)
  const downAt = useRef<number | null>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const bandName = useBandName()
  const visible = usePageVisible()

  useEffect(() => {
    if (!start) return
    const i = list.findIndex((s) => s.object.id === start)
    setIndex(Math.max(0, i))
  }, [start, list])

  const story = start ? list[index] : undefined
  const srcs = useMemo(() => story?.frames.map((f) => f.src) ?? [], [story])
  const [at, setAt] = useState(0)
  const gate = useFrameGate(srcs, at, !!story)
  const [top, setTop] = useState(true)
  const close = useCallback(() => open(null), [open])
  const go = useCallback(
    (delta: number) => {
      if (!story) return
      markSeen(story.object.id)
      const next = index + delta
      if (next < 0 || next >= list.length) return close()
      setIndex(next)
    },
    [story, index, list.length, markSeen, close],
  )

  const playback = usePlayback(story?.frames.length ?? 0, {
    baseMs: 1000 / (story?.frames[0]?.telescope && story.frames[0].telescope !== 'SPHEREx' ? LONG_BASELINE_FPS : FPS),
    autoplay: true,
    enabled: !!story,
    frozen: held || !visible || !top || gate.waiting,
    loop: false,
    onEnd: () => go(1),
  })
  const frame = playback.index
  const { setIndex: setFrame, setPlaying, stopBlink } = playback
  useEffect(() => setAt(frame), [frame])

  useEffect(() => {
    setFrame(0)
    setPlaying(true)
    stopBlink()
  }, [story?.object.id, setFrame, setPlaying, stopBlink])

  useEffect(() => {
    if (!visible) setHeld(false)
  }, [visible])

  useEffect(() => {
    if (!story || !top) return
    const onKey = (e: KeyboardEvent) => {
      if (!plainKey(e) || isTyping(e.target)) return
      if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === ' ' && !isControl(e.target)) {
        e.preventDefault()
        setPlaying((p) => !p)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [story, top, go, setPlaying])

  const current = story?.frames[Math.min(frame, (story?.frames.length ?? 1) - 1)]
  const onTop = useModal(dialog, !!story && !!current, close)
  useEffect(() => setTop(onTop), [onTop])

  return (
    <AnimatePresence>
      {story && current && (
        <motion.div
          key="story"
          ref={dialog}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={t('label', { name: story.object.name })}
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.92 }}
          transition={{ duration: 0.2 }}
          drag={reduce ? false : 'y'}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.6 }}
          onDragEnd={(_, info) => info.offset.y > 120 && close()}
          className="fixed inset-0 z-[60] mx-auto flex max-w-[var(--width-app)] flex-col bg-black text-white outline-none"
        >
          <div className="absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/70 to-transparent px-2 pb-6 pt-[max(8px,env(safe-area-inset-top))]">
            <div className="flex gap-1 px-1" aria-hidden="true">
              {list.map((s, i) => (
                <span key={s.object.id} className="h-[2px] flex-1 overflow-hidden rounded-full bg-white/35" style={{ display: Math.abs(i - index) > 6 ? 'none' : undefined }}>
                  <span className="block h-full bg-white" style={{ width: i < index ? '100%' : i > index ? '0%' : `${((frame + 1) / story.frames.length) * 100}%` }} />
                </span>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2 pl-1">
              <Link href={`/o/${story.object.id}`} onClick={close} className="flex min-w-0 items-center gap-2">
                <ObjectAvatar src={story.object.avatar} alt="" size={32} />
                <span className="truncate text-body font-semibold">{story.object.name}</span>
              </Link>
              <span className="truncate text-note text-white/70">{formatShortDate(current.t, locale)}</span>
              <span className="ml-auto flex">
                <IconButton label={t('close')} onClick={close} className="text-white">
                  <IconClose size={28} />
                </IconButton>
              </span>
            </div>
          </div>

          <div
            data-testid="story-media"
            className="relative flex flex-1 items-center justify-center"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              downAt.current = performance.now()
              setHeld(true)
            }}
            onLostPointerCapture={() => setHeld(false)}
            onPointerCancel={() => {
              downAt.current = null
              setHeld(false)
            }}
            onPointerUp={(e) => {
              const start = downAt.current
              downAt.current = null
              setHeld(false)
              if (start === null || performance.now() - start > HOLD_MS) return
              const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
              go(e.clientX - rect.left < rect.width / 3 ? -1 : 1)
            }}
          >
            <div className="relative aspect-square w-full">
              <Image src={current.src} alt={t('frameAlt', { name: story.object.name, band: bandName(current.band), date: formatShortDate(current.t, locale) })} fill sizes="470px" className="pixelated object-contain" priority onLoad={() => gate.markLoaded(current.src)} onError={() => gate.markLoaded(current.src)} />
            </div>
            <span data-testid="story-frame" className="absolute bottom-3 left-3 rounded-md bg-black/60 px-2 py-1 text-meta">
              {current.telescope && current.telescope !== 'SPHEREx' || story.frames.some((f) => f.telescope && f.telescope !== 'SPHEREx')
                ? t('yearLabel', { year: frameYear(current), telescope: telescopeOf({ telescope: current.telescope, release: '' }), n: frame + 1, total: story.frames.length })
                : t('frameLabel', { band: bandName(current.band), n: frame + 1, total: story.frames.length })}
            </span>
            <span className="absolute bottom-3 right-3 rounded-md bg-black/60 px-2 py-1 text-meta">{t('infrared')}</span>
          </div>

          <div className="px-3 pt-2">
            <PlayerBar
              reserve
              tone="media"
              playback={playback}
              seconds={story.frames.map((f) => (Date.parse(f.t) - Date.parse(story.frames[0]?.t ?? f.t)) / 1000)}
              dates={story.frames.map((f) => f.t)}
              thumb={(i) => {
                const f = playback.playing ? undefined : story.frames[i]
                return f ? <Image src={f.src} alt="" fill sizes="56px" className="pixelated object-contain" unoptimized /> : null
              }}
            />
          </div>
          <div className="flex items-center gap-2 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
            <Link href={`/o/${story.object.id}`} onClick={close} className="flex h-11 flex-1 items-center justify-center rounded-full border border-white/40 text-body font-semibold">
              {t('profile')}
            </Link>
            {story.post_id && (
              <Link href={`/p/${story.post_id}`} onClick={close} className="flex h-11 flex-1 items-center justify-center rounded-full bg-white text-body font-semibold text-black">
                {t('openPost')}
              </Link>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
