'use client'

import { useQueryClient } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'framer-motion'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { swapButton } from '@/components/classify/swap-photo'
import { KnownSheet } from '@/components/classify/swap-sheets'
import { IconCards, IconCheck } from '@/components/icons'
import { EmptyState, Sheet } from '@/components/ui/primitives'
import { api, type VoteResult } from '@/lib/api/client'
import { useCommunityOverview, useGoals, useGuideCard, type VotePosition } from '@/lib/api/hooks'
import { exploreQueue, isSkyCard } from '@/lib/explore/queue'
import { cx } from '@/lib/format'
import { useShare } from '@/lib/share'
import { useUi } from '@/lib/state/ui'
import { knownName, type Answer } from '@/lib/swap-verdict'
import type { Mark } from '../card/marks'
import { SwapCard } from '../card/swap-card'
import { STEP_BODY, STEP_TITLE, SwapHeader, SwapShell } from '../shell'
import { useSprite } from '../sprites'
import { Trained } from '../welcome/trained'
import { Welcome } from '../welcome/welcome'
import { DeckSkeleton, PauseCard, StateScreen } from './deck-states'
import { useDeckFlow, type PlayCard } from './use-deck-flow'
import { useNotices, type Strip } from './use-notices'
import { useVoteQueue } from './use-vote-queue'

const LEAVE_MS = 360
const FIRST_WAIT_MS = 3000
const PAUSE_EVERY = 25
const NO_MARKS: Mark[] = []

type Pill = { key: string; text: string; saved?: boolean; busy?: boolean; action?: string; onAction?: () => void }

let sessionLooks = 0
let fastWarned = false

