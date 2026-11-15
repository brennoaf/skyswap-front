export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ'
export const CONNECT_PATH = '/me/connect'
export const LINK_GROUPS = 2
export const RECOVERY_GROUPS = 3

export function cleanCode(text: string, groups: number): string {
  const chars = [...text.toUpperCase()].filter((c) => CODE_ALPHABET.includes(c)).slice(0, groups * 4)
  return chars.join('').replace(/(.{4})(?=.)/g, '$1-')
}

export function isFullCode(text: string, groups: number): boolean {
  return new RegExp(`^[${CODE_ALPHABET}]{4}(-[${CODE_ALPHABET}]{4}){${groups - 1}}$`).test(text)
}

export function linkCodeFrom(scanned: string): string | null {
  const text = scanned.trim()
  const hash = text.includes('#') ? text.slice(text.lastIndexOf('#') + 1) : text
  if (/[^A-Za-z0-9\s-]/.test(hash)) return null
  const code = cleanCode(hash, LINK_GROUPS)
  return isFullCode(code, LINK_GROUPS) && hash.replace(/[\s-]/g, '').length === LINK_GROUPS * 4 ? code : null
}

export function linkUrl(origin: string, code: string): string {
  return `${origin}${CONNECT_PATH}#${code}`
}
