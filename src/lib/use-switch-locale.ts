'use client'

import { useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'
import { useTransition } from 'react'
import { localeCookie, type Locale } from '@/i18n/locales'

export function useSwitchLocale() {
  const router = useRouter()
  const current = useLocale()
  const [pending, start] = useTransition()
  const change = (locale: Locale) => {
    document.cookie = localeCookie(locale)
    if (locale !== current) start(() => router.refresh())
  }
  return { current, change, pending }
}
