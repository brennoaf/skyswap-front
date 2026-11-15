'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useState, type ReactNode } from 'react'
import { IconChevronDownSmall, IconChevronRight, IconDevices, IconFollow, IconLink, IconMap, IconMore, IconNote, IconQuestion, IconSun } from '@/components/icons'
import { NotesActions, usePrivateNotes } from '@/components/me/notes-tools'
import { Button, Segmented, Sheet, Skeleton, Switch, TopBar } from '@/components/ui/primitives'
import { UserAvatar } from '@/components/ui/user-avatar'
import { locales, type Locale } from '@/i18n/locales'
import { isProtected, useAccount } from '@/lib/api/account'
import { useCredit, useHealth, useLogout, useSession } from '@/lib/api/hooks'
import { cx } from '@/lib/format'
import { useUi, type ThemePref } from '@/lib/state/ui'
import { useFmt } from '@/lib/use-fmt'
import { useSwitchLocale } from '@/lib/use-switch-locale'

const THEMES: ThemePref[] = ['system', 'dark', 'light']
const API_DOCS_URL = process.env.NEXT_PUBLIC_API_DOCS_URL ?? 'http://localhost:4000/docs'
const ROW = 'flex min-h-12 w-full items-center gap-3 px-4 text-left'

function Group({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-5">
      <h2 id={id} className="px-4 pb-1 text-meta font-semibold uppercase tracking-wide text-text-secondary">
        {title}
      </h2>
      {children}
    </section>
  )
}

function RowIcon({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <span className="inline-flex size-6 shrink-0 items-center justify-center text-text" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {children}
    </span>
  )
}

function Account() {
  const t = useTranslations('settings')
  const td = useTranslations('account.devices')
  const { data: user, isLoading } = useSession()
  const ask = useUi((s) => s.askLogin)
  if (isLoading) return <Skeleton className="mx-4 h-12" />
  if (!user)
    return (
      <button type="button" onClick={() => ask('me')} className={cx(ROW, 'active:bg-surface')}>
        <RowIcon>
          <IconFollow size={24} />
        </RowIcon>
        <span className="min-w-0 flex-1 text-ui">{t('loggedOut')}</span>
        <IconChevronRight size={20} className="shrink-0 text-text-secondary" />
      </button>
    )
  return (
    <>
      <div className={cx(ROW, 'py-1')}>
        <UserAvatar nickname={user.nickname} src={user.avatar?.url} size={44} />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-ui font-semibold">{user.nickname}</span>
          <span className="block text-note text-text-secondary">{t('signedIn')}</span>
        </span>
      </div>
      <Link href="/me/devices" className={cx(ROW, 'active:bg-surface')}>
        <RowIcon>
          <IconDevices size={24} />
        </RowIcon>
        <span className="min-w-0 flex-1 text-ui">{td('title')}</span>
        <IconChevronRight size={20} className="shrink-0 text-text-secondary" />
      </Link>
    </>
  )
}

function ThemeControl() {
  const t = useTranslations('settings')
  const theme = useUi((s) => s.theme)
  const setTheme = useUi((s) => s.setTheme)
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])
  return (
    <div className={ROW}>
      <RowIcon label={t('appearance')}>
        <IconSun size={24} />
      </RowIcon>
      {ready ? <Segmented label={t('appearance')} value={theme} onChange={setTheme} options={THEMES.map((k) => ({ value: k, label: t(`theme.${k}`) }))} className="min-w-0 flex-1" /> : <Skeleton className="h-10 flex-1" />}
    </div>
  )
}

function LanguageControl() {
  const t = useTranslations('settings')
  const { current, change, pending } = useSwitchLocale()
  return (
    <div className={ROW} aria-busy={pending}>
      <RowIcon label={t('language')}>
        <IconMap size={24} />
      </RowIcon>
      <Segmented<Locale> label={t('language')} value={current as Locale} onChange={change} options={locales.map((l) => ({ value: l, label: t(`languages.${l}`) }))} className="min-w-0 flex-1" />
    </div>
  )
}

