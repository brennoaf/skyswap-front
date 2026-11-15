'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Button, Sheet, Wordmark } from '@/components/ui/primitives'
import { ApiError } from '@/lib/api/client'
import { useLogin } from '@/lib/api/hooks'
import { AvatarChoices, useAvatarChoice } from '@/components/me/avatar-parts'
import { useUi } from '@/lib/state/ui'

export function LoginForm({ onDone }: { onDone?: () => void }) {
  const t = useTranslations('auth')
  const [nick, setNick] = useState('')
  const login = useLogin()
  const choice = useAvatarChoice()
  const valid = /^[A-Za-z0-9_.]{3,24}$/.test(nick)
  const error = login.error instanceof ApiError ? login.error.code : login.error ? 'request_failed' : null
  return (
    <form
      className="flex flex-col gap-3 px-6 pb-4 pt-2"
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
      <label htmlFor="nickname" className="text-note text-text-secondary">
        {t('nicknameLabel')}
      </label>
      <input
        id="nickname"
        autoFocus
        autoComplete="nickname"
        inputMode="text"
        value={nick}
        onChange={(e) => setNick(e.target.value.replace(/\s/g, ''))}
        maxLength={24}
        placeholder={t('nicknamePlaceholder')}
        aria-invalid={!!error}
        aria-describedby="nickname-help"
        className="h-11 rounded-[var(--radius-input)] border-[0.5px] border-divider bg-surface px-3 text-ui outline-none focus:border-text"
      />
      <p id="nickname-help" className={error ? 'text-meta text-danger' : 'text-meta text-text-secondary'}>
        {error ? t(`errors.${error === 'nickname_taken' ? 'taken' : error === 'avatar_taken' ? 'pictureTaken' : error === 'invalid_request' || error === 'invalid_nickname' ? 'invalid' : 'generic'}`) : t('nicknameHelp')}
      </p>
      <AvatarChoices choice={choice} />
      <Button type="submit" variant="primary" full disabled={!valid || login.isPending} className="h-11">
        {login.isPending ? t('joining') : t('join')}
      </Button>
      <p className="text-center text-meta text-text-secondary">{t('privacy')}</p>
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
        <h2 id="login-title" className="mt-2 text-title-md font-semibold">
          {t('title')}
        </h2>
        <p className="mt-1 text-text-secondary">{reason ? t(`reasons.${reason}`) : ''}</p>
      </div>
      <LoginForm onDone={close} />
    </Sheet>
  )
}
