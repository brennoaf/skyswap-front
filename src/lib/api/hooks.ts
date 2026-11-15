'use client'

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap, type PostDetail, type TagSummary } from './client'
import { exploreCellsQuery, exploreKeys, exploreMapQuery } from './queries'
import { useUi } from '../state/ui'
import { SPECTRUM_FORMAT, spectrumShape } from '../spectrum-shape'

export type FeedTab = 'for_you' | 'following' | 'new' | 'targets'
export type TagKey = 'asteroid' | 'artifact' | 'brightness' | 'unsure'
export type Label = 'real' | 'artifact' | 'unsure'
export type LearnEvent = 'band_seen' | 'spectrum_opened' | 'object_viewed'

export const keys = {
  session: ['session'] as const,
  feed: (tab: FeedTab) => ['feed', tab] as const,
  stories: ['stories'] as const,
  objects: ['objects'] as const,
  object: (id: string) => ['object', id] as const,
  objectPosts: (id: string) => ['object-posts', id] as const,
  post: (id: string) => ['post', id] as const,
  me: ['me'] as const,
  alerts: ['alerts'] as const,
  goals: ['goals'] as const,
  search: (q: string) => ['search', q] as const,
  sky: (ra: number, dec: number, fov: number, band: string | null) => ['sky', ra, dec, fov, band] as const,
  skySpectrum: (ra: number, dec: number, obj: string | null) => ['sky-spectrum', ra, dec, obj] as const,
  health: ['health'] as const,
  exploreMap: exploreKeys.map,
  exploreCells: exploreKeys.cells,
}

export function useSession() {
  return useQuery({ queryKey: keys.session, queryFn: async () => unwrap(await api.GET('/api/session')).user, staleTime: 60_000 })
}

export function useLogin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ nickname, avatarId }: { nickname: string; avatarId?: string }) => unwrap(await api.POST('/api/session', { body: { nickname, avatar_id: avatarId } })).user,
    onSuccess: () => qc.invalidateQueries(),
  })
}

export function useSetAvatar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (avatarId: string) => unwrap(await api.PUT('/api/me/avatar', { body: { avatar_id: avatarId } })).user,
    onSuccess: () => qc.invalidateQueries(),
  })
}

export function useLogout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => unwrap(await api.DELETE('/api/session')),
    onSuccess: () => qc.invalidateQueries(),
  })
}

export function useHealth() {
  return useQuery({ queryKey: keys.health, queryFn: async () => unwrap(await api.GET('/api/health')), staleTime: Infinity })
}

export function useFeed(tab: FeedTab) {
  return useInfiniteQuery({
    queryKey: keys.feed(tab),
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => unwrap(await api.GET('/api/feed', { params: { query: { tab, cursor: pageParam, limit: 6 } } })),
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  })
}

export function useStories() {
  return useQuery({ queryKey: keys.stories, queryFn: async () => unwrap(await api.GET('/api/stories')).stories, staleTime: 300_000 })
}

export function useObjects() {
  return useQuery({ queryKey: keys.objects, queryFn: async () => unwrap(await api.GET('/api/objects')).objects, staleTime: 300_000 })
}

export function useObject(id: string) {
  return useQuery({ queryKey: keys.object(id), enabled: !!id, queryFn: async () => unwrap(await api.GET('/api/objects/{id}', { params: { path: { id } } })) })
}

export function useObjectPosts(id: string | undefined) {
  return useQuery({
    queryKey: keys.objectPosts(id ?? ''),
    enabled: !!id,
    queryFn: async () => unwrap(await api.GET('/api/objects/{id}/posts', { params: { path: { id: id as string } } })).posts,
    staleTime: 300_000,
  })
}

export function usePost(id: string) {
  return useQuery({ queryKey: keys.post(id), queryFn: async () => unwrap(await api.GET('/api/posts/{id}', { params: { path: { id } } })) })
}

export function useCelebrate() {
  const toast = useUi((s) => s.toast)
  return (xp: { xp: number; streakBonus: number; reason: string } | null | undefined, badges: string[] = []) => {
    for (const b of badges) toast({ kind: 'badge', badge: b })
    if (xp && xp.xp + xp.streakBonus > 0) toast({ kind: 'xp', xp: xp.xp + xp.streakBonus, streak: xp.streakBonus > 0 })
    else if (xp && xp.reason === 'too_fast') toast({ kind: 'info', key: 'xp.tooFast' })
    else if (xp && (xp.reason === 'daily_cap' || xp.reason === 'diminished')) toast({ kind: 'info', key: 'xp.limit' })
  }
}

