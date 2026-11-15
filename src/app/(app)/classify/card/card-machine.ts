import type { Answer } from '@/lib/swap-verdict'

export type CardMode = 'look' | 'tools' | 'confirm' | 'tracing' | 'review' | 'sending' | 'sent' | 'noting' | 'past' | 'failed' | 'result'
export type TraceMark = { x: number; y: number; ax: number; ay: number }
export type CardSheet = 'about' | 'understand' | null

export const MIN_TRACE_MARKS = 2

export type CardState<R> = {
  mode: CardMode
  answer: Answer | null
  marks: (TraceMark | null | undefined)[]
  at: number
  chosenAt: number
  saved: R | null
  leaving: Answer | null
  row: 0 | 1
  retry: boolean
  sawIt: boolean
  shownIt: boolean
  hintsOn: boolean
  hintsUsed: boolean
  sheet: CardSheet
}

export type CardAction<R> =
  | { type: 'choose'; answer: Answer; at: number; lesson: boolean; frames?: number }
  | { type: 'undo' }
  | { type: 'tools'; open: boolean }
  | { type: 'trace'; mark: TraceMark | null }
  | { type: 'retrace'; frame: number }
  | { type: 'redo' }
  | { type: 'sending' }
  | { type: 'sent' }
  | { type: 'first'; first: boolean }
  | { type: 'noted' }
  | { type: 'saved'; result: R }
  | { type: 'failed' }
  | { type: 'again' }
  | { type: 'saw' }
  | { type: 'show' }
  | { type: 'row'; row: 0 | 1 }
  | { type: 'hints'; on: boolean }
  | { type: 'sheet'; sheet: CardSheet }

export function initCard<R>(past: Answer | null | undefined): CardState<R> {
  return { mode: past ? 'past' : 'look', answer: past ?? null, marks: [], at: 0, chosenAt: 0, saved: null, leaving: null, row: 0, retry: false, sawIt: false, shownIt: false, hintsOn: false, hintsUsed: false, sheet: null }
}

const CAN_CHOOSE: CardMode[] = ['look', 'tools', 'confirm']

export const markedCount = (marks: CardState<unknown>['marks']) => marks.filter(Boolean).length

export function cardReducer<R>(s: CardState<R>, a: CardAction<R>): CardState<R> {
  switch (a.type) {
    case 'choose':
      if (!CAN_CHOOSE.includes(s.mode)) return s
      if (a.lesson && s.saved) return { ...s, row: 0, marks: [], answer: a.answer, mode: 'result' }
      if (a.answer === 'moves' && !a.lesson && (a.frames ?? 0) >= MIN_TRACE_MARKS) return { ...s, row: 0, answer: 'moves', marks: Array.from({ length: a.frames ?? 0 }, () => undefined), at: 0, chosenAt: s.mode === 'confirm' ? s.chosenAt : a.at, mode: 'tracing' }
      return { ...s, row: 0, marks: [], answer: a.answer, chosenAt: s.mode === 'confirm' ? s.chosenAt : a.at, mode: 'confirm' }
    case 'undo':
      return s.mode === 'confirm' || s.mode === 'failed' || s.mode === 'tracing' || s.mode === 'review' ? { ...s, answer: null, marks: [], at: 0, mode: 'look' } : s
    case 'tools':
      if (a.open) return s.mode === 'look' ? { ...s, mode: 'tools' } : s
      return s.mode === 'tools' ? { ...s, mode: 'look' } : s
    case 'trace': {
      if (s.mode !== 'tracing') return s
      const marks = s.marks.map((m, i) => (i === s.at ? a.mark : m))
      const next = marks.findIndex((m, i) => i > s.at && m === undefined)
      return next < 0 ? { ...s, marks, mode: 'review' } : { ...s, marks, at: next }
    }
    case 'retrace':
      return s.mode === 'review' && a.frame >= 0 && a.frame < s.marks.length ? { ...s, marks: s.marks.map((m, i) => (i === a.frame ? undefined : m)), at: a.frame, mode: 'tracing' } : s
    case 'redo':
      return s.mode === 'review' ? { ...s, marks: s.marks.map(() => undefined), at: 0, mode: 'tracing' } : s
    case 'sending':
      return s.answer && (s.mode === 'confirm' || s.mode === 'failed') ? { ...s, mode: 'sending' } : s
    case 'sent':
      if (!s.answer || (s.mode !== 'confirm' && s.mode !== 'review')) return s
      if (s.mode === 'review' && markedCount(s.marks) < MIN_TRACE_MARKS) return s
      return { ...s, mode: 'sent', leaving: s.answer === 'moves' ? null : s.answer }
    case 'first':
      if (s.mode !== 'sent') return s
      return a.first ? { ...s, mode: 'noting' } : { ...s, leaving: s.answer }
    case 'noted':
      return s.mode === 'noting' ? { ...s, leaving: 'moves' } : s
    case 'saved':
      return s.mode === 'sending' ? { ...s, saved: a.result, mode: 'result' } : s
    case 'failed':
      return s.mode === 'sending' ? { ...s, mode: 'failed' } : s
    case 'again':
      return s.mode === 'result' ? { ...s, retry: true, answer: null, marks: [], mode: 'look' } : s
    case 'saw':
      return { ...s, sawIt: true, shownIt: false }
    case 'show':
      return { ...s, shownIt: true }
    case 'row':
      return { ...s, row: a.row }
    case 'hints':
      return { ...s, hintsOn: a.on, hintsUsed: s.hintsUsed || a.on }
    case 'sheet':
      return { ...s, sheet: a.sheet }
  }
}

export const isLooking = (s: Pick<CardState<unknown>, 'mode'>) => s.mode === 'look' || s.mode === 'tools'

export const isTracing = (s: Pick<CardState<unknown>, 'mode'>) => s.mode === 'tracing' || s.mode === 'review'

export const isDeciding = (s: Pick<CardState<unknown>, 'mode' | 'answer'>) => !!s.answer && (s.mode === 'confirm' || s.mode === 'sending' || s.mode === 'sent' || s.mode === 'noting' || s.mode === 'past')

export const isSheetOpen = (s: Pick<CardState<unknown>, 'mode' | 'answer'>) => isDeciding(s) || s.mode === 'result' || s.mode === 'failed'

export function tracePositions(marks: CardState<unknown>['marks']): ({ frame: number; x: number; y: number; ax: number; ay: number } | null)[] {
  return marks.map((m, frame) => (m ? { frame, ...m } : null))
}
