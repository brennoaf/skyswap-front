'use client'

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap, type PostDetail, type TagSummary } from './client'
import { useUi } from '../state/ui'

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
  health: ['health'] as const,
  exploreMap: ['explore-map'] as const,
  exploreCells: ['explore-cells'] as const,
}

export function useSession() {
  return useQuery({ queryKey: keys.session, queryFn: async () => unwrap(await api.GET('/api/session')).user, staleTime: 60_000 })
}

export function useLogin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (nickname: string) => unwrap(await api.POST('/api/session', { body: { nickname } })).user,
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
  const celebrate = useCelebrate()
  return useMutation({
    mutationFn: async (marks: { frame: number; x: number; y: number }[]) => unwrap(await api.POST('/api/posts/{id}/marks', { params: { path: { id: postId } }, body: { marks } })),
    onSuccess: (r) => {
      qc.setQueryData<PostDetail>(keys.post(postId), (d) => (d ? { ...d, my_marks: r.my_marks, community_marks: r.community_marks } : d))
      celebrate(r.xp, r.new_badges)
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
  return useQuery({ queryKey: keys.exploreMap, queryFn: async () => unwrap(await api.GET('/api/explore/map')), staleTime: 60_000 })
}

export function useExploreCells() {
  return useQuery({ queryKey: keys.exploreCells, queryFn: async () => unwrap(await api.GET('/api/explore/cells')).cells, staleTime: Infinity })
}

export function useGoals() {
  return useQuery({ queryKey: keys.goals, queryFn: async () => unwrap(await api.GET('/api/community/goals')).goals, staleTime: 60_000 })
}

export function useSearch(q: string) {
  return useQuery({
    queryKey: keys.search(q),
    enabled: q.trim().length > 0,
    queryFn: async () => unwrap(await api.GET('/api/search', { params: { query: { q } } })),
    staleTime: 300_000,
  })
}

export function useSky(ra: number | null, dec: number | null, fov: number, band: string | null) {
  return useQuery({
    queryKey: keys.sky(ra ?? 0, dec ?? 0, fov, band),
    enabled: ra !== null && dec !== null,
    queryFn: async () => unwrap(await api.GET('/api/sky', { params: { query: { ra: ra as number, dec: dec as number, fov, ...(band ? { band } : {}) } } })),
    staleTime: 600_000,
  })
}

export type Choice = 'moves' | 'still' | 'unsure'
export type VotePosition = { frame: number; x: number; y: number }

export function useVote() {
  const qc = useQueryClient()
  const celebrate = useCelebrate()
  return useMutation({
    mutationFn: async (body: { card_id: string; choice: Choice; glitch?: boolean | null; position?: VotePosition }) => unwrap(await api.POST('/api/classify/votes', { body })),
    onSuccess: (r) => {
      celebrate(r.xp, r.new_badges)
      qc.invalidateQueries({ queryKey: keys.me })
      qc.invalidateQueries({ queryKey: keys.alerts })
      qc.invalidateQueries({ queryKey: keys.goals })
      qc.invalidateQueries({ queryKey: keys.exploreMap })
    },
  })
}

export function useGlitch() {
  return useMutation({
    mutationFn: async ({ cardId, glitch }: { cardId: string; glitch: boolean | null }) => unwrap(await api.POST('/api/classify/votes/{id}/glitch', { params: { path: { id: cardId } }, body: { glitch } })),
  })
}

export function useGuideCard(enabled: boolean) {
  return useQuery({ queryKey: ['classify-guide'], enabled, queryFn: async () => unwrap(await api.GET('/api/classify/guide')), staleTime: Infinity, gcTime: 0 })
}
