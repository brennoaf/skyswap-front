export const PREFETCH_FULL = 3
export const PREFETCH_LIGHT = 1

export type ConnectionInfo = { saveData?: boolean; type?: string; effectiveType?: string }

const SLOW_TYPES = ['slow-2g', '2g', '3g']

export function isMetered(conn: ConnectionInfo | null | undefined): boolean {
  if (!conn) return false
  return !!conn.saveData || conn.type === 'cellular' || SLOW_TYPES.includes(conn.effectiveType ?? '')
}

export function prefetchCount(conn: ConnectionInfo | null | undefined): number {
  return isMetered(conn) ? PREFETCH_LIGHT : PREFETCH_FULL
}

export function currentConnection(): ConnectionInfo | null {
  if (typeof navigator === 'undefined') return null
  return (navigator as Navigator & { connection?: ConnectionInfo }).connection ?? null
}
