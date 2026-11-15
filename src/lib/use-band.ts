'use client'

import { useTranslations } from 'next-intl'
import { useCallback } from 'react'

const CODE = /^D([1-6])$/

export function useBandName() {
  const t = useTranslations('bands')
  return useCallback(
    (band: string | null | undefined): string => {
      const n = CODE.exec(band ?? '')?.[1]
      return n ? t('name', { n }) : (band ?? '')
    },
    [t],
  )
}

export function useBandList() {
  const name = useBandName()
  return useCallback((bands: readonly string[]) => bands.map((b) => name(b)).join(', '), [name])
}
