'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ANSWER_ICONS, swapButton } from '@/components/classify/swap-photo'
import { IconInfo, IconShare, IconTarget, IconUndo } from '@/components/icons'
import { IconButton, useModal } from '@/components/ui/primitives'
import { api, unwrap, type DeckCard } from '@/lib/api/client'
import { isSkyCard, type SkyPlayCard } from '@/lib/explore/queue'
import { cx, formatDate } from '@/lib/format'
import { cleanNote, NOTE_MAX } from '@/lib/note'
import type { Answer, Verdict } from '@/lib/swap-verdict'
import { useFmt } from '@/lib/use-fmt'

type PlayCard = DeckCard | SkyPlayCard

const SHEET_MAX = 'max-h-[calc(100dvh-80px-var(--swap-photo)-env(safe-area-inset-top))]'
const noop = () => undefined

function useKeyboardInset() {
  const [inset, setInset] = useState(0)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)))
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])
  return inset
}

export function BottomSheet({ children, label, testId, grow = false, modal = true, onEscape = noop }: { children: ReactNode; label?: string; testId?: string; grow?: boolean; modal?: boolean; onEscape?: () => void }) {
  const reduce = useReducedMotion()
  const keyboard = useKeyboardInset()
  const ref = useRef<HTMLElement>(null)
  useModal(ref, true, onEscape)
  return (
    <motion.section
      ref={ref}
      role="dialog"
      aria-modal={modal}
      tabIndex={-1}
      style={keyboard ? { bottom: keyboard, maxHeight: `calc(100dvh - ${keyboard}px - env(safe-area-inset-top) - 12px)` } : undefined}
      data-keyboard={keyboard || undefined}
      initial={reduce ? false : { y: '105%' }}
      animate={{ y: 0 }}
      transition={{ duration: 0.38, ease: [0.2, 0.9, 0.2, 1] }}
      aria-label={label}
      aria-labelledby={label ? undefined : 'confirm-title'}
      className={cx('group outline-none absolute inset-x-0 bottom-0 z-[35] flex flex-col overflow-y-auto rounded-t-[26px] bg-sheet px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-12px_40px_rgb(0_0_0/0.45)]', !grow && SHEET_MAX)}
      data-testid={testId}
    >
      <span aria-hidden="true" className="mx-auto mb-4 block h-1 w-9 shrink-0 rounded-sm bg-divider" />
      {children}
    </motion.section>
  )
}

export function NotePhase({ cardId, onDone }: { cardId: string; onDone: () => void }) {
  const t = useTranslations('classify.firstNote')
  const tn = useTranslations('classify.note')
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const input = useRef<HTMLTextAreaElement>(null)
  const clean = cleanNote(text)
  const length = [...text].length
  useEffect(() => input.current?.focus(), [])
  const save = async () => {
    if (!clean || clean === 'invalid' || saving) return
    setSaving(true)
    setFailed(false)
    try {
      unwrap(await api.PUT('/api/me/cards/{id}/note', { params: { path: { id: cardId } }, body: { note: clean } }))
      onDone()
    } catch {
      setFailed(true)
      setSaving(false)
    }
  }
  return (
    <BottomSheet testId="swap-note" grow>
      <div className="flex shrink-0 items-center gap-3.5">
        <span className="grid size-[52px] shrink-0 place-items-center rounded-full bg-accent text-on-accent">
          <IconTarget size={28} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="confirm-title" className="text-title-lg font-bold leading-tight tracking-[-0.01em]">
            {t('title')}
          </h2>
          <p className="text-ui leading-snug text-text-secondary group-data-[keyboard]:hidden">{t('sub')}</p>
        </div>
      </div>
      <label htmlFor="first-note" className="mt-3.5 block shrink-0 text-ui leading-[1.4] text-text-secondary group-data-[keyboard]:sr-only">
        {t('body')}
      </label>
      <div className="field-focus relative mt-2.5 shrink-0 rounded-2xl">
        <textarea
          ref={input}
          id="first-note"
          rows={3}
          maxLength={NOTE_MAX}
          value={text}
          placeholder={t('placeholder')}
          aria-invalid={clean === 'invalid' || undefined}
          onChange={(e) => setText(e.target.value)}
          className="block w-full resize-none rounded-2xl border border-divider bg-surface px-3.5 pb-7 pt-3 text-[17px] leading-snug text-text placeholder:text-text-secondary"
          data-testid="note-input"
        />
        <span className="pointer-events-none absolute bottom-2 right-3 text-ui tabular-nums text-text-secondary" data-testid="note-count">
          {length}/{NOTE_MAX}
        </span>
      </div>
      {clean === 'invalid' && (
        <p role="alert" className="mt-1.5 shrink-0 text-ui leading-snug text-danger">
          {tn('invalid')}
        </p>
      )}
      {failed && (
        <p role="alert" className="mt-1.5 shrink-0 text-ui font-medium leading-snug text-danger" data-testid="note-failed">
          {t('failed')}
        </p>
      )}
      <div className="sticky bottom-0 -mx-4 mt-auto flex shrink-0 gap-2.5 bg-sheet px-4 pt-3">
        <button type="button" disabled={saving} onClick={onDone} className="flex h-[54px] flex-1 items-center justify-center rounded-2xl bg-surface text-[17px] font-semibold active:bg-surface-pressed disabled:opacity-50">
          {t('skip')}
        </button>
        <button type="button" disabled={!clean || clean === 'invalid' || saving} aria-busy={saving} onClick={() => void save()} className="flex h-[54px] flex-[1.5] items-center justify-center rounded-2xl bg-accent text-[17px] font-semibold text-on-accent active:bg-accent-pressed disabled:opacity-45">
          {t('save')}
        </button>
      </div>
    </BottomSheet>
  )
}

