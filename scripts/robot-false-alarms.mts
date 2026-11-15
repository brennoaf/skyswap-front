import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const API = process.env.ROBOT_API ?? 'http://127.0.0.1:4001'
const DATA = process.env.SKYSWAP_DATA ?? resolve(import.meta.dirname, '..', '..', 'data')
const WANT = Number(process.env.ROBOT_SPOTS ?? 20)
const AVOID_DEG = 1

const raw = globalThis.fetch
const absolute = (input: string | URL | Request) => (typeof input === 'string' && input.startsWith('/') ? `${API}${input}` : input)
globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => raw(absolute(input), init)) as typeof fetch
const BaseRequest = globalThis.Request
globalThis.Request = class extends BaseRequest {
  constructor(input: string | URL | Request, init?: RequestInit) {
    super(absolute(input), init)
  }
} as typeof Request

const { buildSkyCard, SKY_FOV_DEG } = await import('@/lib/explore/sky-card')
const { differenceStack, detectAll, hints } = await import('@/lib/sky/sci/detect.js')
const { linkMoving } = await import('@/lib/explore/moving')
const { passesRuler, stillScatter } = await import('@/lib/explore/ruler')
const { visitHours } = await import('@/lib/explore/flashlight')

const objects = JSON.parse(readFileSync(resolve(DATA, 'objects', 'index.json'), 'utf8')) as { ra: number; dec: number }[]
let seed = Number(process.env.ROBOT_SEED ?? 2026)
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
const sep = (a: { ra: number; dec: number }, b: { ra: number; dec: number }) => {
  const d = Math.PI / 180
  const c = Math.sin(a.dec * d) * Math.sin(b.dec * d) + Math.cos(a.dec * d) * Math.cos(b.dec * d) * Math.cos((a.ra - b.ra) * d)
  return Math.acos(Math.min(1, Math.max(-1, c))) / d
}

const rows: string[] = []
let built = 0
let accused = 0
let accusedRaw = 0
for (let tries = 0; built < WANT && tries < WANT * 6; tries++) {
  const spot = { ra: rand() * 360, dec: (Math.asin(2 * rand() - 1) * 180) / Math.PI }
  if (objects.some((o) => sep(o, spot) < AVOID_DEG)) continue
  if (process.env.ROBOT_ONLY && !process.env.ROBOT_ONLY.split(',').includes(spot.ra.toFixed(4))) continue
  const draft = await buildSkyCard(spot, 1e9).catch(() => null)
  if (!draft) continue
  built++
  const images = draft.exposures.map((e) => e.img)
  const visits = draft.exposures.map((e) => e.visit)
  const mjds = draft.exposures.map((e) => e.mjd)
  const det = detectAll(differenceStack(images, draft.exposures.map((e) => e.variance), visits), visits, draft.size_px) as Parameters<typeof linkMoving>[0]
  const moved = linkMoving(det, visitHours(visits, mjds))
  const still = stillScatter(images, visits, draft.size_px)
  const kept = passesRuler(moved, still?.px ?? null) ? moved : []
  if (moved.length) accusedRaw++
  if (kept.length) accused++
  const other = (hints(det) as { kind: string }[]).filter((h) => h.kind !== 'residual').map((h) => h.kind)
  const arcsec = still ? ((still.px * SKY_FOV_DEG * 3600) / draft.size_px).toFixed(2) : '-'
  rows.push(`${spot.ra.toFixed(4)} ${spot.dec.toFixed(4)} ${draft.band} photos=${images.length} mjd=${(mjds.reduce((a, b) => a + b, 0) / mjds.length).toFixed(4)} visits=${new Set(visits).size} still=${arcsec}" stars=${still?.stars ?? 0} moved_before_rule=${moved.length ? 'yes' : 'no'} moved_after_rule=${kept.length ? 'yes' : 'no'} other=${other.join(',') || '-'} track=${kept.map((p) => `${(((p.x - draft.size_px / 2) * SKY_FOV_DEG * 3600) / draft.size_px).toFixed(0)},${(((p.y - draft.size_px / 2) * SKY_FOV_DEG * 3600) / draft.size_px).toFixed(0)}`).join(' ')}`)
  process.stdout.write(`${rows[rows.length - 1]}\n`)
}
process.stdout.write(`spots=${built} accused_after_rule=${accused} accused_before_rule=${accusedRaw}\n`)
