'use client'

import { useUi } from './state/ui'

export function useShare() {
  const toast = useUi((s) => s.toast)
  return async ({ title, path }: { title: string; path: string }) => {
    const url = new URL(path, window.location.origin).toString()
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share({ title, url })
        return
      } catch {
        return
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
