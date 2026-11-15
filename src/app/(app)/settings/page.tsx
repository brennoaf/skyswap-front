'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useState, type ReactNode } from 'react'
import { IconCheck, IconChevronDownSmall, IconChevronRight, IconFollow, IconLink, IconMap, IconMore, IconNote, IconQuestion, IconSun } from '@/components/icons'
import { NotesActions, usePrivateNotes } from '@/components/me/notes-tools'
import { LoginForm } from '@/components/shell/login-sheet'
import { Skeleton, TopBar } from '@/components/ui/primitives'
import { UserAvatar } from '@/components/ui/user-avatar'
import { locales } from '@/i18n/locales'
import { useCredit, useHealth, useLogout, useSession } from '@/lib/api/hooks'
import { cx } from '@/lib/format'
import { useUi, type ThemePref } from '@/lib/state/ui'
import { useFmt } from '@/lib/use-fmt'
import { useSwitchLocale } from '@/lib/use-switch-locale'

const THEMES: ThemePref[] = ['system', 'dark', 'light']
const API_DOCS_URL = process.env.NEXT_PUBLIC_API_DOCS_URL ?? 'http://localhost:4000/docs'

function Group({ id, title, children }: { id: string; title?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={title ? id : undefined} className="mt-6 px-4">
      {title && (
        <h2 id={id} className="px-1 pb-2 text-meta font-semibold uppercase tracking-wide text-text-secondary">
          {title}
        </h2>
      )}
      <div className="overflow-hidden rounded-2xl bg-surface ring-[0.5px] ring-divider">{children}</div>
    </section>
  )
}

function RowHead({ icon, title, hint }: { icon: ReactNode; title: string; hint?: ReactNode }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-3">
      <span className="inline-flex size-6 shrink-0 items-center justify-center text-text">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-ui">{title}</span>
        {hint && <span className="block text-note text-text-secondary">{hint}</span>}
      </span>
    </span>
  )
}

function CreditControl() {
  const t = useTranslations('settings')
  const { data: user } = useSession()
  const { visible, set } = useCredit(!!user)
  if (!user) return null
  return (
    <>
      <div className="mx-4 border-t-[0.5px] border-divider" />
      <label className="flex items-center gap-3 px-4 py-3">
        <RowHead icon={<IconFollow size={24} />} title={t('credit')} hint={t('creditHint')} />
        <input type="checkbox" role="switch" checked={visible} disabled={set.isPending} onChange={(e) => set.mutate(e.target.checked)} className="peer sr-only" />
        <span aria-hidden="true" className="relative h-6 w-10 shrink-0 rounded-full bg-surface-pressed transition-colors after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-on-accent after:transition-transform peer-checked:bg-accent peer-checked:after:translate-x-4" />
      </label>
    </>
  )
}

