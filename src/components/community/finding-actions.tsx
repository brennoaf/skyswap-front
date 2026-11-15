'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useState, type ReactNode } from 'react'
import { IconBell, IconCheck, IconEye, IconLike, IconQuestion } from '@/components/icons'
import { Button, Sheet, SheetRow } from '@/components/ui/primitives'
import type { FindingSocial } from '@/lib/api/client'
import { useFindingActions, useFindingPeople, useSession } from '@/lib/api/hooks'
import { cx } from '@/lib/format'
import { useUi } from '@/lib/state/ui'

const DOUBT_REASONS = ['image_defect', 'known_asteroid', 'variable_star', 'other'] as const

function useGate() {
  const { data: user } = useSession()
  const ask = useUi((s) => s.askLogin)
  return (run: () => void) => {
    if (user) run()
    else ask('community')
  }
}

function Action({ icon, label, on, onClick, href, expanded }: { icon: ReactNode; label: string; on?: boolean; onClick?: () => void; href?: string; expanded?: boolean }) {
  const cls = cx('flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-meta font-medium leading-tight active:bg-surface', on ? 'text-accent' : 'text-text')
  if (href)
    return (
      <Link href={href} className={cls}>
        {icon}
        <span className="truncate">{label}</span>
      </Link>
    )
  return (
    <button type="button" onClick={onClick} aria-pressed={on} aria-expanded={expanded} className={cls}>
      {icon}
      <span className="truncate">{label}</span>
    </button>
  )
}

export function InterestingAction({ id, social }: { id: string; social: FindingSocial }) {
  const t = useTranslations('community')
  const gate = useGate()
  const actions = useFindingActions(id)
  const pending = actions.reaction.isPending ? actions.reaction.variables : null
  const interesting = pending?.kind === 'interesting' ? pending.on : !!social.mine?.interesting
  return (
    <div role="group" aria-label={t('actionsLabel')} className="flex border-b-[0.5px] border-divider">
      <Action icon={<IconLike size={24} />} label={t('interesting')} on={interesting} onClick={() => gate(() => actions.reaction.mutate({ kind: 'interesting', on: !interesting }))} />
    </div>
  )
}

export function FindingActions({ id, social, lookHref, lookOpen, onLook, onDoubted }: { id: string; social: FindingSocial; lookHref?: string; lookOpen?: boolean; onLook?: () => void; onDoubted?: () => void }) {
  const t = useTranslations('community')
  const gate = useGate()
  const actions = useFindingActions(id)
  const [doubting, setDoubting] = useState(false)
  const mine = social.mine
  const pending = actions.reaction.isPending ? actions.reaction.variables : null
  const interesting = pending?.kind === 'interesting' ? pending.on : !!mine?.interesting
  const pendingFollow = actions.follow.isPending ? actions.follow.variables : null
  const following = pendingFollow ?? !!mine?.following
  const doubt = pending?.kind === 'doubt' ? (pending.on ? (pending.reason ?? null) : null) : (mine?.doubt ?? null)

  return (
    <>
      <div role="group" aria-label={t('actionsLabel')} className="flex border-b-[0.5px] border-divider">
        <Action icon={<IconLike size={24} />} label={t('interesting')} on={interesting} onClick={() => gate(() => actions.reaction.mutate({ kind: 'interesting', on: !interesting }))} />
        <Action icon={<IconQuestion size={24} />} label={t('doubt')} on={!!doubt} onClick={() => gate(() => setDoubting(true))} />
        {lookHref ? <Action icon={<IconEye size={24} />} label={t('secondLook')} href={lookHref} /> : <Action icon={<IconEye size={24} />} label={t('secondLook')} on={!!mine?.second_look} expanded={lookOpen} onClick={() => gate(() => onLook?.())} />}
        <Action icon={<IconBell size={24} />} label={following ? t('following') : t('follow')} on={following} onClick={() => gate(() => actions.follow.mutate(!following))} />
      </div>
      <Sheet open={doubting} onClose={() => setDoubting(false)} title={t('doubtTitle')}>
        <p className="px-4 pb-2 text-note leading-snug text-text-secondary">{t('doubtLead')}</p>
        {DOUBT_REASONS.map((reason) => (
          <SheetRow
            key={reason}
            label={t(`doubtReasons.${reason}`)}
            icon={doubt === reason ? <IconCheck size={22} /> : undefined}
            onClick={() => {
              actions.reaction.mutate({ kind: 'doubt', on: true, reason })
              setDoubting(false)
              onDoubted?.()
            }}
          />
        ))}
        {doubt && (
          <SheetRow
            danger
            label={t('doubtRemove')}
            onClick={() => {
              actions.reaction.mutate({ kind: 'doubt', on: false })
              setDoubting(false)
            }}
          />
        )}
      </Sheet>
    </>
  )
}

