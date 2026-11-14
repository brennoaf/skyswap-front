'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { IconCheck } from '@/components/icons'
import { BadgeArt, LevelArt } from '@/components/ui/badge-art'
import { EmptyState, ObjectAvatar, Skeleton } from '@/components/ui/primitives'
import { UserAvatar } from '@/components/ui/user-avatar'
import type { Me } from '@/lib/api/client'
import { useGoals, usePost } from '@/lib/api/hooks'
import { cx, formatNumber, formatShortDate, relativeTime } from '@/lib/format'

const STATUS_KEY: Record<string, string> = { open: 'statusOpen', real: 'statusReal', artifact: 'statusArtifact', inconclusive: 'statusInconclusive', candidate: 'statusCandidate' }

export function useAgo() {
  const t = useTranslations('common.time')
  return (ms: number) => {
    const r = relativeTime(ms)
    return t(r.unit, { value: r.value })
  }
}

export function LevelRing({ nickname, level, progress, size = 102 }: { nickname: string; level: number; progress: number; size?: number }) {
  const t = useTranslations('me')
  const stroke = 3
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const inner = size - 14
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }} role="img" aria-label={t('levelBadge', { n: level })}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-ring-seen)" strokeWidth={stroke} />
        {progress > 0 && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-accent)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, progress))} />
        )}
      </svg>
      <span className="absolute" style={{ inset: (size - inner) / 2 }}>
        <UserAvatar nickname={nickname} size={inner} />
      </span>
      <span className="absolute -bottom-0.5 -right-0.5 inline-flex rounded-full bg-bg p-[3px]">
        <LevelArt level={level} size={30} />
      </span>
    </span>
  )
}

export function ProgressBar({ value, label, className, track = 'bg-divider' }: { value: number; label: string; className?: string; track?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className={cx('h-1.5 w-full overflow-hidden rounded-full', track, className)}>
      <div className="h-full rounded-full bg-accent motion-safe:transition-[width] motion-safe:duration-500" style={{ width: `${pct}%` }} />
    </div>
  )
}

