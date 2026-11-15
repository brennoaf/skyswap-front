'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { QrCode } from '@/components/account/qr-code'
import { RecoveryCodeView } from '@/components/account/recovery-code'
import { SaveHere } from '@/components/account/protect'
import { IconFingerprint, IconQr } from '@/components/icons'
import { Button, Skeleton, TopBar, Wordmark } from '@/components/ui/primitives'
import { ApiError } from '@/lib/api/client'
import { useLinkLogin, usePasskeyLogin, usePasskeySupport, useRecover } from '@/lib/api/account'
import { useSession } from '@/lib/api/hooks'
import { cx } from '@/lib/format'
import { cleanCode, isFullCode, linkUrl, RECOVERY_GROUPS } from '@/lib/link-code'
import { useUi } from '@/lib/state/ui'

type Step = { kind: 'choose' } | { kind: 'qr' } | { kind: 'recover' } | { kind: 'newCode'; code: string; nickname: string } | { kind: 'save'; nickname: string }

const COMPUTER = '(hover: hover) and (pointer: fine)'
const BIG = 'h-12 rounded-full font-semibold'
const FIELD = 'flex h-12 items-center rounded-full border bg-surface px-4 transition-colors focus-within:border-text'

function useIsComputer(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(COMPUTER)
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    () => window.matchMedia(COMPUTER).matches,
    () => false,
  )
}

function useOrigin(): string {
  return useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => '',
  )
}

function Choose({ onQr, onRecover, onPasskey }: { onQr: () => void; onRecover: () => void; onPasskey: (nickname: string) => void }) {
  const t = useTranslations('account.login')
  const computer = useIsComputer()
  const supported = usePasskeySupport()
  const passkey = usePasskeyLogin()
  const ask = useUi((s) => s.askLogin)
  const failure = passkey.error instanceof ApiError && passkey.error.code === 'passkey_unknown' ? t('passkeyUnknown') : passkey.isError ? t('passkeyFailed') : null
  return (
    <div className="flex flex-col gap-3 px-6 pt-2">
      <Button variant="primary" full onClick={onQr} className={BIG}>
        <IconQr size={24} />
        {computer ? t('withPhone') : t('withOther')}
      </Button>
      <Button variant="secondary" full disabled={!supported || passkey.isPending} onClick={() => passkey.mutate(undefined, { onSuccess: (u) => u && onPasskey(u.nickname) })} className={BIG}>
        <IconFingerprint size={24} />
        {computer ? t('passkeyComputer') : t('passkeyPhone')}
      </Button>
      <p role="alert" className="min-h-4 text-center text-note text-danger">
        {failure ?? (supported === false ? t('noPasskey') : '')}
      </p>
      <button type="button" onClick={onRecover} className="mx-auto min-h-11 text-ui font-semibold text-link">
        {t('recover')}
      </button>
      <p className="mt-6 text-center text-body text-text-secondary">
        {t('newHere')}{' '}
        <button type="button" onClick={() => ask('me')} className="min-h-11 font-semibold text-text">
          {t('pickNickname')}
        </button>
      </p>
    </div>
  )
}

function QrStep({ onApproved }: { onApproved: (nickname: string) => void }) {
  const t = useTranslations('account.qr')
  const origin = useOrigin()
  const link = useLinkLogin(true, onApproved)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const left = link.deadline ? Math.max(0, Math.min(1, (link.deadline - now) / 120_000)) : 0
  return (
    <div className="flex flex-col items-center gap-4 px-6 pt-2">
      <div className="relative" aria-busy={link.state === 'loading'}>
        {link.code && origin ? (
          <QrCode value={linkUrl(origin, link.code)} label={t('alt')} className={cx(link.state === 'expired' && 'opacity-10 blur-[2px]')} />
        ) : (
          <Skeleton className="size-[216px] rounded-xl" />
        )}
        {(link.state === 'expired' || link.state === 'error') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
            <p className="text-ui font-semibold">{link.state === 'expired' ? t('expired') : t('error')}</p>
            <Button variant="primary" onClick={link.refresh} className="font-semibold">
              {t('refresh')}
            </Button>
          </div>
        )}
      </div>
      {link.state === 'waiting' && (
        <div className="h-1 w-[216px] overflow-hidden rounded-full bg-surface" role="progressbar" aria-label={t('time')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(left * 100)}>
          <div className="h-full rounded-full bg-accent motion-safe:transition-[width] motion-safe:duration-1000" style={{ width: `${left * 100}%` }} />
        </div>
      )}
      <div className="text-center">
        <p className="text-note text-text-secondary">{t('or')}</p>
        <p data-testid="link-code" className="mt-0.5 font-mono text-[22px] font-semibold tabular-nums tracking-[0.12em]">
          {link.code && link.state === 'waiting' ? link.code : ' '}
        </p>
      </div>
      <ol className="w-full max-w-[340px] list-decimal space-y-1.5 pl-5 text-body leading-snug marker:font-semibold marker:text-text-secondary">
        <li>{t('step1')}</li>
        <li>{t('step2')}</li>
        <li>{t('step3')}</li>
      </ol>
      <p className="sr-only" aria-live="polite">
        {link.state === 'waiting' ? t('waiting') : link.state === 'expired' ? t('expired') : ''}
      </p>
    </div>
  )
}