export function Deck({ userId, onHelp }: { userId: string; onHelp: () => void }) {
  const t = useTranslations('classify')
  const tb = useTranslations('badges.items')
  const tcom = useTranslations('community')
  const queryClient = useQueryClient()
  const guideDone = useUi((s) => s.classifyGuideDone)
  const finishGuide = useUi((s) => s.finishClassifyGuide)
  const [phase, setPhase] = useState<'welcome' | 'lessons' | 'trained' | 'cards'>(guideDone ? 'cards' : 'welcome')
  const guideQuery = useGuideCard(!guideDone || phase !== 'cards')
  const [lessonIndex, setLessonIndex] = useState(0)
  const lessons = guideQuery.data?.lessons ?? []
  const nothingToPractice = guideQuery.isSuccess && !lessons.length
  const guideFailed = phase === 'welcome' && guideQuery.isError && !guideQuery.data
  const lesson = phase === 'lessons' ? lessons[lessonIndex] : undefined
  const guiding = !!lesson
  const flow = useDeckFlow(phase === 'cards' || nothingToPractice)
  const [pause, setPause] = useState(false)
  const [knownOpen, setKnownOpen] = useState<string | null>(null)
  const [shown, setShown] = useState<{ card: PlayCard; img: HTMLImageElement } | null>(null)
  const [openMode, setOpenMode] = useState(false)
  const [introSeen, setIntroSeen] = useState(false)
  const overview = useCommunityOverview(openMode)
  const share = useShare()
  const reduce = useReducedMotion()
  const notices = useNotices()
  const showNotices = notices.show
  useEffect(() => {
    setOpenMode(new URLSearchParams(window.location.search).has('open'))
  }, [])
  const card: PlayCard | null = lesson ? lesson.card : flow.card
  const img = useSprite(card?.sprite)
  const cardId = card?.id
  if (!lesson && card && img && shown?.card !== card) setShown({ card, img })

  const onSaved = useCallback(
    (r: VoteResult, late: boolean) => {
      const known = r.reveal.control ? null : r.reveal.known
      const strips: Strip[] = [...(known ? [{ kind: 'known' as const, name: knownName(known.name) }] : []), ...r.new_badges.map((b) => ({ kind: 'badge' as const, name: tb(`${b}.name`) }))]
      if (r.xp.reason === 'too_fast' && !late && !fastWarned) {
        fastWarned = true
        strips.push({ kind: 'fast' })
      }
      if (strips.length) showNotices(strips)
    },
    [showNotices, tb],
  )
  const votes = useVoteQueue(userId, { open: openMode, onSaved })

  useEffect(() => {
    if (cardId && !lesson) void api.POST('/api/classify/shown', { body: { card_id: cardId } }).catch(() => null)
  }, [cardId, lesson])

  const shownAt = useRef<{ id: string; at: number } | null>(null)
  useEffect(() => {
    if (cardId && img && !lesson && shownAt.current?.id !== cardId) shownAt.current = { id: cardId, at: Date.now() }
  }, [cardId, img, lesson])

  const { prepare } = flow
  useEffect(() => {
    if (!cardId || guiding || (phase !== 'cards' && !nothingToPractice)) return
    prepare([cardId])
  }, [cardId, guiding, nothingToPractice, phase, prepare])

  useEffect(() => {
    exploreQueue.start({ user: userId, queryClient })
    return () => exploreQueue.stop()
  }, [queryClient, userId])

  const answered = useRef(new Set<string>())
  const flowCard = flow.card
  useEffect(() => {
    if (!isSkyCard(flowCard)) return
    exploreQueue.claim(flowCard)
    const done = answered.current
    return () => {
      if (done.has(flowCard.id)) exploreQueue.release(flowCard)
      else exploreQueue.giveBack(flowCard)
    }
  }, [flowCard])

  const endGuide = useCallback(() => {
    finishGuide()
    setPhase('trained')
  }, [finishGuide])

  useEffect(() => {
    if (phase !== 'cards' && nothingToPractice) {
      finishGuide()
      setPhase('cards')
    }
  }, [finishGuide, nothingToPractice, phase])

  const advance = useCallback(() => {
    if (!card) return
    sessionLooks++
    const after = (go: () => void) => {
      if (reduce) go()
      else setTimeout(go, LEAVE_MS)
    }
    if (sessionLooks % PAUSE_EVERY === 0) {
      after(() => setPause(true))
      return
    }
    after(() => void flow.reload([card.id]))
  }, [card, flow, reduce])

  const { submit } = votes
  const onAnswer = useCallback(
    async (answer: Answer, spot: VotePosition | null, at: number, hints: boolean) => {
      if (!card) return false
      answered.current.add(card.id)
      const seen = shownAt.current?.id === card.id ? shownAt.current.at : null
      const sent = submit({ card, answer, spot, at, shownAt: seen, hints })
      if (answer === 'moves') {
        const outcome = await Promise.race([sent, new Promise<null>((resolve) => setTimeout(() => resolve(null), FIRST_WAIT_MS))])
        if (outcome?.kind === 'saved' && outcome.result.first) return true
      }
      advance()
      return false
    },
    [advance, card, submit],
  )

  const nextLesson = useCallback(() => {
    if (lessonIndex + 1 < lessons.length) setLessonIndex(lessonIndex + 1)
    else endGuide()
  }, [endGuide, lessonIndex, lessons.length])

  const strip = notices.strip
  const retryPill = { action: t('retry'), onAction: () => void votes.retry() }
  const pill: Pill | null =
    votes.save === 'pending'
      ? { key: 'save', text: t('confirm.saving'), busy: true }
      : votes.save === 'failed'
        ? { key: 'failed', text: t('failed'), ...retryPill }
        : votes.save === 'lost'
          ? { key: 'lost', text: t('failed') }
          : votes.save === 'saved'
            ? { key: 'save', text: t('confirm.saved'), saved: true }
            : strip?.kind === 'known'
              ? { key: `known-${strip.name}`, text: t('strip.known', { name: strip.name }), action: t('strip.see'), onAction: () => setKnownOpen(strip.name) }
              : strip?.kind === 'badge'
                ? { key: `badge-${strip.name}`, text: t('strip.badge', { name: strip.name }) }
                : strip?.kind === 'fast'
                  ? { key: 'fast', text: t('strip.fast') }
                  : null
  const noticeView = pill && !openMode && (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+28px)] z-[46] mx-auto flex max-w-[var(--width-app)] justify-center px-3">
      <motion.div
        key={pill.key}
        role="status"
        aria-busy={pill.busy || undefined}
        initial={reduce ? false : { y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 420, damping: 22 }}
        className="pointer-events-auto flex min-h-10 items-center gap-2 rounded-full bg-text py-1.5 pl-4 pr-1.5 text-ui font-semibold leading-tight text-bg shadow-[0_8px_24px_rgb(0_0_0/0.25)]"
        data-testid={pill.saved ? 'saved-pill' : pill.busy ? 'saving-pill' : 'swap-strip'}
        data-save={votes.save}
      >
        {pill.saved && <IconCheck size={18} className="shrink-0" />}
        {pill.busy && <span aria-hidden="true" className={cx('size-3.5 shrink-0 rounded-full border-2 border-bg border-t-transparent', !reduce && 'animate-spin')} />}
        <span className={cx('min-w-0', !pill.action && 'pr-2.5')}>{pill.text}</span>
        {pill.action && (
          <button type="button" onClick={pill.onAction} className="h-8 shrink-0 rounded-full bg-bg px-3 text-ui font-semibold text-text">
            {pill.action}
          </button>
        )}
      </motion.div>
    </div>
  )

  const known = <KnownSheet name={knownOpen} onClose={() => setKnownOpen(null)} />

  const plain = (body: ReactNode) => (
    <SwapShell>
      <SwapHeader onHelp={onHelp} />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{body}</div>
      {known}
      {noticeView}
    </SwapShell>
  )
  const left = openMode ? overview.data?.open_cards : undefined
  const openDone = openMode && !lesson && left === 0
  const goals = useGoals(openDone)

  if (phase === 'trained') return <Trained onStart={() => setPhase('cards')} />
  if (guideFailed) return <StateScreen kind="failed" busy={guideQuery.isFetching} onRetry={() => void guideQuery.refetch()} onHelp={onHelp} />
  if (phase === 'welcome' && lessons[0])
    return (
      <Welcome
        lesson={lessons[0]}
        examples={guideQuery.data?.examples ?? []}
        count={lessons.length}
        onStart={() => setPhase('lessons')}
        onSkip={() => {
          finishGuide()
          setPhase('cards')
        }}
      />
    )
  if (pause)
    return plain(
      <div className="px-4 pb-4">
        <PauseCard
          looks={sessionLooks}
          onContinue={() => {
            setPause(false)
            void flow.reload([])
          }}
        />
      </div>,
    )
  if (phase === 'welcome' && !nothingToPractice) return <DeckSkeleton onHelp={onHelp} />
  const holding = !guiding && !!shown && (flow.status === 'loading' || (flow.status === 'ready' && !img))
  if (!guiding && flow.status === 'searching') return <DeckSkeleton onHelp={onHelp} line={t('searching')} notice={noticeView} />
  if (!guiding && flow.status === 'loading' && !holding) return <DeckSkeleton onHelp={onHelp} notice={noticeView} />
  if (!guiding && (flow.status === 'error' || flow.status === 'slow'))
    return (
      <>
        <StateScreen kind={flow.status === 'slow' ? 'slow' : 'failed'} onRetry={() => void flow.reload()} onHelp={onHelp} />
        {noticeView}
      </>
    )
  if (!card && !holding) return plain(<EmptyState art={<IconCards size={56} className="text-accent" />} title={t('done')} body={t('doneBody')} />)
  const view = holding && shown ? shown : card ? { card, img } : null
  if (!view) return null
  const goal = goals.data?.find((g) => g.key === 'classifications')
  if (openDone)
    return (
      <SwapShell>
        <div className="flex min-h-0 flex-1 flex-col" data-testid="open-done">
          <div className="flex min-h-0 flex-1 overflow-y-auto px-5 py-6">
            <div className="m-auto w-full text-center">
              <h1 className={`${STEP_TITLE} text-display`}>{t('open.doneTitle')}</h1>
              {goal && <p className={`${STEP_BODY} mt-3`}>{tcom('goalLine', { count: goal.count, target: goal.target })}</p>}
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-2 px-5 pb-4">
            <button
              type="button"
              onClick={() => {
                window.history.replaceState(window.history.state, '', '/classify')
                setOpenMode(false)
              }}
              className={`${swapButton.primary} w-full flex-none`}
            >
              {t('open.more')}
            </button>
            <Link href="/community" className={`${swapButton.big} w-full flex-none`}>
              {t('open.back')}
            </Link>
          </div>
        </div>
      </SwapShell>
    )
  const openTop =
    openMode && !lesson && left !== undefined ? (
      <p role="status" className="flex items-center justify-center gap-1 text-ui font-semibold leading-tight text-accent" data-testid="open-line">
        {pill?.saved ? <IconCheck size={16} className="shrink-0" /> : <IconCards size={16} className="shrink-0" />}
        <motion.span key={pill?.key ?? left} initial={reduce ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="min-w-0 truncate">
          {pill ? pill.text : t('open.line', { n: left })}
        </motion.span>
        {pill?.action && (
          <button type="button" onClick={pill.onAction} className="pointer-events-auto shrink-0 underline underline-offset-2">
            {pill.action}
          </button>
        )}
      </p>
    ) : null
  const shareCard = !lesson && !isSkyCard(view.card) ? () => void share({ title: t('share.title'), path: `/classify?card=${view.card.id}` }) : undefined

  return (
    <>
      <SwapCard
        key={view.card.id}
        card={view.card}
        img={view.img}
        step={lesson ? t('guide.step', { n: lessonIndex + 1, total: lessons.length }) : null}
        lesson={lesson?.lesson ?? null}
        lessonMarks={lesson?.marks ?? NO_MARKS}
        lastLesson={!!lesson && lessonIndex + 1 === lessons.length}
        firstLesson={!!lesson && lessonIndex === 0}
        top={openTop}
        leave={openMode ? '/community' : '/'}
        past={!lesson && view.card === flow.card ? flow.past : null}
        onHelp={onHelp}
        onAnswer={onAnswer}
        onNoteDone={advance}
        onShare={shareCard}
        onSkip={() => void flow.reload([view.card.id])}
        onLessonStale={nextLesson}
        onLessonNext={nextLesson}
      />
      {known}
      {noticeView}
      {openMode && !lesson && !introSeen && !!left && (
        <Sheet open onClose={() => setIntroSeen(true)} labelledBy="open-intro-title">
          <div className="flex flex-col px-4 pb-1 pt-2" data-testid="open-intro">
            <div className="flex items-center gap-3.5">
              <span className="grid size-[52px] shrink-0 place-items-center rounded-full bg-accent text-on-accent">
                <IconCards size={28} />
              </span>
              <h2 id="open-intro-title" className="min-w-0 text-title-lg font-bold leading-tight tracking-[-0.01em]">
                {t('open.title')}
              </h2>
            </div>
            <p className="mt-3.5 text-title-sm leading-[1.4] text-text-secondary">{t('open.body', { n: overview.data?.close_votes ?? 0 })}</p>
            <p className="mt-3 text-title-sm font-semibold leading-snug text-accent">{t('open.left', { n: left })}</p>
            <button type="button" onClick={() => setIntroSeen(true)} className="mt-4 flex h-[54px] w-full items-center justify-center rounded-2xl bg-accent text-[17px] font-semibold text-on-accent active:bg-accent-pressed">
              {t('open.start')}
            </button>
          </div>
        </Sheet>
      )}
    </>
  )
}
