const KEY = 'skyModal'

type Entry = { token: object; close: () => void; byHistory: boolean; url: string }

const stack: Entry[] = []
const listeners = new Set<() => void>()
let swallow = 0
let after: (() => void) | null = null
let pending = false

export function depthOf(state: unknown): number {
  const v = state && typeof state === 'object' ? (state as Record<string, unknown>)[KEY] : undefined
  return typeof v === 'number' ? v : 0
}

const notify = () => listeners.forEach((l) => l())

function onPop(e: PopStateEvent) {
  if (swallow > 0) {
    swallow--
    e.stopImmediatePropagation()
    if (!swallow && after) {
      const run = after
      after = null
      run()
    }
    return
  }
  if (!stack.length) return
  if (stack[0]?.url === location.href) e.stopImmediatePropagation()
  for (const m of stack.slice(depthOf(e.state)).reverse()) {
    m.byHistory = true
    m.close()
  }
}

function flush() {
  pending = false
  const extra = depthOf(history.state) - stack.length
  if (extra <= 0) return
  swallow++
  history.go(-extra)
}

if (typeof window !== 'undefined') window.addEventListener('popstate', onPop)

export function openModal(token: object, close: () => void) {
  stack.push({ token, close, byHistory: false, url: location.href })
  if (depthOf(history.state) < stack.length) history.pushState({ ...(history.state as object | null), [KEY]: stack.length }, '')
  notify()
}

export function closeModal(token: object) {
  const i = stack.findIndex((m) => m.token === token)
  if (i < 0) return
  const [m] = stack.splice(i, 1)
  notify()
  if (m?.byHistory || pending) return
  pending = true
  queueMicrotask(flush)
}

export function leaveModals(go: () => void) {
  const extra = depthOf(history.state)
  for (const m of [...stack].reverse()) {
    m.byHistory = true
    m.close()
  }
  if (extra <= 0) {
    go()
    return
  }
  swallow++
  after = go
  history.go(-extra)
}

export const modalCount = () => stack.length
export const isTopModal = (token: object) => stack[stack.length - 1]?.token === token

export function subscribeModals(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