type FeedCache = { pages: { items: { post: { id: string }; tags: TagSummary }[] }[] }

export function useSetTag(postId: string) {
  const qc = useQueryClient()
  const celebrate = useCelebrate()
  return useMutation({
    mutationFn: async ({ tag, on }: { tag: TagKey; on: boolean }) => unwrap(await api.POST('/api/posts/{id}/tags', { params: { path: { id: postId } }, body: { tag, on } })),
    onSuccess: (r) => {
      qc.setQueryData<PostDetail>(keys.post(postId), (d) => (d ? { ...d, tags: r.tags } : d))
      qc.setQueriesData<FeedCache>({ queryKey: ['feed'] }, (d) =>
        d ? { ...d, pages: d.pages.map((p) => ({ ...p, items: p.items.map((i) => (i.post.id === postId ? { ...i, tags: r.tags } : i)) })) } : d,
      )
      celebrate(r.xp)
      qc.invalidateQueries({ queryKey: keys.me })
    },
  })
}

export function useSaveMarks(postId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (marks: { frame: number; x: number; y: number }[]) => unwrap(await api.POST('/api/posts/{id}/marks', { params: { path: { id: postId } }, body: { marks } })),
    onSuccess: (r) => {
      qc.setQueryData<PostDetail>(keys.post(postId), (d) => (d ? { ...d, my_marks: r.my_marks, community_marks: r.community_marks } : d))
      qc.invalidateQueries({ queryKey: keys.me })
      qc.invalidateQueries({ queryKey: keys.goals })
    },
  })
}

export function useFollow(objectId: string) {
  const qc = useQueryClient()
  const celebrate = useCelebrate()
  return useMutation({
    mutationFn: async (on: boolean) => unwrap(await api.POST('/api/objects/{id}/follow', { params: { path: { id: objectId } }, body: { on } })),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: keys.object(objectId) })
      qc.invalidateQueries({ queryKey: keys.feed('following') })
      qc.invalidateQueries({ queryKey: keys.me })
      qc.invalidateQueries({ queryKey: keys.alerts })
      celebrate(r.xp)
    },
  })
}

export function useLearn() {
  const qc = useQueryClient()
  const { data: user } = useSession()
  return useMutation({
    mutationFn: async ({ event, ref }: { event: LearnEvent; ref: string }) => (user ? unwrap(await api.POST('/api/learn', { body: { event, ref } })) : { new_badges: [] as string[] }),
    onSuccess: (r) => {
      if (r.new_badges.length) qc.invalidateQueries({ queryKey: keys.me })
    },
  })
}

export function useMe(enabled = true) {
  return useQuery({ queryKey: keys.me, enabled, queryFn: async () => unwrap(await api.GET('/api/me')) })
}

export function useAlerts(enabled = true) {
  return useQuery({ queryKey: keys.alerts, enabled, queryFn: async () => unwrap(await api.GET('/api/alerts')), refetchInterval: 60_000 })
}

export function useReadAlerts() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ids: string[]) => unwrap(await api.POST('/api/alerts/read', { body: { ids } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.alerts }),
  })
}

export function useExploreMap() {
  return useQuery(exploreMapQuery)
}

export function useExploreCells() {
  return useQuery({ ...exploreCellsQuery, select: (d) => d.cells })
}

export type CommunityTab = 'new' | 'popular'

export function useCommunityFeed(tab: CommunityTab = 'new') {
  return useInfiniteQuery({
    queryKey: ['community', 'feed', tab],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => unwrap(await api.GET('/api/community/feed', { params: { query: { tab, cursor: pageParam } } })),
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  })
}

export function useFinding(id: string) {
  return useQuery({
    queryKey: ['community', 'finding', id],
    retry: false,
    refetchInterval: 30_000,
    queryFn: async () => unwrap(await api.GET('/api/community/findings/{id}', { params: { path: { id } } })),
  })
}

export function useCommunityOverview(enabled = true) {
  return useQuery({ queryKey: ['community', 'overview'], enabled, queryFn: async () => unwrap(await api.GET('/api/community/overview')) })
}

export function useFindingPeople(id: string, enabled: boolean) {
  return useQuery({
    queryKey: ['community', 'people', id],
    enabled,
    queryFn: async () => unwrap(await api.GET('/api/community/findings/{id}/people', { params: { path: { id } } })),
  })
}

