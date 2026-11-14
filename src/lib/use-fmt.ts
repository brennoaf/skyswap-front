'use client'

import { useLocale } from 'next-intl'
import { useMemo } from 'react'
import { compactNumber, formatDate, formatDateTime, formatNumber, formatShortDate } from './format'

export function useFmt() {
  const locale = useLocale()
  return useMemo(
    () => ({
      locale,
      date: (v: string | number) => formatDate(v, locale),
      shortDate: (v: string | number) => formatShortDate(v, locale),
      dateTime: (v: string) => formatDateTime(v, locale),
      number: (n: number, digits = 0) => formatNumber(n, locale, digits),
      compact: (n: number) => compactNumber(n, locale),
      fixed: (n: number, digits: number) => n.toLocaleString(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits }),
    }),
    [locale],
  )
}
