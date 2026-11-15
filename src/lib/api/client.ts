import createClient from 'openapi-fetch'
import type { components, paths } from './schema'

export const API_TIMEOUT_MS = 15_000
export const SLOW_API_TIMEOUT_MS = 45_000
const SLOW_PATHS = ['/api/search', '/api/sky', '/api/cutout', '/api/index/at']

export function timeoutFor(url: string): number {
  const path = url.replace(/^[a-z]+:\/\/[^/]+/i, '').split('?')[0] ?? ''
  return SLOW_PATHS.some((p) => path === p || path.startsWith(`${p}/`)) ? SLOW_API_TIMEOUT_MS : API_TIMEOUT_MS
}

export function tzOffsetMinutes(now: Date = new Date()): number {
  return -now.getTimezoneOffset() || 0
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const request = new Request(input, init)
  if (typeof window !== 'undefined') request.headers.set('X-TZ-Offset', String(tzOffsetMinutes()))
  const ctrl = new AbortController()
  const stop = () => ctrl.abort(request.signal.reason)
  if (request.signal.aborted) stop()
  else request.signal.addEventListener('abort', stop, { once: true })
  const timer = setTimeout(() => ctrl.abort(new DOMException('timeout', 'TimeoutError')), timeoutFor(request.url))
  try {
    return await fetch(request, { signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
    request.signal.removeEventListener('abort', stop)
  }
}

export const api = createClient<paths>({ baseUrl: typeof window === 'undefined' ? (process.env.SKYSWAP_API_URL ?? 'http://127.0.0.1:4000') : '', credentials: 'include', fetch: apiFetch })

type Ok<P extends keyof paths, M extends keyof paths[P]> = paths[P][M] extends { responses: { 200: { content: { 'application/json': infer T } } } } ? T : never

export type Schemas = components['schemas']
export type ObjectCard = Schemas['ObjectCard']
export type Post = Schemas['Post']
export type Frame = Schemas['Frame']
export type FeedItem = Schemas['FeedItem']
export type TagSummary = Schemas['TagSummary']
export type Reveal = Schemas['Reveal']
export type DeckCard = Schemas['DeckCard']
export type Spot = Schemas['Spot']
export type Xp = Schemas['Xp']
export type User = Schemas['User']
export type Story = Ok<'/api/stories', 'get'>['stories'][number]
export type ObjectProfile = Ok<'/api/objects/{id}', 'get'>
export type PostDetail = Ok<'/api/posts/{id}', 'get'>
export type Me = Ok<'/api/me', 'get'>
export type SearchResult = Ok<'/api/search', 'get'>
export type SkyResult = Ok<'/api/sky', 'get'>
export type PointSpectrum = Ok<'/api/sky/spectrum', 'get'>
export type Alert = Ok<'/api/alerts', 'get'>['alerts'][number]
export type NextCard = Ok<'/api/classify/next', 'get'>
export type SkySpot = NonNullable<NextCard['spot']>
export type VoteResult = Ok<'/api/classify/votes', 'post'>
export type GuideData = Ok<'/api/classify/guide', 'get'>

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code)
  }
}

export function failureOf(err: unknown): { status: number | null; code: string | null } {
  return err instanceof ApiError ? { status: err.status, code: err.code } : { status: null, code: null }
}

export function unwrap<T>(r: { data?: T; error?: unknown; response: Response }): T {
  if (r.error !== undefined || r.data === undefined) {
    const code = typeof r.error === 'object' && r.error && 'error' in r.error ? String((r.error as { error: unknown }).error) : 'request_failed'
    throw new ApiError(r.response.status, code)
  }
  return r.data
}
export type FindingSummary = components['schemas']['FindingSummary']
export type AppPostItem = components['schemas']['AppPostItem']
export type AccountPage = Ok<'/api/accounts/{handle}', 'get'>
export type FindingDetail = components['schemas']['FindingDetail']
export type FindingSocial = components['schemas']['FindingSocial']
export type MyCardItem = components['schemas']['MyCards']['items'][number]