type ReactionInput = { kind: 'interesting' | 'doubt'; on: boolean; reason?: 'image_defect' | 'known_asteroid' | 'variable_star' | 'other'; position?: { frame: number; x: number; y: number } }

export function useFindingActions(id: string) {
  const qc = useQueryClient()
  const onSuccess = () => qc.invalidateQueries({ queryKey: ['community'] })
  const path = { params: { path: { id } } }
  return {
    reaction: useMutation({
      mutationFn: async (body: ReactionInput) => unwrap(await api.POST('/api/community/findings/{id}/reaction', { ...path, body })),
      onSuccess,
    }),
    secondLook: useMutation({
      mutationFn: async (choice: 'moves' | 'still' | 'unsure') => unwrap(await api.POST('/api/community/findings/{id}/second-look', { ...path, body: { choice } })),
      onSuccess,
    }),
    follow: useMutation({
      mutationFn: async (on: boolean) => unwrap(await api.POST('/api/community/findings/{id}/follow', { ...path, body: { on } })),
      onSuccess: () => {
        void onSuccess()
        qc.invalidateQueries({ queryKey: keys.alerts })
      },
    }),
  }
}

export function useMyCards(enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ['me', 'cards'],
    enabled,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => unwrap(await api.GET('/api/me/cards', { params: { query: { cursor: pageParam } } })),
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  })
}

export function useCredit(enabled: boolean) {
  const qc = useQueryClient()
  const credit = useQuery({ queryKey: ['me', 'credit'], enabled, queryFn: async () => unwrap(await api.GET('/api/me/credit')) })
  const set = useMutation({
    mutationFn: async (visible: boolean) => unwrap(await api.PUT('/api/me/credit', { body: { visible } })),
    onSuccess: (r) => qc.setQueryData(['me', 'credit'], r),
  })
  return { visible: credit.data?.visible ?? true, set }
}

export function useGoals(enabled = true) {
  return useQuery({ queryKey: keys.goals, enabled, queryFn: async () => unwrap(await api.GET('/api/community/goals')).goals, staleTime: 60_000 })
}

export function searchQuery(q: string) {
  return {
    queryKey: keys.search(q),
    queryFn: async () => unwrap(await api.GET('/api/search', { params: { query: { q } } })),
    staleTime: 300_000,
  }
}

export function useSearch(q: string) {
  return useQuery({ ...searchQuery(q), enabled: q.trim().length > 0 })
}

export function useSky(ra: number | null, dec: number | null, fov: number, band: string | null) {
  return useQuery({
    queryKey: keys.sky(ra ?? 0, dec ?? 0, fov, band),
    enabled: ra !== null && dec !== null,
    queryFn: async () => unwrap(await api.GET('/api/sky', { params: { query: { ra: ra as number, dec: dec as number, fov, ...(band ? { band } : {}) } } })),
    staleTime: 600_000,
  })
}

export function useSkySpectrum(ra: number, dec: number, obj: string | null, enabled: boolean) {
  return useQuery({
    queryKey: keys.skySpectrum(ra, dec, obj),
    enabled,
    queryFn: async () => spectrumShape(unwrap(await api.GET('/api/sky/spectrum', { params: { query: { ra, dec, v: SPECTRUM_FORMAT, ...(obj ? { obj } : {}) } } }))),
    staleTime: Infinity,
    retry: 1,
  })
}

export type Choice = 'moves' | 'still' | 'unsure'
export type VotePosition = { frame: number; x: number; y: number }
export type TracePosition = { frame: number; x: number; y: number; ax: number; ay: number }

export type VoteInput = { card_id: string; choice: Choice; glitch?: boolean | null; position?: VotePosition; positions?: (TracePosition | null)[]; held_ms?: number; think_ms?: number; answered_at?: number; hints?: boolean }

export async function postVote(body: VoteInput, keepalive = false) {
  return unwrap(await api.POST('/api/classify/votes', { body, keepalive }))
}

export function useVote() {
  return useMutation({ mutationFn: async ({ keepalive, ...body }: VoteInput & { keepalive?: boolean }) => postVote(body, keepalive) })
}

export function useGuideCard(enabled: boolean) {
  return useQuery({ queryKey: ['classify-guide'], enabled, queryFn: async () => unwrap(await api.GET('/api/classify/guide')), staleTime: Infinity, gcTime: 0 })
}
