'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { failureOf, type VoteResult } from '@/lib/api/client'
import { postVote, type VotePosition } from '@/lib/api/hooks'
import { refreshAfterVotes } from '@/lib/api/queries'
import { isSkyCard, registerSky } from '@/lib/explore/queue'
import type { Answer } from '@/lib/swap-verdict'
import type { PlayCard } from './use-deck-flow'
import { storageStore, VoteQueue, type Outcome, type QueuedVote } from './vote-queue'

export type PendingVote = { card: PlayCard; answer: Answer; spot: VotePosition | null; at: number; hints: boolean }
export type SaveState = 'idle' | 'pending' | 'saved' | 'failed' | 'lost'
export type VoteOutcome = Outcome<VoteResult>

const SAVED_MS = 1400
const LOST_MS = 5000
const REFRESH_EVERY = 10
const MAX_HELD_MS = 600_000

let queue: VoteQueue<VoteResult> | null = null

function getQueue(): VoteQueue<VoteResult> {
  queue ??= new VoteQueue<VoteResult>({
    store: storageStore(() => (typeof window === 'undefined' ? null : window.localStorage)),
    send: (body, keepalive) => postVote(body, keepalive),
    register: (sky) => registerSky(sky),
    failureOf,
  })
  return queue
}

function toEntry(user: string, p: PendingVote): QueuedVote {
  return {
    user,
    queuedAt: Date.now(),
    body: {
      card_id: p.card.id,
      choice: p.answer === 'glitch' ? 'still' : p.answer,
      ...(p.answer === 'glitch' ? { glitch: true } : {}),
      hints: p.hints,
      held_ms: Math.min(MAX_HELD_MS, Math.max(0, Math.round(performance.now() - p.at))),
      ...(p.spot ? { position: p.spot } : {}),
    },
    ...(isSkyCard(p.card) ? { sky: p.card.reg } : {}),
  }
}

export function useVoteQueue(user: string, { open, onSaved }: { open: boolean; onSaved: (result: VoteResult, late: boolean) => void }) {
  const qc = useQueryClient()
  const [save, setSave] = useState<SaveState>('idle')
  const latest = useRef(0)
  const sinceRefresh = useRef(0)
  const dirty = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedRef = useRef(onSaved)
  const openRef = useRef(open)
  useEffect(() => {
    savedRef.current = onSaved
    openRef.current = open
  }, [onSaved, open])

  const settle = useCallback(
    (state: SaveState) => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
      const left = getQueue().waiting(user)
      const next = state === 'saved' && left ? 'failed' : state
      setSave(next)
      if (next === 'saved' || next === 'lost') timer.current = setTimeout(() => setSave(getQueue().waiting(user) ? 'failed' : 'idle'), next === 'saved' ? SAVED_MS : LOST_MS)
    },
    [user],
  )

  const count = useCallback(
    (outcomes: VoteOutcome[]) => {
      const saved = outcomes.filter((o) => o.kind === 'saved').length
      if (!saved) return
      if (openRef.current) void qc.invalidateQueries({ queryKey: ['community', 'overview'] })
      sinceRefresh.current += saved
      dirty.current = true
      if (sinceRefresh.current < REFRESH_EVERY) return
      sinceRefresh.current = 0
      dirty.current = false
      refreshAfterVotes(qc)
    },
    [qc],
  )

  const flush = useCallback(
    async (keepalive = false, quiet = false) => {
      if (!getQueue().pending(user)) return
      const turn = ++latest.current
      if (!quiet) setSave('pending')
      const outcomes = await getQueue().flush(user, keepalive)
      for (const o of outcomes) if (o.kind === 'saved') savedRef.current(o.result, true)
      count(outcomes)
      if (turn !== latest.current) return
      if (outcomes.some((o) => o.kind === 'retry')) settle('failed')
      else if (outcomes.some((o) => o.kind === 'saved')) settle('saved')
      else settle(outcomes.some((o) => o.kind === 'rejected') ? 'lost' : 'idle')
    },
    [count, settle, user],
  )

  const submit = useCallback(
    async (p: PendingVote): Promise<VoteOutcome> => {
      const turn = ++latest.current
      setSave('pending')
      void getQueue()
        .flush(user)
        .then((outcomes) => {
          for (const o of outcomes) if (o.kind === 'saved') savedRef.current(o.result, true)
          count(outcomes)
        })
      const outcome = await getQueue().submit(toEntry(user, p))
      if (outcome.kind === 'saved') savedRef.current(outcome.result, outcome.reissued)
      count([outcome])
      if (outcome.kind === 'retry') settle('failed')
      else if (turn === latest.current) settle(outcome.kind === 'saved' ? 'saved' : outcome.kind === 'rejected' ? 'lost' : 'idle')
      return outcome
    },
    [count, settle, user],
  )

  useEffect(() => {
    void flush()
    const onOnline = () => void flush()
    const onVisible = () => {
      if (document.visibilityState === 'hidden') void flush(true, true)
      else void flush()
    }
    const onPageHide = () => void flush(true, true)
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pagehide', onPageHide)
      if (timer.current) clearTimeout(timer.current)
      void getQueue().flush(user, true)
      if (dirty.current) refreshAfterVotes(qc)
      dirty.current = false
    }
  }, [flush, qc, user])

  return { save, submit, retry: flush }
}
