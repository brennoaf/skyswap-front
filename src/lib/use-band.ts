'use client'

import { useCallback } from 'react'

export function useBandName() {
  return useCallback((band: string | null | undefined): string => band ?? '', [])
}

export function useBandList() {
  const name = useBandName()
  return useCallback((bands: readonly string[]) => bands.map((b) => name(b)).join(', '), [name])
}