export function BadgeHighlights({ badges, onOpen }: { badges: Me['badges']; onOpen: (key: string) => void }) {
  const locale = useLocale()
  const t = useTranslations('badges')
  const tm = useTranslations('me')
  const ordered = [...badges].sort((a, b) => Number(!!b.earned_at) - Number(!!a.earned_at))
  return (
    <section aria-label={tm('badges')} className="pt-1">
      <ul className="no-scrollbar flex gap-1.5 overflow-x-auto px-4 pb-1">
        {ordered.map((b) => (
          <li key={b.key} className="flex w-[78px] shrink-0 flex-col items-center gap-1">
            <button
              type="button"
              onClick={() => onOpen(b.key)}
              aria-label={`${t(`items.${b.key}.name`)}. ${b.earned_at ? tm('earnedOn', { date: formatShortDate(b.earned_at, locale) }) : t('locked')}`}
              className={cx('flex size-[64px] items-center justify-center rounded-full border-[0.5px] bg-surface', b.earned_at ? 'border-ring-seen' : 'border-divider')}
            >
              <BadgeArt badge={b.key} size={40} earned={!!b.earned_at} />
            </button>
            <span className={cx('w-full text-center text-meta leading-tight', !b.earned_at && 'text-text-secondary')}>{t(`items.${b.key}.name`)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function BadgeDetail({ badge, earnedAt }: { badge: string; earnedAt: number | null }) {
  const locale = useLocale()
  const t = useTranslations('badges')
  const tm = useTranslations('me')
  return (
    <div className="flex flex-col items-center px-6 pb-4 pt-6 text-center">
      <BadgeArt badge={badge} size={96} earned={!!earnedAt} />
      <p className="mt-4 text-title-md font-semibold">{t(`items.${badge}.name`)}</p>
      <p className="mt-1 text-body text-text-secondary">{t(`items.${badge}.how`)}</p>
      <p className={cx('mt-4 inline-flex h-7 items-center rounded-full px-3 text-meta font-semibold', earnedAt ? 'bg-accent/15 text-link' : 'bg-surface text-text-secondary')}>
        {earnedAt ? tm('earnedOn', { date: formatShortDate(earnedAt, locale) }) : t('locked')}
      </p>
    </div>
  )
}

export function GoalsCard() {
  const locale = useLocale()
  const t = useTranslations('me')
  const { data: goals, isLoading } = useGoals()
  return (
    <section aria-labelledby="me-goals" className="mx-4 mt-5 rounded-2xl bg-surface p-4">
      <h2 id="me-goals" className="text-body font-semibold">
        {t('goals')}
      </h2>
      <ul className="mt-3 flex flex-col gap-3">
        {isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
        {goals?.map((g) => (
          <li key={g.key}>
            <div className="mb-1.5 flex items-baseline justify-between gap-2 text-note">
              <span>{t(`goalItems.${g.key}`)}</span>
              <span className="tabular-nums text-text-secondary">{t('goalProgress', { count: formatNumber(g.count, locale), target: formatNumber(g.target, locale) })}</span>
            </div>
            <ProgressBar value={g.target ? g.count / g.target : 0} label={t(`goalItems.${g.key}`)} track="bg-ring-seen/40" />
          </li>
        ))}
      </ul>
      <p className="mt-3 text-meta text-text-secondary">{t('noLeaderboard')}</p>
    </section>
  )
}

export function HistoryList({ items }: { items: Me['history'] }) {
  const t = useTranslations('me')
  const tt = useTranslations('tags.items')
  const ago = useAgo()
  if (!items.length) return <EmptyState title={t('activity')} body={t('noActivity')} />
  return (
    <ul className="py-2">
      {items.map((item) => {
        const time = <span className="whitespace-nowrap text-text-secondary"> {ago(item.created_at)}</span>
        if (item.type === 'vote') {
          const status = item.status ? STATUS_KEY[item.status] : undefined
          return (
            <li key={`v-${item.ref}-${item.created_at}`} className="flex min-h-[60px] items-center gap-3 px-4 py-2">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface">
                <IconCheck size={22} />
              </span>
              <p className="min-w-0 flex-1 text-body leading-snug">
                {t('historyItems.vote', { label: t(`labels.${item.detail}`) })}
                {time}
              </p>
              {status && <span className={cx('shrink-0 rounded-full px-2.5 py-1 text-meta font-medium', item.status === 'open' ? 'bg-surface text-text-secondary' : 'bg-accent/15 text-link')}>{t(status)}</span>}
            </li>
          )
        }
        const title = item.post?.title ?? item.ref
        const text = item.type === 'mark' ? t('historyItems.mark', { n: Number(item.detail), title }) : t('historyItems.tag', { title, tag: tt(item.detail) })
        const body = (
          <>
            <span className="relative h-[58px] w-11 shrink-0 overflow-hidden rounded-md bg-media-bg">{item.post && <Image src={item.post.cover} alt="" fill sizes="44px" className="pixelated object-contain" />}</span>
            <p className="min-w-0 flex-1 text-body leading-snug">
              {text}
              {time}
            </p>
          </>
        )
        return (
          <li key={`${item.type}-${item.ref}-${item.created_at}-${item.detail}`}>
            {item.post ? (
              <Link href={`/p/${item.post.id}`} className="flex items-center gap-3 px-4 py-2 active:bg-surface">
                {body}
              </Link>
            ) : (
              <div className="flex items-center gap-3 px-4 py-2">{body}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function SavedTile({ id }: { id: string }) {
  const { data, isError } = usePost(id)
  if (isError) return null
  return (
    <li>
      <Link href={`/p/${id}`} className="relative block aspect-[3/4] overflow-hidden bg-media-bg" aria-label={data?.post.title ?? id}>
        {data ? <Image src={data.post.cover} alt={data.post.title} fill sizes="(max-width: 470px) 33vw, 157px" className="pixelated object-contain" /> : <Skeleton className="absolute inset-0 rounded-none" />}
      </Link>
    </li>
  )
}

export function SavedGrid({ ids }: { ids: string[] }) {
  const t = useTranslations('me')
  if (!ids.length) return <EmptyState title={t('saved')} body={t('noSaved')} />
  return (
    <ul className="grid grid-cols-3 gap-[2px]">
      {ids.map((id) => (
        <SavedTile key={id} id={id} />
      ))}
    </ul>
  )
}

export function FollowingList({ objects }: { objects: Me['following'] }) {
  const t = useTranslations('me')
  const tp = useTranslations('post')
  if (!objects.length) return <EmptyState title={t('following')} body={t('noFollowing')} />
  return (
    <ul className="py-2">
      {objects.map((o) => (
        <li key={o.id}>
          <Link href={`/o/${o.id}`} className="flex min-h-[60px] items-center gap-3 px-4 py-2 active:bg-surface">
            <ObjectAvatar src={o.avatar} alt="" size={44} ring={o.has_new_data ? 'new' : 'none'} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body font-semibold">{o.name}</span>
              <span className="block truncate text-note text-text-secondary">{tp(`kinds.${o.kind}`)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
