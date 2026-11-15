'use client'

import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import { IconChevronRight, IconFollow, IconHighlight, IconMap, IconNote, IconQuestion, IconSave, IconSettings } from '@/components/icons'
import { MeIntro } from '@/components/me/me-intro'
import { NotesActions, usePrivateNotes } from '@/components/me/notes-tools'
import { ExploredSkyCard } from '@/components/me/explored-sky'
import { BadgeDetail, BadgeHighlights, FollowingList, GoalsCard, HistoryList, LevelRing, ProgressBar, SavedGrid, useAgo } from '@/components/me/profile-parts'
import { LoginForm } from '@/components/shell/login-sheet'
import { Button, EmptyState, IconButton, IconTabs, Notice, Sheet, Skeleton, Stat, TopBar } from '@/components/ui/primitives'
import { UserAvatar } from '@/components/ui/user-avatar'
import { AvatarSheet } from '@/components/me/avatar-parts'
import { ApiError, type Me } from '@/lib/api/client'
import { useMe, useSession } from '@/lib/api/hooks'
import { formatNumber } from '@/lib/format'
import { useUi } from '@/lib/state/ui'

type Tab = 'activity' | 'community' | 'saved' | 'following'

function SettingsLink() {
  const t = useTranslations('me')
  return (
    <Link href="/settings" aria-label={t('settings')} title={t('settings')} className="inline-flex size-11 items-center justify-center rounded-full active:scale-90">
      <IconSettings />
    </Link>
  )
}

function ProfileSkeleton() {
  return (
    <div aria-hidden="true" className="px-4 pt-2">
      <div className="flex items-center gap-6">
        <Skeleton className="size-[102px]" style={{ borderRadius: 9999 }} />
        <div className="flex flex-1 flex-col gap-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-9 w-full" />
        </div>
      </div>
      <Skeleton className="mt-4 h-3 w-48" />
      <Skeleton className="mt-2 h-1.5 w-full" />
      <Skeleton className="mt-4 h-8 w-full" />
    </div>
  )
}

function Guest() {
  const t = useTranslations('me')
  return (
    <main>
      <TopBar back={false} title={t('title')} actions={<SettingsLink />} />
      <div className="flex flex-col items-center px-6 pb-2 pt-6 text-center">
        <UserAvatar nickname={null} size={90} />
        <h2 className="mt-4 font-[family-name:var(--font-display)] text-title-lg font-bold leading-tight">{t('guestTitle')}</h2>
        <p className="mt-2 max-w-[320px] text-body text-text-secondary">{t('guestBody')}</p>
      </div>
      <LoginForm />
      <GoalsCard />
    </main>
  )
}

