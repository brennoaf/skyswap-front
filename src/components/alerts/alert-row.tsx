'use client'

import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import type { ReactNode } from 'react'
import { IconCheck, IconQuestion, IconStar } from '@/components/icons'
import { BadgeArt, LevelArt } from '@/components/ui/badge-art'
import { ObjectAvatar } from '@/components/ui/primitives'
import type { Alert } from '@/lib/api/client'
import { cx, formatShortDate, relativeTime } from '@/lib/format'

function lowerFirst(s: string) {
  return s.charAt(0).toLowerCase() + s.slice(1)
}

function RoundIcon({ children, tone }: { children: ReactNode; tone: 'success' | 'warning' | 'accent' | 'muted' }) {
  return (
    <span
      className={cx(
        'inline-flex size-[44px] items-center justify-center rounded-full',
        tone === 'success' && 'bg-success/15 text-success',
        tone === 'warning' && 'bg-warning/15 text-warning',
        tone === 'accent' && 'bg-accent/15 text-accent',
        tone === 'muted' && 'bg-surface text-text-secondary',
      )}
    >
      {children}
    </span>
  )
}

export function AlertRow({ alert, unread, now }: { alert: Alert; unread: boolean; now: number }) {
  const locale = useLocale()
  const t = useTranslations()
  const rel = relativeTime(alert.created_at, now)
  const time = rel.unit === 'now' ? t('common.time.now') : t(`common.time.${rel.unit}`, { value: rel.value })

  let art: ReactNode = null
  let text = ''
  let href: string | null = null

  if (alert.type === 'new_data') {
    if (!alert.object) return null
    art = <ObjectAvatar src={alert.object.avatar} alt="" size={44} ring={alert.object.has_new_data ? 'new' : 'none'} />
    text = t('alerts.items.new_data', { name: alert.object.handle, date: formatShortDate(alert.detail, locale) })
    href = `/o/${alert.object.id}`
  } else if (alert.type === 'consensus') {
    const done = alert.detail === 'real' || alert.detail === 'artifact'
    art = <RoundIcon tone={alert.detail === 'real' ? 'success' : done ? 'muted' : 'warning'}>{done ? <IconCheck size={24} /> : <IconQuestion size={24} />}</RoundIcon>
    text = t('alerts.items.consensus', { status: t(`classify.status.${alert.detail}`) })
    href = '/classify'
  } else if (alert.type === 'candidate') {
    const [ra, dec] = alert.detail.split(',')
    art = (
      <RoundIcon tone="success">
        <IconStar size={24} />
      </RoundIcon>
    )
    text = t('alerts.items.candidate')
    href = ra && dec ? `/sky?ra=${ra}&dec=${dec}&fov=0.1` : '/classify'
  } else if (alert.type === 'badge') {
    art = <BadgeArt badge={alert.ref} size={44} earned />
    text = t('alerts.items.badge', { badge: t(`badges.items.${alert.ref}.name`) })
    href = '/me'
  } else if (alert.type === 'level') {
    const level = Number(alert.ref)
    art = <LevelArt level={level} size={44} />
    text = t('alerts.items.level', { level, name: t(`levels.${alert.detail}`) })
    href = '/me'
  } else if (alert.type === 'goal') {
    art = (
      <RoundIcon tone="accent">
        <IconStar size={24} />
      </RoundIcon>
    )
    text = t('alerts.items.goal', { target: Number(alert.detail), goal: lowerFirst(t(`me.goalItems.${alert.ref}`)) })
    href = '/me'
  } else return null

  const body = (
    <>
      <span className="shrink-0">{art}</span>
      <span className="min-w-0 flex-1 text-body leading-snug">
        {text} <span className="whitespace-nowrap text-text-secondary">{time}</span>
      </span>
      <span className={cx('size-2 shrink-0 rounded-full', unread ? 'bg-accent' : 'bg-transparent')} aria-hidden="true" />
    </>
  )
  const cls = cx('flex min-h-[64px] items-center gap-3 px-4 py-2 active:bg-surface', unread && 'bg-accent/[0.06]')
  return (
    <li>
      {href ? (
        <Link href={href} className={cls}>
          {body}
        </Link>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  )
}
