export type ViewTool = 'changes' | 'colour'
export type SharedView = { at: number | null; band: string | null; tool: ViewTool | null }

const TOOLS: ViewTool[] = ['changes', 'colour']
const BAND = /^D[1-6]$/

export function readView(search: string): SharedView {
  const q = new URLSearchParams(search)
  const at = Number(q.get('at'))
  const band = q.get('atband')
  const tool = q.get('tool') as ViewTool | null
  const ok = q.has('at') && Number.isFinite(at) && at > 0
  return { at: ok ? at : null, band: ok && band && BAND.test(band) ? band : null, tool: tool && TOOLS.includes(tool) ? tool : null }
}

export function withView(href: string, view: SharedView): string {
  const [path = '', search = ''] = href.split('?')
  const q = new URLSearchParams(search)
  q.delete('at')
  q.delete('atband')
  q.delete('tool')
  if (view.at !== null) {
    q.set('at', view.at.toFixed(5))
    if (view.band) q.set('atband', view.band)
  }
  if (view.tool) q.set('tool', view.tool)
  const s = q.toString()
  return s ? `${path}?${s}` : path
}

export function nearestFrame(frames: readonly { mjd: number; band: string }[], at: number, band: string | null = null): number {
  let best = -1
  let bestScore = Infinity
  frames.forEach((f, i) => {
    const score = Math.abs(f.mjd - at) + (band && f.band !== band ? 1e6 : 0)
    if (score < bestScore) {
      best = i
      bestScore = score
    }
  })
  return Math.max(0, best)
}
