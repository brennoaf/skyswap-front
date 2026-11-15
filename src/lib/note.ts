export const NOTE_MAX = 140

const LINK = /https?:|www\.|@|\b[\w-]+\.(com|net|org|br|io|gov|edu|info|me|app|dev|co|xyz|ly|gg|tv|site|online)\b/i
const WORD = /[\p{L}\p{N}]/u

export function cleanNote(raw: string): string | null | 'invalid' {
  const text = raw.replace(/\s+/g, ' ').trim()
  if (!text) return null
  if ([...text].length > NOTE_MAX || LINK.test(text) || !WORD.test(text)) return 'invalid'
  return text
}