function RecoverStep({ onRecovered }: { onRecovered: (code: string, nickname: string) => void }) {
  const t = useTranslations('account.recover')
  const recover = useRecover()
  const [nickname, setNickname] = useState('')
  const [code, setCode] = useState('')
  const ready = /^[A-Za-z0-9_.]{3,24}$/.test(nickname) && isFullCode(code, RECOVERY_GROUPS)
  const failed = recover.isError
  return (
    <form
      className="flex flex-col gap-3 px-6 pt-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (ready) recover.mutate({ nickname, code }, { onSuccess: (r) => onRecovered(r.code, r.user.nickname) })
      }}
    >
      <label htmlFor="recover-nickname" className="sr-only">
        {t('nickname')}
      </label>
      <div className={cx(FIELD, failed ? 'border-danger' : 'border-transparent')}>
        <span className="text-ui text-text-secondary" aria-hidden="true">
          @
        </span>
        <input
          id="recover-nickname"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={nickname}
          maxLength={24}
          placeholder={t('nickname')}
          onChange={(e) => {
            recover.reset()
            setNickname(e.target.value.replace(/[^A-Za-z0-9_.]/g, ''))
          }}
          className="h-full min-w-0 flex-1 bg-transparent pl-0.5 text-ui outline-none placeholder:text-text-secondary"
        />
      </div>
      <label htmlFor="recover-code" className="sr-only">
        {t('code')}
      </label>
      <div className={cx(FIELD, failed ? 'border-danger' : 'border-transparent')}>
        <input
          id="recover-code"
          autoComplete="one-time-code"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          value={code}
          placeholder={t('code')}
          aria-describedby="recover-help"
          onChange={(e) => {
            recover.reset()
            setCode(cleanCode(e.target.value, RECOVERY_GROUPS))
          }}
          className="h-full min-w-0 flex-1 bg-transparent font-mono text-ui uppercase tracking-[0.08em] outline-none placeholder:font-sans placeholder:normal-case placeholder:tracking-normal placeholder:text-text-secondary"
        />
      </div>
      <p id="recover-help" role={failed ? 'alert' : undefined} className={cx('min-h-4 px-4 text-meta', failed ? 'text-danger' : 'text-text-secondary')}>
        {failed ? (recover.error instanceof ApiError && recover.error.status === 429 ? t('slowDown') : t('failed')) : t('hint')}
      </p>
      <Button type="submit" variant="primary" full disabled={!ready || recover.isPending} className={BIG}>
        {recover.isPending ? t('submitting') : t('submit')}
      </Button>
    </form>
  )
}

export default function LoginPage() {
  const t = useTranslations('account')
  const router = useRouter()
  const { data: user, isLoading } = useSession()
  const [step, setStep] = useState<Step>({ kind: 'choose' })
  const supported = usePasskeySupport()
  const toMe = () => router.replace('/me')
  const signedIn = (nickname: string) => (supported ? setStep({ kind: 'save', nickname }) : toMe())

  useEffect(() => {
    if (user && step.kind === 'choose') router.replace('/me')
  }, [user, step.kind, router])

  const titles: Record<Step['kind'], string> = { choose: t('login.title'), qr: t('qr.title'), recover: t('recover.title'), newCode: '', save: '' }
  const back = step.kind === 'qr' || step.kind === 'recover'
  return (
    <main className="pb-8">
      <TopBar title="" onBack={back ? () => setStep({ kind: 'choose' }) : undefined} />
      {titles[step.kind] && (
        <div className="flex flex-col items-center px-6 pb-5 text-center">
          <Wordmark className="text-wordmark-lg" />
          <h1 className="mt-2 text-body text-text-secondary">{titles[step.kind]}</h1>
        </div>
      )}
      {isLoading && step.kind === 'choose' ? (
        <div className="flex flex-col gap-3 px-6">
          <Skeleton className="h-12 w-full rounded-full" />
          <Skeleton className="h-12 w-full rounded-full" />
        </div>
      ) : step.kind === 'choose' ? (
        <Choose onQr={() => setStep({ kind: 'qr' })} onRecover={() => setStep({ kind: 'recover' })} onPasskey={toMe} />
      ) : step.kind === 'qr' ? (
        <QrStep onApproved={signedIn} />
      ) : step.kind === 'recover' ? (
        <RecoverStep onRecovered={(code, nickname) => setStep({ kind: 'newCode', code, nickname })} />
      ) : step.kind === 'newCode' ? (
        <RecoveryCodeView code={step.code} fresh onDone={() => signedIn(step.nickname)} />
      ) : (
        <SaveHere nickname={step.nickname} onDone={toMe} />
      )}
    </main>
  )
}
