'use client'

import { animate, useMotionValue, useReducedMotion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from 'react'
import { useOffsetLabel } from '@/components/classify/photo-viewer'
import { AnswerPanel, FrameBars, PhotoBar, SwapStage, SWIPE, swapButton, ToolsPanel, ToolsStrip } from '@/components/classify/swap-photo'
import { PhotoSourceSheet, UnderstandSheet } from '@/components/classify/swap-sheets'
import { VoiceMark } from '@/components/classify/voices'
import { IconTarget } from '@/components/icons'
import { usePlayback } from '@/components/player/use-playback'
import { ScreenTour } from '@/components/shell/onboarding'
import { ApiError, type DeckCard, type VoteResult } from '@/lib/api/client'
import { useVote, type VotePosition } from '@/lib/api/hooks'
import { isSkyCard, type SkyPlayCard } from '@/lib/explore/queue'
import { cx } from '@/lib/format'
import { useUi } from '@/lib/state/ui'
import { verdictOf, type Answer } from '@/lib/swap-verdict'
import { SwapHeader, SwapShell } from '../shell'
import { cardReducer, initCard, isDeciding, isLooking, isMarking, isSheetOpen, type CardAction, type CardState } from './card-machine'
import { GuideRing, HintRings, SpotMark, useHintLine, useOutside, type Mark } from './marks'
import { ConfirmSheet, FailedSheet, NotePhase, ResultSheet } from './sheets'

export type PlayCard = DeckCard | SkyPlayCard
export type Lesson = 'moves' | 'still' | 'glitch'

const FRAME_MS = 700
const SWING_PX = 64
const SWING_S = 1.3
const SWING_WAIT_MS = 2500
const SWAP_TOUR_TIP = 'swapTour'
const BLACK_EDGE_TIP = 'blackEdge'

const reducer = (s: CardState<VoteResult>, a: CardAction<VoteResult>) => cardReducer(s, a)

export function SwapCard({
  card,
  img,
  step,
  lesson,
  lessonMarks,
  lastLesson,
  firstLesson,
  top,
  leave,
  past,
  onHelp,
  onAnswer,
  onNoteDone,
  onShare,
  onSkip,
  onLessonStale,
  onLessonNext,
}: {
  card: PlayCard
  img: HTMLImageElement | null
  step: string | null
  lesson: Lesson | null
  lessonMarks: Mark[]
  lastLesson: boolean
  firstLesson: boolean
  top?: ReactNode
  leave?: string
  past?: Answer | null
  onHelp: () => void
  onShare?: () => void
  onSkip?: () => void
  onAnswer: (answer: Answer, spot: VotePosition | null, at: number, hints: boolean) => Promise<boolean>
  onNoteDone: () => void
  onLessonStale: () => void
  onLessonNext: () => void
}) {
  const t = useTranslations('classify')
  const tw = useTranslations('classify.welcome')
  const tp = useTranslations('player')
  const label = useOffsetLabel()
  const reduce = useReducedMotion()
  const vote = useVote()
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const [state, dispatch] = useReducer(reducer, past, initCard<VoteResult>)
  const { mode, answer, spot, saved, leaving, row } = state
  const sentOnce = useRef(false)
  const [frozen, setFrozen] = useState(false)
  const [swingOver, setSwingOver] = useState(false)
  const [blackNote, setBlackNote] = useState(false)
  const sky = isSkyCard(card) ? card : null
  const offsets = card.offsets_s
  const n = Math.max(1, offsets.length)
  const playback = usePlayback(n, { baseMs: FRAME_MS, autoplay: !reduce || !!lesson, frozen })
  const panel = playback.index
  const { setPlaying, stopBlink } = playback
  const hints = sky && state.hintsOn ? sky.hints : null
  const outside = useOutside(img, n)
  const blackSeen = useUi((s) => s.tipsSeen.includes(BLACK_EDGE_TIP))
  const markTip = useUi((s) => s.markTip)
  const tourSeen = useUi((s) => s.tipsSeen.includes(SWAP_TOUR_TIP))
  const touring = firstLesson && !tourSeen && !!img
  const hintLine = useHintLine(hints, panel)
  const verdict = lesson && saved && answer ? verdictOf(saved.reveal, answer, true) : null

  const settle = useCallback(() => {
    animate(x, 0, { type: 'spring', stiffness: 500, damping: 32 })
    animate(y, 0, { type: 'spring', stiffness: 500, damping: 32 })
  }, [x, y])

  const undoChoice = () => {
    settle()
    dispatch({ type: 'undo' })
    setPlaying(!reduce || !!lesson)
  }

  const sendLesson = useCallback(
    async (a: Answer) => {
      dispatch({ type: 'sending' })
      try {
        const result = await vote.mutateAsync({ card_id: card.id, choice: a === 'glitch' ? 'still' : a, ...(a === 'glitch' ? { glitch: true } : {}) })
        dispatch({ type: 'saved', result })
        setPlaying(true)
      } catch (err) {
        if (err instanceof ApiError && (err.code === 'already_voted' || err.code === 'card_not_issued')) {
          onLessonStale()
          return
        }
        dispatch({ type: 'failed' })
      }
    },
    [card.id, onLessonStale, setPlaying, vote],
  )

  useEffect(() => {
    if (mode !== 'tools') stopBlink()
  }, [mode, stopBlink])

  const choose = (a: Answer) => {
    if (!img || !isLooking(state)) return
    settle()
    dispatch({ type: 'choose', answer: a, at: performance.now(), lesson: !!lesson })
    if (lesson && saved) setPlaying(true)
  }

  const confirm = () => {
    if (!answer || mode !== 'confirm' || sentOnce.current) return
    if (lesson) {
      void sendLesson(answer)
      return
    }
    sentOnce.current = true
    dispatch({ type: 'sent' })
    if (answer !== 'moves') {
      void onAnswer(answer, null, state.chosenAt, state.hintsUsed)
      return
    }
    void onAnswer(answer, spot, state.chosenAt, state.hintsUsed).then((first) => dispatch({ type: 'first', first }))
  }

  useEffect(() => {
    if (lesson || !outside[panel] || blackSeen) return
    setBlackNote(true)
    markTip(BLACK_EDGE_TIP)
  }, [blackSeen, lesson, markTip, outside, panel])

  const looking = isLooking(state)
  const mustLookFirst = lesson === 'moves' && !state.sawIt && !state.retry
  const canSwipe = looking && !!img && !mustLookFirst && !touring
  const swinging = !!lesson && !reduce && !swingOver && mode === 'look' && !!img && !mustLookFirst && !touring

  useEffect(() => {
    if (!swinging) return
    let side = -1
    let timer: ReturnType<typeof setTimeout> | undefined
    let move: ReturnType<typeof animate> | undefined
    const queue = () => {
      timer = setTimeout(() => {
        const to = side * SWING_PX
        move = animate(x, [0, to, to, 0], {
          duration: SWING_S,
          times: [0, 0.35, 0.65, 1],
          ease: 'easeInOut',
          onComplete: () => {
            side = -side
            queue()
          },
        })
      }, SWING_WAIT_MS)
    }
    queue()
    const stop = () => setSwingOver(true)
    window.addEventListener('pointerdown', stop, { capture: true })
    return () => {
      clearTimeout(timer)
      move?.stop()
      window.removeEventListener('pointerdown', stop, { capture: true })
      settle()
    }
  }, [settle, swinging, x])

  const onRelease = (dx: number, dy: number, vx: number, vy: number) => {
    const sideways = Math.abs(dx) >= Math.abs(dy)
    if (sideways && (dx > SWIPE || vx > 700)) choose('moves')
    else if (sideways && (dx < -SWIPE || vx < -700)) choose('still')
    else if (!sideways && (dy < -SWIPE || vy < -700)) choose('unsure')
    else settle()
  }

  const marking = isMarking(state, !!lesson)
  const onTap = (u: number, v: number) => {
    if (marking) {
      dispatch({ type: 'mark', lesson: false, spot: { frame: panel, x: Math.round(u * 1e4) / 1e4, y: Math.round(v * 1e4) / 1e4 } })
      setPlaying(false)
    } else if (looking || mode === 'result' || mode === 'confirm') setPlaying(!playback.playing)
  }

  const mark = saved?.reveal.marks[panel]
  const ringOn = looking && (lesson === 'glitch' || (lesson === 'moves' && (state.shownIt || state.retry)))
  const overlay = (
    <>
      {ringOn && <GuideRing mark={lessonMarks[panel] ?? lessonMarks[0]} />}
      {hints && <HintRings hints={hints} panel={panel} />}
      {mode === 'result' && mark && verdict?.mark && <VoiceMark voice="known" u={mark.u} v={mark.v} />}
      {spot && <SpotMark u={spot.x} v={spot.y} faint={spot.frame !== panel} />}
    </>
  )

  const labels = { still: t('still'), moves: t('moves'), glitch: t('glitch'), unsure: t('unsure') }
  const note = hintLine ?? (blackNote && outside[panel] ? tp('outside') : null)

  const deciding = isDeciding(state)
  const sheetOpen = isSheetOpen(state)
  const dim = cx('shrink-0 transition-opacity duration-200', sheetOpen && 'pointer-events-none opacity-30')
  const topDim = cx('shrink-0 transition-opacity duration-200', (sheetOpen || mode === 'tools') && 'pointer-events-none opacity-30')
  const coach = lesson ? (mustLookFirst ? t('guide.look') : lesson === 'moves' ? t('guide.answer') : t(`guide.${lesson}`)) : null

  return (
    <SwapShell>
      <div className={topDim} inert={sheetOpen || mode === 'tools' || undefined}>
        <div className="px-1 pt-2.5">
          <FrameBars n={n} index={panel} />
        </div>
        <SwapHeader step={step} top={marking ? null : top} leave={leave} onHelp={onHelp} />
      </div>
      {marking && (
        <p role="status" aria-live="polite" className="pointer-events-none absolute inset-x-14 top-[calc(env(safe-area-inset-top)+22px)] z-30 flex h-[52px] items-center justify-center gap-2 whitespace-nowrap text-title-sm font-semibold leading-tight" data-testid="mark-hint">
          <IconTarget size={22} className="shrink-0 text-accent" />
          {spot ? t('mark.marked') : t('mark.where')}
        </p>
      )}
      <SwapStage
        img={img}
        sprite={card.sprite}
        panel={panel}
        row={row}
        alt={t('photoAlt', { n: panel + 1, total: n, when: label(offsets[panel] ?? 0) })}
        x={x}
        y={y}
        canSwipe={canSwipe}
        doubleTap={!marking}
        onRelease={onRelease}
        onCancel={settle}
        onTap={onTap}
        onHold={setFrozen}
        overlay={overlay}
        hint={swinging}
        ring={deciding && !leaving ? (answer === 'moves' ? 'yes' : 'chosen') : 'rest'}
        leaving={leaving}
      />
      {mode === 'tools' ? (
        <div className="flex min-h-0 flex-1 flex-col" data-testid="swap-lower">
          <PhotoBar playback={playback} offsets={offsets} open strip={<ToolsStrip playback={playback} sprite={card.sprite} offsets={offsets} row={row} />} onTools={() => dispatch({ type: 'tools', open: false })} />
          <ToolsPanel playback={playback} row={row} onRow={(next) => dispatch({ type: 'row', row: next })} hints={sky ? { on: state.hintsOn, onChange: (on) => dispatch({ type: 'hints', on }) } : undefined} />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-testid="swap-lower">
          <div className={dim} inert={sheetOpen || undefined}>
            <PhotoBar playback={playback} offsets={offsets} onTools={() => dispatch({ type: 'tools', open: true })} />
          </div>
          <div className="min-h-0 flex-1" />
          <div className={cx('shrink-0 px-4 transition-[transform,opacity] duration-300', lesson ? 'pb-4' : 'pb-5', sheetOpen && 'pointer-events-none translate-y-6 opacity-0')} inert={sheetOpen || undefined} data-testid="swap-ask">
            <h1 className={coach || note ? 'sr-only' : 'mb-[18px] text-center text-title-lg font-bold leading-tight tracking-[-0.01em]'}>{t('question')}</h1>
            {coach ? (
              <p role="note" className="mb-3 text-center text-title-sm font-semibold leading-snug [text-wrap:balance]">
                {coach}
              </p>
            ) : (
              note && (
                <p role="status" className="mb-[18px] text-center text-ui leading-snug text-text-secondary [text-wrap:balance]">
                  {note}
                </p>
              )
            )}
            {lesson && mustLookFirst && !touring ? (
              <div className="flex flex-col gap-2">
                <button type="button" onClick={() => dispatch({ type: 'saw' })} className={`${swapButton.primary} flex-none`}>
                  {t('guide.saw')}
                </button>
                <button type="button" disabled={state.shownIt} onClick={() => dispatch({ type: 'show' })} className={`${swapButton.mid} flex-none`}>
                  {state.shownIt ? t('guide.shown') : t('guide.show')}
                </button>
              </div>
            ) : (
              <AnswerPanel labels={labels} disabled={!img || sheetOpen} x={x} y={y} onChoose={choose} />
            )}
          </div>
        </div>
      )}
      {mode === 'noting' && !leaving && (
        <NotePhase
          cardId={card.id}
          onDone={() => {
            dispatch({ type: 'noted' })
            onNoteDone()
          }}
        />
      )}
      {deciding && mode !== 'noting' && answer && !leaving && (
        <ConfirmSheet card={card} answer={answer} busy={mode !== 'confirm'} past={mode === 'past'} marking={marking} onUndo={undoChoice} onConfirm={confirm} onAbout={() => dispatch({ type: 'sheet', sheet: 'about' })} onShare={onShare} onSkip={() => onSkip?.()} />
      )}
      {mode === 'failed' && answer && <FailedSheet onRetry={() => void sendLesson(answer)} onUndo={undoChoice} />}
      {mode === 'result' && saved && answer && verdict && (
        <ResultSheet verdict={verdict} last={lastLesson} onAgain={() => dispatch({ type: 'again' })} onUnderstand={() => dispatch({ type: 'sheet', sheet: 'understand' })} onNext={onLessonNext} />
      )}
      <PhotoSourceSheet open={state.sheet === 'about'} onClose={() => dispatch({ type: 'sheet', sheet: null })} offsets={offsets} sky={sky} />
      {saved && answer && verdict && <UnderstandSheet open={state.sheet === 'understand'} onClose={() => dispatch({ type: 'sheet', sheet: null })} reveal={saved.reveal} answer={answer} verdict={verdict} />}
      {touring && (
        <ScreenTour
          steps={[
            { id: 'photo', target: 'swap-photo', text: t('tour.photo') },
            { id: 'play', target: 'swap-play', text: t('tour.play') },
            { id: 'tools', target: 'swap-tools', text: t('tour.tools') },
            { id: 'answers', target: 'swap-answers', text: t('tour.answers') },
          ]}
          labels={{ skip: tw('skip'), back: tw('back'), next: tw('next') }}
          onClose={() => markTip(SWAP_TOUR_TIP)}
        />
      )}
    </SwapShell>
  )
}
