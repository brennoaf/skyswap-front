'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IconClose, IconPause, IconPlay } from '@/components/icons'
import { IconButton, ObjectAvatar } from '@/components/ui/primitives'
import { useStories } from '@/lib/api/hooks'
import { formatShortDate } from '@/lib/format'
import { useUi } from '@/lib/state/ui'

const FPS = 8

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
  const [frame, setFrame] = useState(0)
  const [paused, setPaused] = useState(false)
  const holdRef = useRef(false)

  useEffect(() => {
    if (!start) return
    const i = list.findIndex((s) => s.object.id === start)
    setIndex(Math.max(0, i))
    setFrame(0)
    setPaused(false)
  }, [start, list])

  const story = start ? list[index] : undefined
  const close = useCallback(() => open(null), [open])
  const go = useCallback(
    (delta: number) => {
      if (!story) return
      markSeen(story.object.id)
      const next = index + delta
      if (next < 0 || next >= list.length) return close()
      setIndex(next)
      setFrame(0)
    },
    [story, index, list.length, markSeen, close],
  )

  useEffect(() => {
    if (!story || paused) return
    const timer = setInterval(() => {
      setFrame((f) => {
        if (f + 1 >= story.frames.length) {
          queueMicrotask(() => go(1))
          return f
        }
        return f + 1
      })
    }, 1000 / FPS)
    return () => clearInterval(timer)
  }, [story, paused, go])

  useEffect(() => {
    if (!story) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === ' ') {
        e.preventDefault()
        setPaused((p) => !p)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [story, go, close])

  useEffect(() => {
    if (!story) return
    for (const f of story.frames.slice(frame + 1, frame + 6)) {
      const img = new window.Image()
      img.src = f.src
    }
  }, [story, frame])

  const current = story?.frames[Math.min(frame, (story?.frames.length ?? 1) - 1)]

  return (
    <AnimatePresence>
      {story && current && (
        <motion.div
          key="story"
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
          className="fixed inset-0 z-[60] mx-auto flex max-w-[var(--width-app)] flex-col bg-black text-white"
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
                <span className="truncate text-body font-semibold">{story.object.handle}</span>
              </Link>
              <span className="truncate text-note text-white/70">{formatShortDate(current.t, locale)}</span>
              <span className="ml-auto flex">
                <IconButton label={paused ? t('play') : t('pause')} onClick={() => setPaused((p) => !p)} className="text-white">
                  {paused ? <IconPlay size={26} /> : <IconPause size={26} />}
                </IconButton>
                <IconButton label={t('close')} onClick={close} className="text-white">
                  <IconClose size={28} />
                </IconButton>
              </span>
            </div>
          </div>

          <div
            className="relative flex flex-1 items-center justify-center"
            onPointerDown={() => {
              holdRef.current = false
              setTimeout(() => (holdRef.current = true), 250)
              setPaused(true)
            }}
            onPointerUp={(e) => {
              const held = holdRef.current
              setPaused(false)
              if (held) return
              const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
              go(e.clientX - rect.left < rect.width / 3 ? -1 : 1)
            }}
          >
            <div className="relative aspect-square w-full">
              <Image src={current.src} alt={t('frameAlt', { name: story.object.name, band: current.band, date: formatShortDate(current.t, locale) })} fill sizes="470px" className="pixelated object-contain" priority />
            </div>
            <span className="absolute bottom-3 left-3 rounded-md bg-black/60 px-2 py-1 text-meta">
              {t('frameLabel', { band: current.band, n: frame + 1, total: story.frames.length })}
            </span>
            <span className="absolute bottom-3 right-3 rounded-md bg-black/60 px-2 py-1 text-meta">{t('falseColour')}</span>
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
