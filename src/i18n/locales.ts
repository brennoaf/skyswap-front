export const locales = ['en', 'pt-BR'] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = 'en'
export const LOCALE_COOKIE = 'NEXT_LOCALE'

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (locales as readonly string[]).includes(v)
}

export function localeCookie(locale: Locale) {
  return `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`
}
