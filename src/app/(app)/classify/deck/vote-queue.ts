export type VoteBody = {
  card_id: string
  choice: 'moves' | 'still' | 'unsure'
  glitch?: boolean
  position?: { frame: number; x: number; y: number }
  hints?: boolean
  held_ms?: number
  think_ms?: number
  answered_at?: number
}

export type SkyRegistration = { ra: number; dec: number; fov_deg: number; band: string; size_px: number; frames: { key: string; mjd: number; wl_um: number; visit: number }[] }

export type QueuedVote = { user: string; body: VoteBody; queuedAt: number; sky?: SkyRegistration; reissued?: boolean }

export type SendFailure = { status: number | null; code: string | null }

export type FailureVerdict = 'duplicate' | 'reissue' | 'rejected' | 'retry'

export type Outcome<R> = { kind: 'saved'; result: R; reissued: boolean } | { kind: 'duplicate' } | { kind: 'rejected' } | { kind: 'retry' }

export const MAX_AGE_MS = 7 * 86_400_000
export const STORAGE_KEY = 'skyswap.votes.v1'

export function judgeFailure(failure: SendFailure, entry: Pick<QueuedVote, 'sky' | 'reissued'>): FailureVerdict {
  if (failure.status === null) return 'retry'
  if (failure.code === 'already_voted') return 'duplicate'
  if (failure.code === 'card_not_issued') return entry.sky && !entry.reissued ? 'reissue' : 'rejected'
  if (failure.status === 401 || failure.status === 408 || failure.status === 429 || failure.status >= 500) return 'retry'
  return 'rejected'
}

function isEntry(v: unknown): v is QueuedVote {
  if (!v || typeof v !== 'object') return false
  const e = v as Partial<QueuedVote>
  return typeof e.user === 'string' && typeof e.queuedAt === 'number' && !!e.body && typeof e.body.card_id === 'string' && typeof e.body.choice === 'string'
}

export function parseStored(raw: string | null, now: number): QueuedVote[] {
  if (!raw) return []
  try {
    const list: unknown = JSON.parse(raw)
    return Array.isArray(list) ? list.filter(isEntry).filter((e) => now - e.queuedAt < MAX_AGE_MS) : []
  } catch {
    return []
  }
}

export type QueueStore = { load: () => QueuedVote[]; save: (list: QueuedVote[]) => void }

export function storageStore(storage: () => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null, now: () => number = Date.now): QueueStore {
  return {
    load: () => {
      try {
        return parseStored(storage()?.getItem(STORAGE_KEY) ?? null, now())
      } catch {
        return []
      }
    },
    save: (list) => {
      try {
        if (list.length) storage()?.setItem(STORAGE_KEY, JSON.stringify(list))
        else storage()?.removeItem(STORAGE_KEY)
      } catch {
        return
      }
    },
  }
}

export type QueueDeps<R> = {
  store: QueueStore
  send: (body: VoteBody, keepalive: boolean) => Promise<R>
  register: (sky: SkyRegistration) => Promise<unknown>
  failureOf: (err: unknown) => SendFailure
}

export class VoteQueue<R> {
  private list: QueuedVote[]
  private readonly inflight = new Map<string, Promise<Outcome<R>>>()
  private tail: Promise<unknown> = Promise.resolve()
  private queued = 0

  constructor(private readonly deps: QueueDeps<R>) {
    this.list = deps.store.load()
  }

  pending(user: string): number {
    return this.list.filter((e) => e.user === user).length
  }

  waiting(user: string): number {
    return this.list.filter((e) => e.user === user && !this.inflight.has(this.keyOf(e))).length
  }

  submit(entry: QueuedVote, keepalive = false): Promise<Outcome<R>> {
    this.list = [...this.list.filter((e) => !this.same(e, entry)), entry]
    this.deps.store.save(this.list)
    return this.attempt(entry, keepalive)
  }

  async flush(user: string, keepalive = false): Promise<Outcome<R>[]> {
    return Promise.all(this.list.filter((e) => e.user === user).map((e) => this.attempt(e, keepalive)))
  }

  private keyOf(entry: QueuedVote): string {
    return `${entry.user}|${entry.body.card_id}`
  }

  private same(a: QueuedVote, b: QueuedVote): boolean {
    return a.user === b.user && a.body.card_id === b.body.card_id
  }

  private attempt(entry: QueuedVote, keepalive: boolean): Promise<Outcome<R>> {
    const key = this.keyOf(entry)
    const running = this.inflight.get(key)
    if (running) return running
    const start = () => this.run(entry, keepalive)
    const task = (this.queued ? this.tail.then(start) : start()).finally(() => {
      this.queued--
      this.inflight.delete(key)
    })
    this.queued++
    this.tail = task.catch(() => undefined)
    this.inflight.set(key, task)
    return task
  }

  private drop(entry: QueuedVote): void {
    this.list = this.list.filter((e) => !this.same(e, entry))
    this.deps.store.save(this.list)
  }

  private async run(entry: QueuedVote, keepalive: boolean): Promise<Outcome<R>> {
    let current = entry
    for (;;) {
      try {
        const result = await this.deps.send(current.body, keepalive)
        this.drop(current)
        return { kind: 'saved', result, reissued: !!current.reissued }
      } catch (err) {
        const verdict = judgeFailure(this.deps.failureOf(err), current)
        if (verdict === 'retry') return { kind: 'retry' }
        if (verdict !== 'reissue' || !current.sky) {
          this.drop(current)
          return { kind: verdict === 'duplicate' ? 'duplicate' : 'rejected' }
        }
        try {
          await this.deps.register(current.sky)
        } catch (registerErr) {
          if (judgeFailure(this.deps.failureOf(registerErr), {}) === 'retry') return { kind: 'retry' }
          this.drop(current)
          return { kind: 'rejected' }
        }
        const next = { ...current, reissued: true }
        this.list = this.list.map((e) => (this.same(e, next) ? next : e))
        this.deps.store.save(this.list)
        current = next
      }
    }
  }
}
