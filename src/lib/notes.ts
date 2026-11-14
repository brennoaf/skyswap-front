import { createStore, del, entries, get, set } from 'idb-keyval'

export interface PrivateNote {
  postId: string
  objectId: string
  title: string
  text: string
  updatedAt: number
}

export interface LabNote {
  id: string
  objectId: string
  ra: number | null
  dec: number | null
  date: string | null
  band: string | null
  wavelength: number | null
  hypothesis: string
  text: string
  createdAt: number
}

const notesStore = () => createStore('skyswap-notes', 'notes')
const labStore = () => createStore('skyswap-lab', 'notes')

export const getNote = (postId: string) => get<PrivateNote>(postId, notesStore())
export const saveNote = (note: PrivateNote) => (note.text.trim() ? set(note.postId, note, notesStore()) : del(note.postId, notesStore()))
export const allNotes = async () => (await entries<string, PrivateNote>(notesStore())).map(([, v]) => v).sort((a, b) => b.updatedAt - a.updatedAt)

export const saveLabNote = (note: LabNote) => set(note.id, note, labStore())
export const deleteLabNote = (id: string) => del(id, labStore())
export const labNotes = async (objectId?: string) =>
  (await entries<string, LabNote>(labStore()))
    .map(([, v]) => v)
    .filter((n) => !objectId || n.objectId === objectId)
    .sort((a, b) => b.createdAt - a.createdAt)

const SEP = '\n----- SkySwap note -----\n'

export function notesToText(notes: PrivateNote[]): string {
  return notes.map((n) => [`post: ${n.postId}`, `object: ${n.objectId}`, `title: ${n.title}`, `updated: ${new Date(n.updatedAt).toISOString()}`, '', n.text].join('\n')).join(SEP)
}

export function notesFromText(text: string): PrivateNote[] {
  return text
    .split(SEP)
    .map((block) => {
      const [head, ...body] = block.replace(/^\s+/, '').split('\n\n')
      const meta = Object.fromEntries((head ?? '').split('\n').map((l) => [l.slice(0, l.indexOf(':')).trim(), l.slice(l.indexOf(':') + 1).trim()]))
      return { postId: meta.post ?? '', objectId: meta.object ?? '', title: meta.title ?? '', text: body.join('\n\n').trim(), updatedAt: Date.parse(meta.updated ?? '') || Date.now() }
    })
    .filter((n) => n.postId && n.text)
}

export function download(filename: string, content: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
