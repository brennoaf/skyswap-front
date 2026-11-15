'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { IconClose, IconMoves } from '@/components/icons'
import { BlinkScreen, ColoursScreen, CurveScreen, EndScreen, FindBlinkScreen, FindChecksScreen, FindEndScreen, screenImages, screenMs, StillScreen, type FindScreen, type StoryScreen } from '@/components/shell/story-screens'
import { IconButton, ObjectAvatar, useModal } from '@/components/ui/primitives'
import { api, unwrap } from '@/lib/api/client'
import { useStories } from '@/lib/api/hooks'
import { isControl, isTyping, plainKey } from '@/lib/keys'
import { usePageVisible } from '@/lib/page-visible'
import { FINDS_STORY, storyFresh, useUi } from '@/lib/state/ui'
import { cx } from '@/lib/format'

const HOLD_MS = 220
const MOVE_PX = 12
const CLOSE_PX = 90
const SWITCH_PX = 60
const MEDIA_WAIT_MS = 1500

type Entry = {
  id: string
  name: string
  sub: string
  avatar: string | null
  lastSeen: string | null
  screens: (StoryScreen | FindScreen)[]
  fresh: boolean
}

const loaded = new Set<string>()

function useScreenReady(srcs: string[], next: string[], key: string) {
  const [ready, setReady] = useState<string | null>(null)
  useEffect(() => {
    const all = srcs.filter((s) => !loaded.has(s))
    if (!all.length) {
      setReady(key)
      return
    }
    let left = all.length
    const imgs = all.map((src) => {
      const img = new window.Image()
      const done = () => {
        loaded.add(src)
        left -= 1
        if (!left) setReady(key)
      }
      img.onload = done
      img.onerror = done
      img.src = src
      return img
    })
    const timer = setTimeout(() => setReady(key), MEDIA_WAIT_MS)
    return () => {
      clearTimeout(timer)
      for (const img of imgs) {
        img.onload = null
        img.onerror = null
      }
    }
  }, [srcs, key])
  useEffect(() => {
    if (ready !== key) return
    const imgs = next.filter((s) => !loaded.has(s)).map((src) => {
      const img = new window.Image()
      img.onload = () => loaded.add(src)
      img.src = src
      return img
    })
    return () => {
      for (const img of imgs) if (!img.complete) img.src = ''
    }
  }, [next, ready, key])
  return ready === key
}

