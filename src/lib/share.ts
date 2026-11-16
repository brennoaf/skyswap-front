'use client'

import { useUi } from './state/ui'

export function useShare() {
  const toast = useUi((s) => s.toast)
  return async ({ title, path, system = false }: { title: string; path: string; system?: boolean }) => {
    const url = new URL(path, window.location.origin).toString()
    if (navigator.share && (system || matchMedia('(pointer: coarse)').matches)) {
      try {
        await navigator.share({ title, url })
        return
      } catch (e) {
        if (!system || (e instanceof DOMException && e.name === 'AbortError')) return
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      toast({ kind: 'info', key: 'common.linkCopied' })
    } catch {
      toast({ kind: 'info', key: 'common.linkIs', values: { url } })
    }
  }
}
