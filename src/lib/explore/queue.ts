import type { QueryClient } from '@tanstack/react-query'
import { api, unwrap, type DeckCard, type SkySpot } from '@/lib/api/client'
import { exploreCellsQuery, exploreMapQuery } from '@/lib/api/queries'
import { ang2pixNest, loadCells, pickCell, type SkyCell } from '@/lib/sky'
import { currentConnection, isMetered, prefetchCount } from './budget'
import { runFlashlight, type CardHint } from './flashlight'
import { randomSpot, type Spot } from './sampler'
import { INDEX_BASE, warmSpot } from './lookup'
import { buildSkyCard, buildSpotCard, SKY_FOV_DEG, type BuildGuard, type SkyCardDraft } from './sky-card'

const MAX_PARALLEL = 2
const TRIES_PER_CARD = 6
const REVISIT_TIMEOUT_MS = 25_000
const THUMB_PX = 96
const THUMB_QUALITY = 0.7

export type SkyRegistration = { ra: number; dec: number; fov_deg: number; band: string; size_px: number; frames: { key: string; mjd: number; wl_um: number; visit: number }[] }
export type SkyPlayCard = DeckCard & { kind: 'sky'; ra: number; dec: number; band: string; hints: CardHint[]; reg: SkyRegistration; owner: string }

type Sky = { cells: SkyCell[] | null; indexed: Set<number>; bytes: Map<number, number>; looks: Record<number, number> }

let client: QueryClient | null = null
let owner = ''
let target = prefetchCount(null)
let light = false
let skyPromise: Promise<Sky> | null = null
let summary: Promise<SkyCell[] | null> | null = null
const ready: SkyPlayCard[] = []
let building = 0
let failures = 0
let active = false
const waiters: ((c: SkyPlayCard | null) => void)[] = []
let upcoming: Spot | null = null