function NotesPanel() {
  const t = useTranslations('me')
  const tv = useTranslations('viewer')
  const { notes, reload } = usePrivateNotes()
  return (
    <section aria-labelledby="me-notes" className="flex flex-col gap-3 px-4 py-4">
      <h2 id="me-notes" className="text-ui font-semibold">
        {t('notes')}
      </h2>
      <Notice icon={<IconNote size={18} />}>{tv('notesHint')}</Notice>
      <NotesActions notes={notes} onImported={() => void reload()} />
      {notes === null && [0, 1].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
      {notes?.length === 0 && <p className="text-body text-text-secondary">{t('noNotes')}</p>}
      {!!notes?.length && (
        <ul className="-mx-4">
          {notes.map((n) => (
            <li key={n.postId}>
              <Link href={`/p/${n.postId}`} className="block px-4 py-3 active:bg-surface">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-body font-semibold">{n.title || t('noteUntitled')}</span>
                  <NoteTime ms={n.updatedAt} />
                </span>
                <span className="mt-0.5 line-clamp-2 block whitespace-pre-line text-body text-text-secondary">{n.text}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function NoteTime({ ms }: { ms: number }) {
  const ago = useAgo()
  return <span className="shrink-0 text-meta text-text-secondary">{ago(ms)}</span>
}

function Profile({ me }: { me: Me }) {
  const locale = useLocale()
  const t = useTranslations('me')
  const tl = useTranslations('levels')
  const tn = useTranslations('nav')
  const saved = useUi((s) => s.saved)
  const showIntro = useUi((s) => s.showMeIntro)
  const [tab, setTab] = useState<Tab>('activity')
  const [badge, setBadge] = useState<string | null>(null)
  const [avatarOpen, setAvatarOpen] = useState(false)
  const next = me.levels.find((l) => l.level === me.level.level + 1)
  const open = me.badges.find((b) => b.key === badge)

  const tabs: { key: Tab; icon: React.ReactNode; label: string }[] = [
    { key: 'activity', icon: <IconHighlight size={24} />, label: t('tabs.activity') },
    { key: 'community', icon: <IconMap size={26} />, label: t('tabs.community') },
    { key: 'saved', icon: <IconSave size={24} />, label: t('tabs.saved') },
    { key: 'following', icon: <IconFollow size={32} />, label: t('tabs.following') },
  ]

  return (
    <main>
      <TopBar
        back={false}
        title={me.user.nickname}
        actions={
          <>
            <IconButton label={t('intro')} onClick={showIntro}>
              <IconQuestion size={26} />
            </IconButton>
            <SettingsLink />
          </>
        }
      />
      <MeIntro levels={me.levels} dailyCap={me.daily_cap} />

      <section className="px-4 pt-1" aria-label={tn('me')}>
        <div className="flex items-center gap-5">
          <button type="button" onClick={() => setAvatarOpen(true)} aria-label={t('avatar.open')} className="shrink-0 rounded-full">
            <LevelRing nickname={me.user.nickname} avatar={me.user.avatar?.url} level={me.level.level} progress={me.level.progress} />
          </button>
          <div className="flex min-w-0 flex-1 justify-between gap-2 pr-2">
            <Stat value={formatNumber(me.counts.votes, locale)} label={t('answers', { n: me.counts.votes })} />
            <Stat value={formatNumber(me.counts.marks, locale)} label={t('marks', { n: me.counts.marks })} />
            <Stat value={formatNumber(me.counts.tags, locale)} label={t('tags', { n: me.counts.tags })} />
          </div>
        </div>

        <div className="mt-3 text-body leading-snug">
          <p className="font-semibold">{t('level', { n: me.level.level, name: tl(me.level.key) })}</p>
          <ProgressBar value={me.level.progress} label={t('progress')} className="my-2" />
          <p className="text-text-secondary">
            <span className="font-semibold text-text">{t('xp', { xp: me.xp })}</span>
            {', '}
            {next && me.level.next_min_xp !== null ? t('toNext', { xp: me.level.next_min_xp - me.xp, name: tl(next.key) }) : t('maxLevel')}
          </p>
          {me.streak > 1 && <p className="mt-0.5">{t('streak', { n: me.streak })}</p>}
          {me.xp_today >= me.daily_cap * 0.8 && <p className="mt-0.5 text-text-secondary">{t('today', { xp: me.xp_today, cap: me.daily_cap })}</p>}
        </div>

        <Link href="/classify" className="mt-3 flex h-11 w-full items-center justify-center rounded-[var(--radius-button)] bg-accent text-ui font-semibold text-on-accent active:bg-accent-pressed">
          {t('answerMore')}
        </Link>
      </section>

      <div className="pt-4">
        <BadgeHighlights badges={me.badges} onOpen={setBadge} />
      </div>

      <div className="sticky top-[var(--height-topbar)] z-20 mt-5 bg-bg">
        <IconTabs tabs={tabs} value={tab} onChange={setTab} label={t('tabs.label')} />
      </div>
      <div role="tabpanel" aria-label={tabs.find((x) => x.key === tab)?.label} className="min-h-[60dvh]">
        {tab === 'activity' && (
          <>
            <Link href="/me/cards" className="flex min-h-14 items-center gap-3 px-4 py-2 active:bg-surface">
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block text-body font-medium">{t('allAnswers')}</span>
                <span className="block text-meta text-text-secondary">{t('allAnswersHint')}</span>
              </span>
              <IconChevronRight size={20} className="shrink-0 text-text-secondary" />
            </Link>
            <HistoryList items={me.history} />
          </>
        )}
        {tab === 'community' && (
          <div className="pb-6">
            <GoalsCard />
            <ExploredSkyCard />
          </div>
        )}
        {tab === 'saved' && (
          <>
            <SavedGrid ids={saved} />
            <NotesPanel />
          </>
        )}
        {tab === 'following' && <FollowingList objects={me.following} />}
      </div>

      <AvatarSheet avatar={me.user.avatar} open={avatarOpen} onClose={() => setAvatarOpen(false)} />
      <Sheet open={!!open} onClose={() => setBadge(null)}>
        {open && <BadgeDetail badge={open.key} earnedAt={open.earned_at} />}
      </Sheet>
    </main>
  )
}

export default function MePage() {
  const tc = useTranslations('common')
  const th = useTranslations('home')
  const tm = useTranslations('me')
  const { data: user, isLoading } = useSession()
  const me = useMe(!!user)
  if (isLoading || (user && me.isLoading))
    return (
      <main>
        <TopBar back={false} title={user?.nickname ?? ''} actions={<SettingsLink />} />
        <ProfileSkeleton />
      </main>
    )
  if (user && me.isError && !(me.error instanceof ApiError && me.error.status === 401))
    return (
      <main>
        <TopBar back={false} title={user.nickname} actions={<SettingsLink />} />
        <EmptyState title={tm('errorTitle')} body={th('errorBody')} action={<Button onClick={() => void me.refetch()}>{tc('retry')}</Button>} />
      </main>
    )
  if (!user || !me.data) return <Guest />
  return <Profile me={me.data} />
}