export function SocialFacts({ social, blind = false }: { social: FindingSocial; blind?: boolean }) {
  const t = useTranslations('community')
  const reasons = DOUBT_REASONS.filter((r) => social.doubt_reasons[r] > 0)
    .sort((a, b) => social.doubt_reasons[b] - social.doubt_reasons[a])
    .map((r) => t('doubtShortCount', { label: t(`doubtShort.${r}`), n: social.doubt_reasons[r] }))
    .join(', ')
  const lines = [
    blind && social.blind_answers > 0 ? t('blindAnswers', { n: social.blind_answers }) : null,
    social.interesting > 0 ? t('interestingCount', { n: social.interesting }) : null,
    social.doubts > 0 ? t('doubtCount', { n: social.doubts, reasons }) : null,
    social.also_seen > 0 ? t('alsoSeen', { n: social.also_seen }) : null,
  ].filter((l): l is string => !!l)
  if (!lines.length) return null
  return (
    <div className="space-y-0.5 text-note leading-snug text-text-secondary">
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </div>
  )
}

function PeopleGroup({ title, names, anonymous }: { title: string; names: ReactNode[]; anonymous: number }) {
  const t = useTranslations('community')
  return (
    <section className="px-4 pb-4">
      <h3 className="text-ui font-semibold">{title}</h3>
      {names.length > 0 && <ul className="mt-1 space-y-1 text-body">{names}</ul>}
      {anonymous > 0 && <p className="mt-1 text-note text-text-secondary">{t(names.length ? 'peopleAnonymousMore' : 'peopleAnonymous', { n: anonymous })}</p>}
      {!names.length && !anonymous && <p className="mt-1 text-note text-text-secondary">{t('peopleNone')}</p>}
    </section>
  )
}

export function PeopleButton({ id, social }: { id: string; social: FindingSocial }) {
  const t = useTranslations('community')
  const [open, setOpen] = useState(false)
  const people = useFindingPeople(id, open)
  if (!social.interesting && !social.doubts && !social.also_seen) return null
  const p = people.data
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-9 items-center text-note font-semibold text-link">
        {t('peopleOpen')}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('peopleTitle')}>
        <p className="px-4 pb-3 text-note leading-snug text-text-secondary">{t('peopleLead')}</p>
        {p && (
          <>
            <PeopleGroup title={t('peopleInteresting')} names={p.interesting.map((n) => <li key={n}>{n}</li>)} anonymous={p.interesting_anonymous} />
            <PeopleGroup
              title={t('peopleDoubts')}
              names={p.doubts.map((d) => (
                <li key={d.name} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate">{d.name}</span>
                  <span className="shrink-0 text-note text-text-secondary">{t(`doubtShort.${d.reason as (typeof DOUBT_REASONS)[number]}`)}</span>
                </li>
              ))}
              anonymous={p.doubts_anonymous}
            />
            <PeopleGroup title={t('peopleAlso')} names={p.also_seen.map((n) => <li key={n}>{n}</li>)} anonymous={p.also_seen_anonymous} />
          </>
        )}
      </Sheet>
    </>
  )
}

export function SecondLookPanel({ id, social }: { id: string; social: FindingSocial }) {
  const t = useTranslations('community')
  const { secondLook } = useFindingActions(id)
  const vote = social.mine?.vote
  const look = social.mine?.second_look
  if (vote)
    return (
      <section className="border-b-[0.5px] border-divider px-4 py-3 text-body leading-snug">
        {t('lookVoted', { answer: t(`lookLabels.${vote as 'real' | 'artifact' | 'unsure'}`) })}
      </section>
    )
  const choices = [
    { choice: 'moves', label: 'real' },
    { choice: 'still', label: 'artifact' },
    { choice: 'unsure', label: 'unsure' },
  ] as const
  return (
    <section className="border-b-[0.5px] border-divider px-4 py-3">
      <h2 className="text-ui font-semibold">{t('lookTitle')}</h2>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {choices.map((c) => (
          <Button key={c.choice} variant={look === c.label ? 'primary' : 'secondary'} className="h-11 px-1 text-note" aria-pressed={look === c.label} disabled={secondLook.isPending} onClick={() => secondLook.mutate(c.choice)}>
            {t(`lookChoices.${c.label}`)}
          </Button>
        ))}
      </div>
      <p className="mt-2 text-note leading-snug text-text-secondary">{look ? t('lookSaved') : t('lookNote')}</p>
    </section>
  )
}