export function StoryViewer() {
  const t = useTranslations('stories')
  const tk = useTranslations('post.kinds')
  const start = useUi((s) => s.storyStart)
  const open = useUi((s) => s.openStory)
  const seenAt = useUi((s) => s.storySeen)
  const markSeen = useUi((s) => s.markStorySeen)
  const { data } = useStories()
  const visible = usePageVisible()
  const dialog = useRef<HTMLDivElement>(null)
  const seenFinds = useUi((s) => s.seenFinds)
  const markFind = useUi((s) => s.markFindSeen)
  const [findId, setFindId] = useState<string | null>(null)
  useEffect(() => {
    if (start !== FINDS_STORY) {
      if (!start) setFindId(null)
      return
    }
    setFindId((id) => id ?? (data?.finds ?? []).find((f) => !seenFinds.includes(f)) ?? null)
  }, [start, data, seenFinds])
  const found = useQuery({
    queryKey: ['story-finding', findId],
    enabled: !!findId,
    staleTime: 300_000,
    queryFn: async () => unwrap(await api.GET('/api/community/findings/{id}', { params: { path: { id: findId as string } } })),
  })
  const finding = found.data ?? null

  const [queue, setQueue] = useState<Entry[]>([])
  const [at, setAt] = useState({ obj: 0, screen: 0 })
  const [elapsed, setElapsed] = useState(0)
  const [held, setHeld] = useState(false)
  const [paused, setPaused] = useState(false)
  const [drag, setDrag] = useState(0)

  const entries = useMemo<Entry[]>(() => {
    const objects = (data?.stories ?? []).map((s) => ({
      id: s.object.id,
      name: s.object.name,
      sub: tk(s.object.kind),
      avatar: s.object.avatar,
      lastSeen: s.object.last_seen,
      screens: s.screens,
      fresh: storyFresh(seenAt, s.object.id, s.object.last_seen),
    }))
    const found: Entry[] = finding
      ? [{ id: FINDS_STORY, name: t('find.name'), sub: t('find.sub'), avatar: null, lastSeen: null, screens: [{ kind: 'find-blink', finding }, { kind: 'find-checks', finding }, { kind: 'find-end', finding }], fresh: true }]
      : []
    return [...found, ...objects.filter((o) => o.fresh), ...objects.filter((o) => !o.fresh)]
  }, [data, finding, seenAt, t, tk])

  useEffect(() => {
    if (!start) {
      setQueue([])
      return
    }
    if (queue.length) return
    if (start === FINDS_STORY && !finding) return
    const i = entries.findIndex((e) => e.id === start)
    if (i < 0) return
    setQueue(entries)
    setAt({ obj: i, screen: 0 })
  }, [start, entries, queue.length, finding])

  const entry = queue[at.obj]
  const screen = entry?.screens[at.screen]
  const close = useCallback(() => open(null), [open])

  useEffect(() => {
    if (!entry) return
    if (entry.id === FINDS_STORY && finding) markFind(finding.id)
    else if (entry.lastSeen) markSeen(entry.id, entry.lastSeen)
  }, [entry, finding, markSeen, markFind])

  const goObject = useCallback(
    (delta: number) => {
      const next = at.obj + delta
      const target = queue[next]
      if (!target || (delta > 0 && entry?.fresh && !target.fresh)) return close()
      setAt({ obj: next, screen: 0 })
    },
    [at.obj, queue, entry, close],
  )
  const goScreen = useCallback(
    (delta: number) => {
      if (!entry) return
      const next = at.screen + delta
      if (next >= entry.screens.length) return goObject(1)
      if (next < 0) return at.obj > 0 ? goObject(-1) : setElapsed(0)
      setAt({ obj: at.obj, screen: next })
    },
    [entry, at, goObject],
  )

  const key = `${entry?.id}:${at.screen}`
  const srcs = useMemo(() => (screen ? screenImages(screen) : []), [screen])
  const following = entry?.screens[at.screen + 1] ?? queue[at.obj + 1]?.screens[0]
  const nextSrcs = useMemo(() => (following ? screenImages(following) : []), [following])
  const ready = useScreenReady(srcs, nextSrcs, key)
  const onTop = useModal(dialog, !!entry, close)
  const running = !!screen && ready && visible && onTop && !held && !paused

  useEffect(() => {
    setElapsed(0)
  }, [key])

  useEffect(() => {
    if (!visible) setHeld(false)
  }, [visible])

  const total = screen ? screenMs(screen) : 0
  useEffect(() => {
    if (!running) return
    let last = performance.now()
    let raf = 0
    const tick = (now: number) => {
      setElapsed((e) => e + (now - last))
      last = now
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [running, key])

  useEffect(() => {
    if (running && total && elapsed >= total) goScreen(1)
  }, [elapsed, total, running, goScreen])

  useEffect(() => {
    if (!entry || !onTop) return
    const onKey = (e: KeyboardEvent) => {
      if (!plainKey(e) || isTyping(e.target)) return
      const act = { ArrowRight: () => goScreen(1), ArrowLeft: () => goScreen(-1), ArrowDown: () => goObject(1), ArrowUp: () => goObject(-1) }[e.key]
      if (act) {
        e.preventDefault()
        act()
      } else if (e.key === ' ' && !isControl(e.target)) {
        e.preventDefault()
        setPaused((p) => !p)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [entry, onTop, goScreen, goObject])

  useEffect(() => {
    setPaused(false)
  }, [entry?.id])

  const gesture = useRef<{ x: number; y: number; id: number; held: boolean; timer: ReturnType<typeof setTimeout> | null } | null>(null)
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest('a, button') || e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const g = { x: e.clientX, y: e.clientY, id: e.pointerId, held: false, timer: null as ReturnType<typeof setTimeout> | null }
    g.timer = setTimeout(() => {
      g.held = true
      setHeld(true)
    }, HOLD_MS)
    gesture.current = g
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current
    if (!g || g.id !== e.pointerId) return
    const dx = e.clientX - g.x
    const dy = e.clientY - g.y
    if (Math.hypot(dx, dy) > MOVE_PX && g.timer) {
      clearTimeout(g.timer)
      g.timer = null
      if (g.held) {
        g.held = false
        setHeld(false)
      }
    }
    setDrag(dy > 0 && dy > Math.abs(dx) ? dy : 0)
  }
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current
    gesture.current = null
    setDrag(0)
    if (!g || g.id !== e.pointerId) return
    if (g.timer) clearTimeout(g.timer)
    if (g.held) {
      setHeld(false)
      return
    }
    const dx = e.clientX - g.x
    const dy = e.clientY - g.y
    if (dy > CLOSE_PX && dy > Math.abs(dx)) return close()
    if (Math.abs(dx) > SWITCH_PX && Math.abs(dx) > Math.abs(dy)) return goObject(dx < 0 ? 1 : -1)
    if (Math.abs(dx) < MOVE_PX && Math.abs(dy) < MOVE_PX) {
      const r = e.currentTarget.getBoundingClientRect()
      goScreen(e.clientX - r.left < r.width / 3 ? -1 : 1)
    }
  }
  const onPointerCancel = () => {
    const g = gesture.current
    gesture.current = null
    if (g?.timer) clearTimeout(g.timer)
    setHeld(false)
    setDrag(0)
  }

  if (!entry || !screen) return null
  const nextName = queue[at.obj + 1] && (!entry.fresh || queue[at.obj + 1]?.fresh) ? (queue[at.obj + 1]?.name ?? null) : null
  const avatar = (size: number) => (entry.avatar ? <ObjectAvatar src={entry.avatar} alt="" size={size} /> : <span aria-hidden="true" className="inline-grid shrink-0 place-items-center rounded-full bg-media-bg text-accent" style={{ width: size, height: size }}><IconMoves size={Math.round(size * 0.55)} /></span>)
  const progress = total ? Math.min(1, elapsed / total) : 0

  return (
    <div
      ref={dialog}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={t('label', { name: entry.name })}
      data-held={held || undefined}
      data-testid="story"
      className="fixed inset-0 z-[60] mx-auto flex max-w-[var(--width-app)] touch-none select-none flex-col bg-black text-on-media outline-none"
      style={{ transform: drag ? `translateY(${drag}px)` : undefined }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onDragStart={(e) => e.preventDefault()}
    >
      <div className="story-chrome flex gap-1 px-2.5 pt-[max(10px,env(safe-area-inset-top))]" aria-hidden="true">
        {entry.screens.map((_, i) => (
          <span key={i} className="h-[3px] flex-1 overflow-hidden rounded-full bg-on-media/30">
            <span data-testid={i === at.screen ? 'story-progress' : undefined} className="block h-full bg-on-media" style={{ width: `${(i < at.screen ? 1 : i > at.screen ? 0 : progress) * 100}%` }} />
          </span>
        ))}
      </div>
      <div className="story-chrome flex items-center gap-2.5 py-2 pl-3 pr-1.5">
        {entry.avatar ? (
          <Link href={`/o/${entry.id}`} className="flex min-w-0 flex-1 items-center gap-2.5">
            {avatar(32)}
            <span className="min-w-0 leading-tight">
              <b className="block truncate text-ui">{entry.name}</b>
              <small className="block truncate text-note text-on-media-muted">{entry.sub}</small>
            </span>
          </Link>
        ) : (
          <span className="flex min-w-0 flex-1 items-center gap-2.5">
            {avatar(32)}
            <span className="min-w-0 leading-tight">
              <b className="block truncate text-ui">{entry.name}</b>
              <small className="block truncate text-note text-on-media-muted">{entry.sub}</small>
            </span>
          </span>
        )}
        <IconButton label={t('close')} onClick={close} className="text-on-media">
          <IconClose size={28} />
        </IconButton>
      </div>
      <div className={cx('relative flex min-h-0 flex-1 flex-col', screen.kind === 'end' || screen.kind === 'find-end' ? '' : 'justify-center')} data-testid="story-screen" data-kind={screen.kind}>
        {screen.kind === 'blink' && <BlinkScreen screen={screen} name={entry.name} elapsed={elapsed} />}
        {screen.kind === 'still' && <StillScreen screen={screen} name={entry.name} />}
        {screen.kind === 'curve' && <CurveScreen screen={screen} elapsed={elapsed} />}
        {screen.kind === 'colours' && <ColoursScreen screen={screen} name={entry.name} elapsed={elapsed} />}
        {screen.kind === 'end' && <EndScreen screen={screen} id={entry.id} name={entry.name} avatar={avatar(96)} next={nextName} />}
        {screen.kind === 'find-blink' && <FindBlinkScreen finding={screen.finding} elapsed={elapsed} />}
        {screen.kind === 'find-checks' && <FindChecksScreen finding={screen.finding} />}
        {screen.kind === 'find-end' && <FindEndScreen next={nextName} />}
      </div>
    </div>
  )
}