function loadSummary(): Promise<SkyCell[] | null> {
  summary ??= fetch(`${INDEX_BASE}cells.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((json) => (json ? loadCells(json) : null))
    .catch(() => {
      summary = null
      return null
    })
  return summary
}

function loadSky(): Promise<Sky> {
  const qc = client
  if (!qc) return Promise.reject(new Error('queue not started'))
  if (skyPromise) return skyPromise
  const task = (async () => {
    const [cells, indexed, map] = await Promise.all([loadSummary(), qc.fetchQuery(exploreCellsQuery), qc.fetchQuery(exploreMapQuery).catch(() => null)])
    return { cells, indexed: new Set(indexed.cells), bytes: new Map(indexed.cells.map((c, i) => [c, indexed.bytes[i] ?? 0])), looks: Object.fromEntries((map?.cells ?? []).map((c) => [c.cell, c.looks])) }
  })()
  skyPromise = task
  task.catch(() => {
    if (skyPromise === task) skyPromise = null
  })
  return task
}

function nextSpot(s: Sky): Spot | null {
  if (s.cells?.length) {
    const p = pickCell(s.cells, { looks: s.looks, nowMjd: Date.now() / 86400000 + 40587 })
    if (p) {
      s.looks[p.cell] = (s.looks[p.cell] ?? 0) + 1
      return { ra: Math.round(p.ra * 1e4) / 1e4, dec: Math.round(p.dec * 1e4) / 1e4 }
    }
  }
  return randomSpot(s.indexed)
}

async function toBlobUrl(pixels: SkyCardDraft['pixels']): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = pixels.width
  canvas.height = pixels.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no canvas')
  ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height), 0, 0)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('no blob')
  return URL.createObjectURL(blob)
}

function toThumb(pixels: SkyCardDraft['pixels']): string | undefined {
  const tile = Math.round(pixels.height / 2)
  const source = document.createElement('canvas')
  source.width = pixels.width
  source.height = pixels.height
  const thumb = document.createElement('canvas')
  thumb.width = THUMB_PX
  thumb.height = THUMB_PX
  const from = source.getContext('2d')
  const to = thumb.getContext('2d')
  if (!from || !to) return undefined
  from.putImageData(new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height), 0, 0)
  to.drawImage(source, 0, 0, tile, tile, 0, 0, THUMB_PX, THUMB_PX)
  return thumb.toDataURL('image/jpeg', THUMB_QUALITY)
}

export async function registerSky(reg: SkyRegistration, thumb?: string) {
  return unwrap(await api.POST('/api/classify/sky', { body: thumb ? { ...reg, thumb } : reg }))
}

async function finish(draft: SkyCardDraft, reg: SkyRegistration, thumb: string | undefined, user: string): Promise<SkyPlayCard> {
  const [done, hints] = await Promise.all([
    registerSky(reg, thumb),
    runFlashlight(
      draft.exposures.map((e) => e.img),
      draft.exposures.map((e) => e.variance),
      draft.exposures.map((e) => e.visit),
      draft.exposures.map((e) => e.mjd),
      draft.size_px,
    ),
  ])
  const sprite = await toBlobUrl(draft.pixels)
  const t0 = new Date(((draft.exposures[0]?.mjd ?? 40587) - 40587) * 86400000).toISOString()
  return { id: done.id, sprite, n_frames: done.offsets_s.length, offsets_s: done.offsets_s, t0, kind: 'sky', ra: done.ra, dec: done.dec, band: draft.band, hints, reg, owner: user }
}

const keepBuilding: BuildGuard = () => active

async function buildOne(): Promise<SkyPlayCard | null> {
  const s = await loadSky()
  for (let i = 0; i < TRIES_PER_CARD && active; i++) {
    const spot = upcoming ?? nextSpot(s)
    upcoming = null
    if (!spot) return null
    try {
      const draft = await buildSkyCard(spot, s.bytes.get(ang2pixNest(5, spot.ra, spot.dec)) ?? null, keepBuilding)
      if (!active) return null
      if (!draft) {
        failures++
        continue
      }
      const reg = { ra: draft.ra, dec: draft.dec, fov_deg: SKY_FOV_DEG, band: draft.band, size_px: draft.size_px, frames: draft.frames }
      const card = await finish(draft, reg, toThumb(draft.pixels), owner)
      failures = 0
      return card
    } catch {
      failures++
    }
  }
  return null
}

function warmNext() {
  if (upcoming || !active || light) return
  void loadSky()
    .then((s) => {
      if (upcoming || !active) return
      upcoming = nextSpot(s)
      if (upcoming) warmSpot(upcoming.ra, upcoming.dec, s.bytes.get(ang2pixNest(5, upcoming.ra, upcoming.dec)) ?? null)
    })
    .catch(() => null)
}

function hand(card: SkyPlayCard) {
  if (card.owner !== owner) {
    exploreQueue.release(card)
    return
  }
  const w = waiters.shift()
  if (w) w(card)
  else ready.push(card)
}

function pump() {
  while (active && ready.length + building < target && building < Math.min(MAX_PARALLEL, target)) {
    building++
    void buildOne()
      .then((card) => {
        if (card) hand(card)
      })
      .catch(() => {
        failures++
      })
      .finally(() => {
        building--
        if (active && failures < TRIES_PER_CARD * target) {
          pump()
          if (ready.length + building >= target) warmNext()
        } else if (!building) for (const w of waiters.splice(0)) w(null)
      })
  }
}

function reissue(cards: SkyPlayCard[], user: string) {
  for (const card of cards) {
    void registerSky(card.reg).then(
      () => hand({ ...card, owner: user }),
      () => exploreQueue.release(card),
    )
  }
}

export const exploreQueue = {
  start({ user, queryClient }: { user: string; queryClient: QueryClient }) {
    client = queryClient
    const conn = currentConnection()
    target = prefetchCount(conn)
    light = isMetered(conn)
    active = true
    failures = 0
    skyPromise = null
    if (owner !== user) {
      owner = user
      reissue(ready.splice(0), user)
    }
    pump()
  },
  stop() {
    active = false
    for (const w of waiters.splice(0)) w(null)
  },
  take(): SkyPlayCard | null {
    const card = ready.shift() ?? null
    pump()
    return card
  },
  wait(timeoutMs: number): Promise<SkyPlayCard | null> {
    const now = exploreQueue.take()
    if (now) return Promise.resolve(now)
    return new Promise((resolve) => {
      const done = (c: SkyPlayCard | null) => {
        clearTimeout(timer)
        resolve(c)
      }
      const timer = setTimeout(() => {
        const i = waiters.indexOf(done)
        if (i >= 0) waiters.splice(i, 1)
        resolve(null)
      }, timeoutMs)
      waiters.push(done)
      pump()
    })
  },
  async revisit(spot: SkySpot): Promise<SkyPlayCard | null> {
    const user = owner
    const deadline = performance.now() + REVISIT_TIMEOUT_MS
    const keep: BuildGuard = () => active && performance.now() < deadline
    try {
      const s = await loadSky()
      const draft = await buildSpotCard(spot, s.bytes.get(ang2pixNest(5, spot.ra, spot.dec)) ?? null, keep)
      if (!draft || !keep()) return null
      const reg = { ra: spot.ra, dec: spot.dec, fov_deg: spot.fov_deg, band: spot.band, size_px: spot.size_px, frames: spot.frames }
      const card = await finish(draft, reg, undefined, user)
      if (user === owner) return card
      exploreQueue.release(card)
      return null
    } catch {
      return null
    }
  },
  claim(card: SkyPlayCard) {
    const i = ready.findIndex((c) => c.id === card.id)
    if (i >= 0) ready.splice(i, 1)
  },
  giveBack(card: SkyPlayCard) {
    if (ready.some((c) => c.id === card.id)) return
    if (card.owner === owner) ready.unshift(card)
    else exploreQueue.release(card)
  },
  release(card: { sprite: string } | null | undefined) {
    if (card?.sprite.startsWith('blob:')) URL.revokeObjectURL(card.sprite)
  },
  size(): number {
    return ready.length
  },
}

export function isSkyCard(card: DeckCard | null | undefined): card is SkyPlayCard {
  return !!card && (card as Partial<SkyPlayCard>).kind === 'sky'
}
