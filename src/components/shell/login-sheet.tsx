'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { IconCheck, IconDice, IconLock } from '@/components/icons'
import { AvatarCarousel, useAvatarChoice } from '@/components/me/avatar-parts'
import { Button, Sheet, Wordmark } from '@/components/ui/primitives'
import { ApiError } from '@/lib/api/client'
import { useLogin } from '@/lib/api/hooks'
import { cx } from '@/lib/format'
import { useUi } from '@/lib/state/ui'

const SKY_NAMES = ['vega', 'orion', 'lyra', 'sirius', 'rigel', 'altair', 'antares', 'polaris', 'andromeda', 'perseus', 'draco', 'aquila', 'cygnus', 'phoenix', 'hydra', 'carina', 'nebula', 'quasar', 'pulsar', 'nova', 'aurora', 'zenith']

function suggestNickname(previous: string): string {
  const pool = SKY_NAMES.filter((n) => !previous.startsWith(n))
  const name = pool[Math.floor(Math.random() * pool.length)]
  return `${name}_${10 + Math.floor(Math.random() * 990)}`
}

type Choice = ReturnType<typeof useAvatarChoice>

function ProfilePreview({ choice, nick }: { choice: Choice; nick: string }) {
  return <AvatarCarousel choice={choice} hero={168} name={nick} />
}

export function LoginForm({ onDone }: { onDone?: () => void }) {
  const t = useTranslations('auth')
  const ta = useTranslations('account.login')
  const [nick, setNick] = useState('')
  const login = useLogin()
  const choice = useAvatarChoice()
  const valid = /^[A-Za-z0-9_.]{3,24}$/.test(nick)
  const error = login.error instanceof ApiError ? login.error.code : login.error ? 'request_failed' : null
  const errorKey = error === 'nickname_taken' ? 'taken' : error === 'avatar_taken' ? 'pictureTaken' : error === 'invalid_request' || error === 'invalid_nickname' ? 'invalid' : 'generic'
  const change = (value: string) => {
    if (login.error) login.reset()
    setNick(value.replace(/[^A-Za-z0-9_.]/g, '').slice(0, 24))
  }
  return (
    <form
      className="flex flex-col gap-5 px-6 pb-4 pt-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!valid) return
        login.mutate(
          { nickname: nick, avatarId: choice.selected?.id },
          {
            onSuccess: () => onDone?.(),
            onError: (err) => {
              if (err instanceof ApiError && err.code === 'avatar_taken') choice.redraw()
            },
          },
        )
      }}
    >
      <ProfilePreview choice={choice} nick={nick} />
      <div className="flex flex-col gap-1">
        <label htmlFor="nickname" className="sr-only">
          {t('nicknameLabel')}
        </label>
        <div className={cx('flex h-12 items-center rounded-full border bg-surface pl-4 pr-1 transition-colors focus-within:border-text', error ? 'border-danger' : 'border-transparent')}>
          <span className="text-ui text-text-secondary" aria-hidden="true">
            @
          </span>
          <input
            id="nickname"
            autoComplete="nickname"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            inputMode="text"
            enterKeyHint="go"
            value={nick}
            onChange={(e) => change(e.target.value)}
            maxLength={24}
            placeholder={t('nicknameLabel')}
            aria-invalid={!!error}
            aria-describedby="nickname-help"
            className="h-full min-w-0 flex-1 bg-transparent pl-0.5 pr-2 text-ui outline-none placeholder:text-text-secondary"
          />
          {valid && !error && (
            <span className="mr-1 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-success text-bg" aria-hidden="true">
              <IconCheck size={18} />
            </span>
          )}
          <button type="button" aria-label={t('suggest')} onClick={() => change(suggestNickname(nick))} className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-text-secondary active:bg-surface-pressed">
            <IconDice size={24} />
          </button>
        </div>
        <p id="nickname-help" aria-live="polite" className={cx('min-h-4 px-4 text-meta', error ? 'text-danger' : 'text-text-secondary')}>
          {error ? t(`errors.${errorKey}`) : nick.length > 0 && nick.length < 3 ? t('tooShort') : ''}
        </p>
      </div>
      <Button type="submit" variant="primary" full disabled={!valid || login.isPending} className="h-12 rounded-full font-semibold">
        {login.isPending ? t('joining') : t('join')}
      </Button>
      <p className="flex items-center justify-center gap-1.5 text-meta text-text-secondary">
        <IconLock size={16} className="shrink-0" />
        <span>{t('noPassword')}</span>
      </p>
      <Link href="/login" onClick={onDone} className="mx-auto inline-flex min-h-11 items-center text-ui font-semibold text-link">
        {ta('haveAccount')}
      </Link>
    </form>
  )
}

export function LoginSheet() {
  const t = useTranslations('auth')
  const reason = useUi((s) => s.authReason)
  const close = useUi((s) => s.closeLogin)
  return (
    <Sheet open={reason !== null} onClose={close} labelledBy="login-title">
      <div className="flex flex-col items-center px-6 pt-4 text-center">
        <Wordmark className="text-wordmark-lg" />
        <h2 id="login-title" className="mt-2 text-body text-text-secondary">
          {reason ? t(`reasons.${reason}`) : t('title')}
        </h2>
      </div>
      <LoginForm onDone={close} />
    </Sheet>
  )
}
