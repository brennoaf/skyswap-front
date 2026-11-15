'use client'

import { useEffect, useState } from 'react'
import en from '../../messages/en.json'
import pt from '../../messages/pt-BR.json'
import { defaultLocale, isLocale, type Locale } from '@/i18n/locales'
import './globals.css'

const TEXT: Record<Locale, { title: string; body: string; retry: string; home: string }> = {
  en: { ...en.errors, retry: en.common.retry, home: en.common.goHome },
  'pt-BR': { ...pt.errors, retry: pt.common.retry, home: pt.common.goHome },
}

function savedLocale(): Locale {
  const cookie = /(?:^|;\s*)NEXT_LOCALE=([^;]+)/.exec(document.cookie)?.[1]
  return cookie && isLocale(cookie) ? cookie : defaultLocale
}

function savedTheme(): 'dark' | 'light' {
  try {
    const pref = (JSON.parse(localStorage.getItem('skyswap-ui') ?? '{}') as { state?: { theme?: string } }).state?.theme ?? 'system'
    if (pref === 'dark' || pref === 'light') return pref
  } catch {
    return 'dark'
  }
  return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [locale, setLocale] = useState<Locale>(defaultLocale)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  useEffect(() => {
    setLocale(savedLocale())
    setTheme(savedTheme())
  }, [])
  const t = TEXT[locale]
  return (
    <html lang={locale} data-theme={theme}>
      <body>
        <main className="mx-auto flex min-h-dvh max-w-[var(--width-app)] flex-col items-center justify-center px-8 text-center" role="alert">
          <p className="text-title-md font-semibold">{t.title}</p>
          <p className="mt-2 max-w-[300px] text-text-secondary">{t.body}</p>
          <button type="button" onClick={reset} className="mt-5 inline-flex h-11 items-center rounded-[var(--radius-button)] bg-accent px-6 text-ui font-semibold text-on-accent">
            {t.retry}
          </button>
          <button type="button" onClick={() => window.location.assign('/')} className="mt-1 inline-flex min-h-11 items-center px-3 text-ui font-semibold text-link">
            {t.home}
          </button>
        </main>
      </body>
    </html>
  )
}
