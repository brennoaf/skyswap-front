import { api, unwrap, type DeckCard } from '@/lib/api/client'
import { ang2pixNest, loadCells, pickCell, type SkyCell } from '@/lib/sky'
import { isStrong, runFlashlight, type CardHint } from './flashlight'
import { randomSpot, type Spot } from './sampler'
import { buildSkyCard, INDEX_BASE, SKY_FOV_DEG, type SkyCardDraft } from './sky-card'
import { loadTile, tileUrl } from './tiles'

export const PREFETCH = 3
const PARALLEL = 2
const TRIES_PER_CARD = 6

export type SkyPlayCard = DeckCard & { kind: 'sky'; ra: number; dec: number; band: string; hints: CardHint[] }

type Sky = { cells: SkyCell[] | null; indexed: Set<number>; looks: Record<number, number> }

let sky: Sky | null = null
let skyPromise: Promise<Sky> | null = null
const ready: SkyPlayCard[] = []
let building = 0
let failures = 0
let active = false
const waiters: ((c: SkyPlayCard | null) => void)[] = []
let upcoming: Spot | null = null

async function loadSky(): Promise<Sky> {
  if (sky) return sky
  skyPromise ??= (async () => {
    const [cellsJson, indexed, map] = await Promise.all([
      fetch(`${INDEX_BASE}cells.json`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      api.GET('/api/explore/cells').then((r) => new Set(unwrap(r).cells)),
      api
        .GET('/api/explore/map')
        .then((r) => unwrap(r).cells)
        .catch(() => []),
    ])
    sky = { cells: cellsJson ? loadCells(cellsJson) : null, indexed, looks: Object.fromEntries(map.map((c) => [c.cell, c.looks])) }
    return sky
  })()
  skyPromise.catch(() => {
    skyPromise = null
  })
  return skyPromise
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

async function buildOne(): Promise<SkyPlayCard | null> {
  const s = await loadSky()
  for (let i = 0; i < TRIES_PER_CARD && active; i++) {
    const spot = upcoming ?? nextSpot(s)
    upcoming = null
    if (!spot) return null
    try {
      const draft = await buildSkyCard(spot)
      if (!draft) {
        failures++
        continue
      }
      const [reg, sprite, hints] = await Promise.all([
        api.POST('/api/classify/sky', { body: { ra: draft.ra, dec: draft.dec, fov_deg: SKY_FOV_DEG, band: draft.band, size_px: draft.size_px, frames: draft.frames } }).then(unwrap),
        toBlobUrl(draft.pixels),
        runFlashlight(
          draft.exposures.map((e) => e.img),
          draft.exposures.map((e) => e.variance),
          draft.exposures.map((e) => e.visit),
          draft.size_px,
        ),
      ])
      failures = 0
      return { id: reg.id, sprite, n_frames: reg.offsets_s.length, offsets_s: reg.offsets_s, kind: 'sky', ra: reg.ra, dec: reg.dec, band: draft.band, hints }
    } catch {
      failures++
    }
  }
  return null
}

function warmNext() {
  if (upcoming || !sky || !active) return
  upcoming = nextSpot(sky)
  if (upcoming) loadTile(tileUrl(ang2pixNest(5, upcoming.ra, upcoming.dec))).catch(() => null)
}

function pump() {
  while (active && ready.length + building < PREFETCH && building < PARALLEL) {
    building++
    void buildOne()
      .then((card) => {
        if (!card) return
        const w = waiters.shift()
        if (w) w(card)
        else ready.push(card)
      })
      .finally(() => {
        building--
        if (active && failures < TRIES_PER_CARD * PREFETCH) {
          pump()
          if (ready.length + building >= PREFETCH) warmNext()
        }
        else if (!building) for (const w of waiters.splice(0)) w(null)
      })
  }
}

export const exploreQueue = {
  start() {
    active = true
    failures = 0
    sky = null
    skyPromise = null
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
  takeStrong(): SkyPlayCard | null {
    const i = ready.findIndex((c) => isStrong(c.hints))
    if (i < 0) return null
    const [card] = ready.splice(i, 1)
    pump()
    return card ?? null
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
  release(card: { sprite: string } | null | undefined) {
    if (card?.sprite.startsWith('blob:')) URL.revokeObjectURL(card.sprite)
  },
}

export function isSkyCard(card: DeckCard | null | undefined): card is SkyPlayCard {
  return !!card && (card as Partial<SkyPlayCard>).kind === 'sky'
}
