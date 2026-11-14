'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState, type ReactNode } from 'react'
import { IconCheck, IconLink, IconQuestion } from '@/components/icons'
import { NotesActions, usePrivateNotes } from '@/components/me/notes-tools'
import { LoginForm } from '@/components/shell/login-sheet'
import { Onboarding } from '@/components/shell/onboarding'
import { Button, Skeleton, TopBar } from '@/components/ui/primitives'
import { UserAvatar } from '@/components/ui/user-avatar'
import { useHealth, useLogout, useSession } from '@/lib/api/hooks'
import { cx } from '@/lib/format'
import { useUi, type ThemePref } from '@/lib/state/ui'

const THEMES: ThemePref[] = ['system', 'dark', 'light']
const API_DOCS_URL = process.env.NEXT_PUBLIC_API_DOCS_URL ?? 'http://localhost:4000/docs'

function Section({ id, title, children }: { id: string; title?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={title ? id : undefined} className="border-b-[0.5px] border-divider py-4">
      {title && (
        <h2 id={id} className="px-4 pb-2 text-body font-semibold text-text-secondary">
          {title}
        </h2>
      )}
      {children}
    </section>
  )
}

function ThemeControl() {
  const t = useTranslations('settings')
  const theme = useUi((s) => s.theme)
  const setTheme = useUi((s) => s.setTheme)
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])
  return (
    <div role="radiogroup" aria-label={t('appearance')} className="mx-4 flex rounded-[10px] bg-surface p-[3px]">
      {THEMES.map((k) => {
        const on = ready && theme === k
        return (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => setTheme(k)}
            className={cx('h-11 flex-1 rounded-[8px] text-body font-semibold motion-safe:transition-colors', on ? 'bg-bg text-text shadow-[0_1px_4px_rgb(0_0_0/0.15)]' : 'text-text-secondary')}
          >
            {t(`theme.${k}`)}
          </button>
        )
      })}
    </div>
  )
}

function Account() {
  const t = useTranslations('settings')
  const { data: user, isLoading } = useSession()
  const logout = useLogout()
  if (isLoading) return <Skeleton className="mx-4 h-12" />
  if (!user)
    return (
      <>
        <p className="px-4 text-body text-text-secondary">{t('loggedOut')}</p>
        <div className="-mx-2">
          <LoginForm />
        </div>
      </>
    )
  return (
    <div className="flex items-center gap-3 px-4">
      <UserAvatar nickname={user.nickname} size={44} />
      <p className="min-w-0 flex-1 truncate text-ui">{t('nickname', { name: user.nickname })}</p>
      <Button variant="danger" disabled={logout.isPending} onClick={() => logout.mutate()}>
        {t('logout')}
      </Button>
    </div>
  )
}

function Notes() {
  const t = useTranslations('settings')
  const { notes, reload } = usePrivateNotes()
  return (
    <div className="flex flex-col gap-3 px-4">
      <p className="text-note text-text-secondary">
        {t('notesHint')} {notes && t('notesCount', { n: notes.length })}
      </p>
      <NotesActions notes={notes} onImported={() => void reload()} />
    </div>
  )
}

export default function SettingsPage() {
  const t = useTranslations('settings')
  const health = useHealth()
  const [tutorial, setTutorial] = useState(false)
  const resetOnboarding = useUi((s) => s.resetOnboarding)
  return (
    <main className="pb-6">
      <TopBar title={t('title')} />

      <Section id="s-account" title={t('account')}>
        <Account />
      </Section>

      <Section id="s-appearance" title={t('appearance')}>
        <ThemeControl />
      </Section>

      <Section id="s-language" title={t('language')}>
        <div className="flex min-h-11 items-center gap-3 px-4">
          <span className="flex-1 text-ui" lang="en">
            {t('languageName')}
          </span>
          <IconCheck size={24} className="text-accent" />
        </div>
        <p className="px-4 text-note text-text-secondary">{t('languageHint')}</p>
      </Section>

      <Section id="s-notes" title={t('notes')}>
        <Notes />
      </Section>

      <Section id="s-help">
        <button type="button" onClick={() => {
            resetOnboarding()
            setTutorial(true)
          }} className="flex min-h-12 w-full items-center gap-3 px-4 text-left text-ui active:bg-surface">
          <IconQuestion size={24} />
          <span className="flex-1">{t('tutorial')}</span>
        </button>
      </Section>

      <Section id="s-data" title={t('data')}>
        <p className="px-4 text-body leading-relaxed">
          {health.data ? t('dataBody', { version: health.data.version }) : <Skeleton className="h-10 w-full" />}
        </p>
        <p className="mt-3 px-4 text-note leading-relaxed text-text-secondary">{t('about')}</p>
        <a href={API_DOCS_URL} target="_blank" rel="noreferrer" className="mt-2 flex min-h-12 items-center gap-3 px-4 text-ui text-link active:bg-surface">
          <IconLink size={24} />
          <span className="flex-1">{t('api')}</span>
        </a>
      </Section>

      {tutorial && <Onboarding force onClose={() => setTutorial(false)} />}
    </main>
  )
}
