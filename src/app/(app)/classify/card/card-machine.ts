import type { Answer } from '@/lib/swap-verdict'

export type CardMode = 'look' | 'tools' | 'confirm' | 'sending' | 'sent' | 'noting' | 'past' | 'failed' | 'result'
export type CardSpot = { frame: number; x: number; y: number }
export type CardSheet = 'about' | 'understand' | null

export type CardState<R> = {
  mode: CardMode
  answer: Answer | null
  spot: CardSpot | null
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
  | { type: 'choose'; answer: Answer; at: number; lesson: boolean }
  | { type: 'undo' }
  | { type: 'tools'; open: boolean }
  | { type: 'mark'; spot: CardSpot; lesson: boolean }
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
  return { mode: past ? 'past' : 'look', answer: past ?? null, spot: null, chosenAt: 0, saved: null, leaving: null, row: 0, retry: false, sawIt: false, shownIt: false, hintsOn: false, hintsUsed: false, sheet: null }
}

const CAN_CHOOSE: CardMode[] = ['look', 'tools', 'confirm']

export function cardReducer<R>(s: CardState<R>, a: CardAction<R>): CardState<R> {
  switch (a.type) {
    case 'choose':
      if (!CAN_CHOOSE.includes(s.mode)) return s
      if (a.lesson && s.saved) return { ...s, row: 0, spot: null, answer: a.answer, mode: 'result' }
      return { ...s, row: 0, spot: null, answer: a.answer, chosenAt: s.mode === 'confirm' ? s.chosenAt : a.at, mode: 'confirm' }
    case 'undo':
      return s.mode === 'confirm' || s.mode === 'failed' ? { ...s, answer: null, spot: null, mode: 'look' } : s
    case 'tools':
      if (a.open) return s.mode === 'look' ? { ...s, mode: 'tools' } : s
      return s.mode === 'tools' ? { ...s, mode: 'look' } : s
    case 'mark':
      return isMarking(s, a.lesson) ? { ...s, spot: a.spot } : s
    case 'sending':
      return s.answer && (s.mode === 'confirm' || s.mode === 'failed') ? { ...s, mode: 'sending' } : s
    case 'sent':
      if (s.mode !== 'confirm' || !s.answer) return s
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
      return s.mode === 'result' ? { ...s, retry: true, answer: null, spot: null, mode: 'look' } : s
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

export const isDeciding = (s: Pick<CardState<unknown>, 'mode' | 'answer'>) => !!s.answer && (s.mode === 'confirm' || s.mode === 'sending' || s.mode === 'sent' || s.mode === 'noting' || s.mode === 'past')

export const isSheetOpen = (s: Pick<CardState<unknown>, 'mode' | 'answer'>) => isDeciding(s) || s.mode === 'result' || s.mode === 'failed'

export const isMarking = (s: Pick<CardState<unknown>, 'mode' | 'answer'>, lesson: boolean) => !lesson && s.mode === 'confirm' && s.answer === 'moves'