export function ConfirmSheet({ card, answer, busy, past, onUndo, onConfirm, onAbout, onShare, onSkip }: { card: PlayCard; answer: Answer; busy: boolean; past: boolean; onUndo: () => void; onConfirm: () => void; onAbout: () => void; onShare?: () => void; onSkip: () => void }) {
  const t = useTranslations('classify')
  const fmt = useFmt()
  const Icon = ANSWER_ICONS[answer]
  const sky = isSkyCard(card) ? card : null
  return (
    <BottomSheet testId="swap-confirm" onEscape={past || busy ? undefined : onUndo}>
      <div className="flex shrink-0 items-center gap-3.5">
        <span className={cx('grid size-[52px] shrink-0 place-items-center rounded-full', answer === 'moves' ? 'bg-accent text-on-accent' : 'bg-text text-bg')} data-testid="confirm-badge">
          <Icon size={28} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-ui leading-tight text-text-secondary">{t('confirm.yours')}</p>
          <h2 id="confirm-title" className="text-title-lg font-bold leading-tight tracking-[-0.01em]">
            {t(`confirm.${answer}`)}
          </h2>
        </div>
        {onShare && (
          <IconButton label={t('share.label')} onClick={onShare} className="size-12" data-testid="share-card">
            <IconShare size={24} />
          </IconButton>
        )}
      </div>
      {past && (
        <p role="status" className="mt-3 shrink-0 text-ui font-semibold leading-snug">
          {t('share.already')}
        </p>
      )}
      <button type="button" onClick={onAbout} className="mt-3.5 flex w-full shrink-0 items-center gap-2.5 border-t border-divider py-2.5 text-left text-ui leading-[1.35] text-text-secondary" data-testid="confirm-source">
        <IconInfo size={20} className="shrink-0" />
        <span className="min-w-0">
          <span className="block truncate">{t('confirm.source', { date: formatDate(card.t0, fmt.locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) })}</span>
          {sky && <span className="block truncate tabular-nums">{t('confirm.where', { ra: fmt.fixed(sky.ra, 4), dec: `${sky.dec >= 0 ? '+' : ''}${fmt.fixed(sky.dec, 4)}` })}</span>}
        </span>
      </button>
      <div className="mt-2 flex shrink-0 gap-2.5">
        {past ? (
          <button type="button" onClick={onSkip} className="flex h-[54px] flex-1 items-center justify-center rounded-2xl bg-accent text-[17px] font-semibold text-on-accent active:bg-accent-pressed">
            {t('next')}
          </button>
        ) : (
          <>
            <button type="button" disabled={busy} onClick={onUndo} className="flex h-[54px] flex-1 items-center justify-center gap-2 rounded-2xl bg-surface text-[17px] font-semibold active:bg-surface-pressed disabled:opacity-50">
              <IconUndo size={22} />
              {t('undo')}
            </button>
            <button type="button" disabled={busy} aria-busy={busy} onClick={onConfirm} className="flex h-[54px] flex-[1.5] items-center justify-center rounded-2xl bg-accent text-[17px] font-semibold text-on-accent active:bg-accent-pressed disabled:opacity-45">
              {t('confirm.confirm')}
            </button>
          </>
        )}
      </div>
    </BottomSheet>
  )
}

export function FailedSheet({ onRetry, onUndo }: { onRetry: () => void; onUndo: () => void }) {
  const t = useTranslations('classify')
  return (
    <BottomSheet label={t('failed')} testId="swap-failed" onEscape={onUndo}>
      <p role="status" className="text-[16px] font-medium leading-snug text-danger">
        {t('failed')}
      </p>
      <div className="mt-3 flex shrink-0 gap-2">
        <button type="button" onClick={onUndo} className={swapButton.big}>
          {t('undo')}
        </button>
        <button type="button" onClick={onRetry} className={swapButton.primary}>
          {t('retry')}
        </button>
      </div>
    </BottomSheet>
  )
}

export function ResultSheet({ verdict, last, onAgain, onUnderstand, onNext }: { verdict: Verdict; last: boolean; onAgain: () => void; onUnderstand: () => void; onNext: () => void }) {
  const t = useTranslations('classify')
  return (
    <BottomSheet label={t('result.label')} testId="swap-panel">
      <div className="flex shrink-0 flex-col gap-1.5">
        <h2 id="reveal-title" className="text-[21px] font-bold leading-tight [text-wrap:balance]">
          {t(`result.${verdict.title}`, { name: verdict.name ?? '' })}
        </h2>
        <p className="text-[16px] leading-snug text-text-secondary">{t(`result.${verdict.body}`)}</p>
        <p className="text-[15px] font-semibold leading-snug">{t('practice')}</p>
        <div className="mt-1 flex gap-2">
          <button type="button" onClick={verdict.again ? onAgain : onUnderstand} className={swapButton.big}>
            {verdict.again ? t('again') : t('understand.open')}
          </button>
          <button type="button" onClick={onNext} className={swapButton.primary}>
            {last ? t('finish') : t('next')}
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
