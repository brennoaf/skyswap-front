import type { QueryClient } from '@tanstack/react-query'
import { api, unwrap } from './client'

export const exploreKeys = {
  map: ['explore-map'] as const,
  cells: ['explore-cells'] as const,
}

export const exploreCellsQuery = {
  queryKey: exploreKeys.cells,
  queryFn: async () => unwrap(await api.GET('/api/explore/cells')),
  staleTime: Infinity,
}

export const exploreMapQuery = {
  queryKey: exploreKeys.map,
  queryFn: async () => unwrap(await api.GET('/api/explore/map')),
  staleTime: 60_000,
}

const AFTER_VOTES = [['me'], ['alerts'], ['goals'], exploreKeys.map, ['community', 'overview']] as const

export function refreshAfterVotes(qc: QueryClient): void {
  for (const queryKey of AFTER_VOTES) void qc.invalidateQueries({ queryKey })
}
