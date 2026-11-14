import createClient from 'openapi-fetch'
import type { components, paths } from './schema'

export const api = createClient<paths>({ baseUrl: typeof window === 'undefined' ? (process.env.SKYSWAP_API_URL ?? 'http://127.0.0.1:4000') : '', credentials: 'include' })

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
export type Alert = Ok<'/api/alerts', 'get'>['alerts'][number]

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code)
  }
}

export function unwrap<T>(r: { data?: T; error?: unknown; response: Response }): T {
  if (r.error !== undefined || r.data === undefined) {
    const code = typeof r.error === 'object' && r.error && 'error' in r.error ? String((r.error as { error: unknown }).error) : 'request_failed'
    throw new ApiError(r.response.status, code)
  }
  return r.data
}
export type FindingSummary = components['schemas']['FindingSummary']
export type FindingDetail = components['schemas']['FindingDetail']
export type FindingSocial = components['schemas']['FindingSocial']
export type MyCardItem = components['schemas']['MyCards']['items'][number]
