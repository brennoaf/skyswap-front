const DECIMAL_PAIR = /^\+?(\d+(?:\.\d+)?)\s*°?\s+([+-]?\d+(?:\.\d+)?)\s*°?$/
const SEXA_PAIR = /^(\d{1,2})\s*(?:h|:|\s)\s*(\d{1,2})\s*(?:m|:|'|\s)\s*(\d{1,2}(?:\.\d+)?)\s*s?\s*([+-]?)\s*(\d{1,2})\s*(?:d|°|:|\s)\s*(\d{1,2})\s*(?:m|'|:|\s)\s*(\d{1,2}(?:\.\d+)?)\s*(?:s|")?$/i

function normalize(q: string): string {
  return q
    .trim()
    .replace(/[−‒–—]/g, '-')
    .replace(/[′’´]/g, "'")
    .replace(/[″”]|''/g, '"')
    .replace(/(^|[\s,;])(?:ra|dec|α|δ)(?![a-z])\s*[:=]?\s*/gi, '$1 ')
    .replace(/[,;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseCoordinates(q: string): { ra: number; dec: number } | null {
  const s = normalize(q)
  const dec2 = DECIMAL_PAIR.exec(s)
  if (dec2) {
    const ra = Number(dec2[1])
    const dec = Number(dec2[2])
    return ra >= 0 && ra < 360 && dec >= -90 && dec <= 90 ? { ra, dec } : null
  }
  const sexa = SEXA_PAIR.exec(s)
  if (!sexa) return null
  const [h, m, sec, d, dm, ds] = [sexa[1], sexa[2], sexa[3], sexa[5], sexa[6], sexa[7]].map(Number) as [number, number, number, number, number, number]
  if (h >= 24 || m >= 60 || sec >= 60 || dm >= 60 || ds >= 60) return null
  const ra = 15 * (h + m / 60 + sec / 3600)
  const dec = (sexa[4] === '-' ? -1 : 1) * (d + dm / 60 + ds / 3600)
  return ra >= 0 && ra < 360 && dec >= -90 && dec <= 90 ? { ra, dec } : null
}

export function pointLabHref(ra: number, dec: number, band?: string | null): string {
  const q = new URLSearchParams({ ra: ra.toFixed(5), dec: dec.toFixed(5) })
  if (band) q.set('band', band)
  return `/lab/point?${q}`
}