function LanguageControl() {
  const t = useTranslations('settings')
  const { current, change, pending } = useSwitchLocale()
  return (
    <div className="px-4 py-3">
      <RowHead icon={<IconMap size={24} />} title={t('language')} hint={t('languageHint')} />
      <div role="radiogroup" aria-label={t('language')} aria-busy={pending} className="mt-2 pl-9">
        {locales.map((l) => (
          <button key={l} type="button" role="radio" aria-checked={current === l} lang={l} onClick={() => change(l)} className="flex min-h-11 w-full items-center gap-3 text-left text-ui">
            <span className="flex-1">{t(`languages.${l}`)}</span>
            <span className={cx('inline-flex size-5 items-center justify-center rounded-full border-2', current === l ? 'border-accent bg-accent text-on-accent' : 'border-ring-seen')} aria-hidden="true">
              {current === l && <IconCheck size={14} />}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function ThemeControl() {
  const t = useTranslations('settings')
  const theme = useUi((s) => s.theme)
  const setTheme = useUi((s) => s.setTheme)
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])
  return (
    <div className="px-4 py-3">
      <RowHead icon={<IconSun size={24} />} title={t('appearance')} />
      <div role="radiogroup" aria-label={t('appearance')} className="mt-3 flex rounded-[10px] bg-bg p-[3px]">
      {THEMES.map((k) => {
        const on = ready && theme === k
        return (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => setTheme(k)}
            className={cx('h-10 flex-1 rounded-[8px] text-body font-semibold motion-safe:transition-colors', on ? 'bg-surface-pressed text-text' : 'text-text-secondary')}
          >
            {t(`theme.${k}`)}
          </button>
        )
      })}
      </div>
    </div>
  )
}

function Account() {
  const t = useTranslations('settings')
  const { data: user, isLoading } = useSession()
  if (isLoading) return <Skeleton className="m-4 h-14" />
  if (!user)
    return (
      <div className="pt-3">
        <p className="px-4 text-body text-text-secondary">{t('loggedOut')}</p>
        <div className="-mx-2">
          <LoginForm />
        </div>
      </div>
    )
  return (
    <div className="flex items-center gap-3 p-4">
      <UserAvatar nickname={user.nickname} src={user.avatar?.url} size={56} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-title-sm font-semibold">{user.nickname}</span>
        <span className="block text-note text-text-secondary">{t('signedIn')}</span>
      </span>
    </div>
  )
}

function Logout() {
  const t = useTranslations('settings')
  const { data: user } = useSession()
  const logout = useLogout()
  if (!user) return null
  return (
    <div className="mt-6 px-4">
      <button type="button" disabled={logout.isPending} onClick={() => logout.mutate()} className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-surface text-ui font-semibold text-danger active:bg-surface-pressed disabled:opacity-50">
        {t('logout')}
      </button>
    </div>
  )
}

function Notes() {
  const t = useTranslations('settings')
  const { notes, reload } = usePrivateNotes()
  return (
    <div className="px-4 py-3">
      <RowHead icon={<IconNote size={24} />} title={t('notes')} hint={notes ? `${t('notesHint')} ${t('notesCount', { n: notes.length })}` : t('notesHint')} />
      <NotesActions notes={notes} onImported={() => void reload()} className="mt-3 flex gap-2 pl-9 [&_button]:h-10 [&_button]:whitespace-nowrap [&_button]:bg-bg" />
    </div>
  )
}

function Details() {
  const t = useTranslations('settings')
  const fmt = useFmt()
  const health = useHealth()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" aria-expanded={open} aria-controls={open ? 's-details' : undefined} onClick={() => setOpen((v) => !v)} className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-pressed">
        <RowHead icon={<IconMore size={24} />} title={t('details')} hint={t('detailsHint')} />
        <IconChevronDownSmall size={20} className={cx('shrink-0 text-text-secondary motion-safe:transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div id="s-details" className="space-y-3 px-4 pb-4 text-note leading-relaxed">
          <section>
            <h3 className="font-semibold">{t('data')}</h3>
            <div className="mt-1 text-text-secondary">{health.data ? t('dataBody', { version: health.data.version, images: fmt.number(health.data.images_indexed) }) : <Skeleton className="h-10 w-full" />}</div>
          </section>
          <p className="text-text-secondary">{t('about')}</p>
          <a href={API_DOCS_URL} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 font-semibold text-link">
            <IconLink size={20} />
            {t('api')}
          </a>
        </div>
      )}
    </>
  )
}

export default function SettingsPage() {
  const t = useTranslations('settings')
  const router = useRouter()
  const resetOnboarding = useUi((s) => s.resetOnboarding)
  return (
    <main className="pb-10">
      <TopBar title={t('title')} />

      <Group id="s-account" title={t('account')}>
        <Account />
      </Group>

      <Group id="s-preferences" title={t('preferences')}>
        <ThemeControl />
        <div className="mx-4 border-t-[0.5px] border-divider" />
        <LanguageControl />
        <CreditControl />
      </Group>

      <Group id="s-yours" title={t('yourData')}>
        <Notes />
      </Group>

      <Group id="s-help" title={t('help')}>
        <button
          type="button"
          onClick={() => {
            resetOnboarding()
            router.push('/')
          }}
          className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-pressed"
        >
          <RowHead icon={<IconQuestion size={24} />} title={t('tutorial')} hint={t('tutorialHint')} />
          <IconChevronRight size={20} className="shrink-0 text-text-secondary" />
        </button>
        <div className="mx-4 border-t-[0.5px] border-divider" />
        <Details />
      </Group>

      <Logout />
    </main>
  )
}
