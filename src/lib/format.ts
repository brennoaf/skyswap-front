export const BANDS = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6'] as const
export type Band = (typeof BANDS)[number]

export const BAND_HUE: Record<string, string> = Object.fromEntries(BANDS.map((b) => [b, `var(--color-band-${b.toLowerCase()})`]))

export function cssColor(token: string, fallback = '#ffffff'): string {
  if (typeof window === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(token).trim()
  return v || fallback
}

export function formatDate(iso: string | number, locale: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(locale, { timeZone: 'UTC', ...opts })
}

export function formatShortDate(iso: string | number, locale: string): string {
  return formatDate(iso, locale, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatDateTime(iso: string, locale: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : `${formatShortDate(iso, locale)} ${d.toISOString().slice(11, 16)} UTC`
}

export function formatDateTimeSeconds(iso: string, locale: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : `${formatShortDate(iso, locale)} ${d.toISOString().slice(11, 19)} UTC`
}

export function relativeTime(ms: number, now = Date.now()): { unit: 'now' | 'm' | 'h' | 'd' | 'w'; value: number } {
  const s = Math.max(0, (now - ms) / 1000)
  if (s < 60) return { unit: 'now', value: 0 }
  if (s < 3600) return { unit: 'm', value: Math.floor(s / 60) }
  if (s < 86400) return { unit: 'h', value: Math.floor(s / 3600) }
  if (s < 7 * 86400) return { unit: 'd', value: Math.floor(s / 86400) }
  return { unit: 'w', value: Math.floor(s / (7 * 86400)) }
}

export function formatNumber(n: number, locale: string, digits = 0): string {
  return n.toLocaleString(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits })
}

export function compactNumber(n: number, locale: string): string {
  return n.toLocaleString(locale, { notation: 'compact', maximumFractionDigits: 1 })
}

export function formatWavelength(range: readonly number[] | null | undefined, locale = 'en'): string {
  if (!range || range.length < 2) return ''
  const [a, b] = range as [number, number]
  const n = (v: number) => v.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return Math.abs(a - b) < 0.005 ? `${n(a)} µm` : `${n(a)} ${locale.startsWith('pt') ? 'a' : 'to'} ${n(b)} µm`
}

export function formatRa(deg: number): string {
  const h = deg / 15
  const hh = Math.floor(h)
  const mm = Math.floor((h - hh) * 60)
  const ss = ((h - hh) * 60 - mm) * 60
  return `${String(hh).padStart(2, '0')}h ${String(mm).padStart(2, '0')}m ${ss.toFixed(1).padStart(4, '0')}s`
}

export function formatDec(deg: number): string {
  const sign = deg < 0 ? '−' : '+'
  const a = Math.abs(deg)
  const dd = Math.floor(a)
  const mm = Math.floor((a - dd) * 60)
  const ss = ((a - dd) * 60 - mm) * 60
  return `${sign}${String(dd).padStart(2, '0')}° ${String(mm).padStart(2, '0')}′ ${ss.toFixed(0).padStart(2, '0')}″`
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 ** 2).toFixed(n < 10 * 1024 ** 2 ? 1 : 0)} MB`
}

export function bandOf(wavelengthUm: number, ranges: Record<string, [number, number]>): string | null {
  let best: string | null = null
  let dist = Infinity
  for (const [band, [a, b]] of Object.entries(ranges)) {
    const d = wavelengthUm < a ? a - wavelengthUm : wavelengthUm > b ? wavelengthUm - b : 0
    if (d < dist) {
      dist = d
      best = band
    }
  }
  return best
}

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}
