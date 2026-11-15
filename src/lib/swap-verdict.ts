export type Answer = 'moves' | 'still' | 'unsure' | 'glitch'
export type Truth = 'moves' | 'glitch' | 'still'

type RevealFacts = {
  control: { truth: string } | null
  kind: string
  known: { name: string } | null
}

export type Verdict = {
  truth: Truth
  title: string
  name: string | null
  body: string
  mark: boolean
  again: boolean
  why: string
}

const KNOWN_NAMES: Record<string, string> = { '433': '433 Eros' }

export const knownName = (name: string) => KNOWN_NAMES[name] ?? name

export function truthOf(reveal: Pick<RevealFacts, 'control' | 'kind'>): Truth | null {
  if (!reveal.control) return null
  if (reveal.control.truth === 'real') return 'moves'
  return reveal.kind === 'single' || reveal.kind === 'trail' ? 'glitch' : 'still'
}

export function verdictOf(reveal: RevealFacts, answer: Answer, lesson: boolean): Verdict | null {
  const truth = truthOf(reveal)
  if (truth === 'moves') {
    const ok = answer === 'moves'
    const name = reveal.known ? knownName(reveal.known.name) : null
    return { truth, title: `moves${ok ? 'Ok' : 'Wrong'}${name ? '' : 'Plain'}`, name, body: ok ? 'bodyMovesOk' : 'bodyMovesWrong', mark: true, again: lesson && !ok, why: 'whyMoves' }
  }
  if (truth === 'glitch') {
    const ok = answer === 'glitch'
    const near = answer === 'still'
    return { truth, title: ok ? 'defectOk' : near ? 'defectNear' : 'defectWrong', name: null, body: reveal.kind === 'trail' ? 'bodyTrail' : 'bodyDefect', mark: false, again: lesson && !ok && !near, why: 'whyDefect' }
  }
  if (truth === 'still') {
    const ok = answer === 'still'
    return { truth, title: ok ? 'stillOk' : 'stillWrong', name: null, body: 'bodyStill', mark: false, again: lesson && !ok && answer !== 'unsure', why: 'whyStill' }
  }
  return null
}

export const TRUTH_WORD: Record<Truth, string> = { moves: 'truthMoves', glitch: 'truthDefect', still: 'truthStill' }
