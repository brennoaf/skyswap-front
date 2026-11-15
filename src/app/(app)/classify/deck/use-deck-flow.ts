'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { api, unwrap, type DeckCard } from '@/lib/api/client'
import { exploreQueue, isSkyCard, type SkyPlayCard } from '@/lib/explore/queue'
import type { Answer } from '@/lib/swap-verdict'
import { preloadSprite } from '../sprites'

export type PlayCard = DeckCard | SkyPlayCard
export type DeckState = { status: 'loading' | 'searching' | 'ready' | 'done' | 'error' | 'slow'; card: PlayCard | null; past?: Answer | null }

const SEARCH_WAIT_MS = 30_000
const RETRY_WAIT_MS = 1200

type Prepared = { work: Promise<DeckState>; done: DeckState | null }

function takeSharedCard(): string | null {
  const url = new URL(window.location.href)
  const id = url.searchParams.get('card')
  if (!id) return null
  url.searchParams.delete('card')
  window.history.replaceState(window.history.state, '', url)
  return id
}

let sharedTask: Promise<DeckState | null> | null = null

function sharedCard(): Promise<DeckState | null> | null {
  const id = takeSharedCard()
  if (id) {
    const task = fetchShared(id)
    sharedTask = task
    void task.finally(() => {
      if (sharedTask === task) sharedTask = null
    })
  }
  return sharedTask
}

async function fetchShared(id: string): Promise<DeckState | null> {
  const r = await api.GET('/api/classify/shared/{id}', { params: { path: { id } } }).catch(() => null)
  return r?.data ? { status: 'ready', card: r.data.card, past: r.data.answered } : null
}

async function fetchNext(not: string[]): Promise<DeckState> {
  const skip = not.length ? { not: not.join(',') } : {}
  const query = new URLSearchParams(window.location.search).has('open') ? { explore: true, open: true, ...skip } : { explore: true, ...skip }
  let r = await api
    .GET('/api/classify/next', { params: { query } })
    .then(unwrap)
    .catch(async () => {
      await new Promise((resolve) => setTimeout(resolve, RETRY_WAIT_MS))
      return unwrap(await api.GET('/api/classify/next', { params: { query } }))
    })
  if (r.sky) {
    const sky = (r.spot ? await exploreQueue.revisit(r.spot) : null) ?? exploreQueue.take()
    if (sky) return { status: 'ready', card: sky }
    r = unwrap(await api.GET('/api/classify/next', { params: { query: { explore: true, known: true, ...skip } } }))
  }
  if (r.card) return { status: 'ready', card: r.card }
  return { status: r.sky ? 'searching' : 'done', card: null }
}

function giveBack(state: DeckState | null) {
  if (state && isSkyCard(state.card)) exploreQueue.giveBack(state.card)
}

export function useDeckFlow(enabled: boolean) {
  const [state, setState] = useState<DeckState>({ status: 'loading', card: null })
  const live = useRef(true)
  const next = useRef<Prepared | null>(null)
  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
      const prepared = next.current
      next.current = null
      if (prepared) void prepared.work.then(giveBack, () => null)
    }
  }, [])

  const show = useCallback((s: DeckState) => {
    if (live.current) setState(s)
    else giveBack(s)
  }, [])

  const prepare = useCallback((not: string[]) => {
    if (next.current) return
    const entry: Prepared = { work: fetchNext(not), done: null }
    next.current = entry
    entry.work.then(
      (s) => {
        entry.done = s
        if (s.card) preloadSprite(s.card.sprite)
      },
      () => {
        if (next.current === entry) next.current = null
      },
    )
  }, [])

  const load = useCallback(
    async (not: string[] = []) => {
      const sharedLoad = sharedCard()
      const shared = sharedLoad ? await sharedLoad : null
      if (shared) {
        show(shared)
        return
      }
      const prepared = next.current
      next.current = null
      if (prepared?.done?.status === 'ready') {
        show(prepared.done)
        return
      }
      if (live.current) setState({ status: 'loading', card: null })
      try {
        const s = prepared ? await prepared.work.catch(() => fetchNext(not)) : await fetchNext(not)
        if (s.status !== 'searching') {
          show(s)
          return
        }
        show({ status: 'searching', card: null })
        const sky = await exploreQueue.wait(SEARCH_WAIT_MS)
        show(sky ? { status: 'ready', card: sky } : { status: 'slow', card: null })
      } catch {
        show({ status: 'error', card: null })
      }
    },
    [show],
  )

  useEffect(() => {
    if (enabled) void load()
  }, [enabled, load])

  return { ...state, reload: load, prepare }
}
