export const MAX_ZOOM = 6
export const EDGE_GUARD_PX = 24

export type CardZoom = { scale: number; x: number; y: number }
export type BoxSize = { width: number; height: number }

export const NO_ZOOM: CardZoom = { scale: 1, x: 0, y: 0 }

export function clampZoom(z: CardZoom, box: BoxSize | null): CardZoom {
  const scale = Math.min(MAX_ZOOM, Math.max(1, z.scale))
  if (scale === 1 || !box) return NO_ZOOM
  const maxX = (box.width * (scale - 1)) / 2
  const maxY = (box.height * (scale - 1)) / 2
  return { scale, x: Math.min(maxX, Math.max(-maxX, z.x)), y: Math.min(maxY, Math.max(-maxY, z.y)) }
}

export function startsAtEdge(clientX: number, viewportWidth: number, guard = EDGE_GUARD_PX): boolean {
  return clientX < guard || clientX > viewportWidth - guard
}