function CreditControl() {
  const t = useTranslations('settings')
  const { data: user } = useSession()
  const { visible, set } = useCredit(!!user)
  if (!user) return null
  return (
    <label className={cx(ROW, 'py-2')}>
      <RowIcon>
        <IconFollow size={24} />
      </RowIcon>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block text-ui">{t('credit')}</span>
        <span className="block text-note text-text-secondary">{visible ? t('creditOn') : t('creditOff')}</span>
      </span>
      <Switch checked={visible} disabled={set.isPending} onChange={(e) => set.mutate(e.target.checked)} />
    </label>
  )
}

function Notes() {
  const t = useTranslations('settings')
  const { notes, reload } = usePrivateNotes()
  return (
    <div className="px-4 py-2">
      <div className="flex items-center gap-3">
        <RowIcon>
          <IconNote size={24} />
        </RowIcon>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block text-ui">{t('notes')}</span>
          <span className="block text-note text-text-secondary">{notes ? `${t('notesHint')} ${t('notesCount', { n: notes.length })}` : t('notesHint')}</span>
        </span>
      </div>
      <NotesActions notes={notes} onImported={() => void reload()} className="mt-2 flex gap-2 pl-9 [&_button]:h-10 [&_button]:whitespace-nowrap" />
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
      <button type="button" aria-expanded={open} aria-controls={open ? 's-details' : undefined} onClick={() => setOpen((v) => !v)} className={cx(ROW, 'active:bg-surface')}>
        <RowIcon>
          <IconMore size={24} />
        </RowIcon>
        <span className="min-w-0 flex-1 text-ui">{t('details')}</span>
        <IconChevronDownSmall size={20} className={cx('shrink-0 text-text-secondary motion-safe:transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div id="s-details" className="space-y-3 px-4 pb-2 pl-[52px] text-note leading-relaxed">
          <section>
            <h3 className="font-semibold">{t('data')}</h3>
            <div className="mt-1 text-text-secondary">{health.data ? t('dataBody', { version: health.data.version, images: fmt.number(health.data.images_indexed) }) : <Skeleton className="h-10 w-full" />}</div>
          </section>
          <p className="text-text-secondary">{t('cubeCredit')}</p>
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

function Logout() {
  const t = useTranslations('settings')
  const tc = useTranslations('common')
  const { data: user } = useSession()
  const logout = useLogout()
  const account = useAccount(!!user)
  const ta = useTranslations('account')
  const [confirm, setConfirm] = useState(false)
  if (!user) return null
  return (
    <div className="mt-8 border-t-[0.5px] border-divider pt-2">
      <button type="button" onClick={() => setConfirm(true)} className={cx(ROW, 'font-medium text-danger active:bg-surface')}>
        <span className="text-ui">{t('logout')}</span>
      </button>
      <Sheet open={confirm} onClose={() => setConfirm(false)} title={t('logoutTitle', { nickname: user.nickname })}>
        <div className="space-y-3 px-4 py-4">
          <p className="text-body leading-snug">{isProtected(account.data) ? ta('logoutProtected') : t('logoutBody')}</p>
          <Button variant="danger" className="h-11 w-full font-semibold" disabled={logout.isPending} onClick={() => logout.mutate(undefined, { onSuccess: () => setConfirm(false) })}>
            {t('logout')}
          </Button>
          <Button variant="ghost" className="h-11 w-full" onClick={() => setConfirm(false)}>
            {tc('cancel')}
          </Button>
        </div>
      </Sheet>
    </div>
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
          className={cx(ROW, 'active:bg-surface')}
        >
          <RowIcon>
            <IconQuestion size={24} />
          </RowIcon>
          <span className="min-w-0 flex-1 text-ui">{t('tutorial')}</span>
          <IconChevronRight size={20} className="shrink-0 text-text-secondary" />
        </button>
        <Details />
      </Group>

      <Logout />
    </main>
  )
}
