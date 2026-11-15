'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertRow } from '@/components/alerts/alert-row'
import { IconBell } from '@/components/icons'
import { Button, EmptyState, Skeleton, TopBar } from '@/components/ui/primitives'
import { useAlerts, useReadAlerts, useSession } from '@/lib/api/hooks'
import { cx } from '@/lib/format'
import { useUi } from '@/lib/state/ui'

type Group = 'today' | 'week' | 'earlier'

const GROUPS: Group[] = ['today', 'week', 'earlier']
const KNOWN = new Set(['new_data', 'consensus', 'finding', 'finding_followed', 'note', 'badge', 'level', 'goal'])

function groupOf(ms: number, now: number): Group {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  if (ms >= start.getTime()) return 'today'
  if (ms >= now - 7 * 86_400_000) return 'week'
  return 'earlier'
}

function AlertsSkeleton() {
  return (
    <div aria-hidden="true" className="pt-2">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-2.5">
          <Skeleton className="size-11 rounded-full" />
          <span className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-[85%]" />
            <Skeleton className="h-3 w-1/2" />
          </span>
        </div>
      ))}
    </div>
  )
}

function AlertsList() {
  const t = useTranslations('alerts')
  const tc = useTranslations('common')
  const tn = useTranslations('nav')
  const alerts = useAlerts(true)
  const read = useReadAlerts()
  const [now] = useState(() => Date.now())
  const [highlight, setHighlight] = useState<Set<string> | null>(null)
  const sent = useRef(new Set<string>())
  const list = useMemo(() => (alerts.data?.alerts ?? []).filter((a) => KNOWN.has(a.type) && (a.type !== 'new_data' || a.object)).sort((a, b) => b.created_at - a.created_at), [alerts.data])
  const { mutate } = read

  useEffect(() => {
    if (!alerts.data) return
    const unread = list.filter((a) => !a.read && !sent.current.has(a.id)).map((a) => a.id)
    setHighlight((h) => {
      const next = new Set(h ?? [])
      for (const id of unread) next.add(id)
      return next
    })
    if (!unread.length) return
    const timer = setTimeout(() => {
      for (const id of unread) sent.current.add(id)
      mutate(unread)
    }, 1200)
    return () => clearTimeout(timer)
  }, [alerts.data, list, mutate])

  if (alerts.isLoading) return <AlertsSkeleton />
  if (alerts.isError)
    return (
      <EmptyState
        title={tc('retry')}
        action={
          <Button variant="primary" onClick={() => alerts.refetch()}>
            {tc('retry')}
          </Button>
        }
      />
    )
  if (!list.length)
    return (
      <EmptyState
        art={
          <span className="inline-flex size-20 items-center justify-center rounded-full border-2 border-text">
            <IconBell size={40} />
          </span>
        }
        title={t('empty')}
        body={t('emptyBody')}
        action={
          <Link href="/classify" className="inline-flex h-9 items-center rounded-[var(--radius-button)] bg-accent px-4 text-ui font-medium text-on-accent">
            {tn('classify')}
          </Link>
        }
      />
    )

  const grouped = GROUPS.map((g) => ({ g, items: list.filter((a) => groupOf(a.created_at, now) === g) })).filter((x) => x.items.length)

  return (
    <div className="pb-6">
      {grouped.map(({ g, items }, i) => (
        <section key={g} aria-labelledby={`alerts-${g}`} className={cx(i > 0 && 'mt-1 border-t-[0.5px] border-divider')}>
          <h2 id={`alerts-${g}`} className="px-4 pb-1 pt-4 text-title-sm font-bold">
            {t(g)}
          </h2>
          <ul>
            {items.map((a) => (
              <AlertRow key={a.id} alert={a} now={now} unread={!a.read || !!highlight?.has(a.id)} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

export default function AlertsPage() {
  const t = useTranslations('alerts')
  const ta = useTranslations('auth')
  const { data: user, isLoading } = useSession()
  const askLogin = useUi((s) => s.askLogin)
  return (
    <main>
      <TopBar title={t('title')} />
      {isLoading ? (
        <AlertsSkeleton />
      ) : !user ? (
        <EmptyState
          art={
            <span className="inline-flex size-20 items-center justify-center rounded-full border-2 border-text">
              <IconBell size={40} />
            </span>
          }
          title={t('title')}
          body={ta('reasons.alerts')}
          action={
            <Button variant="primary" onClick={() => askLogin('alerts')}>
              {ta('join')}
            </Button>
          }
        />
      ) : (
        <AlertsList />
      )}
    </main>
  )
}
