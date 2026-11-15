'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { DeviceIcon, useDeviceName } from '@/components/account/device-name'
import { QrScanner, type ScannerState } from '@/components/account/qr-scanner'
import { IconCheck, IconWarning } from '@/components/icons'
import { Button, EmptyState, Notice, Skeleton, TopBar } from '@/components/ui/primitives'
import { useApproveLink, useInspectLink } from '@/lib/api/account'
import { ApiError } from '@/lib/api/client'
import { useSession } from '@/lib/api/hooks'
import { cx } from '@/lib/format'
import { cleanCode, isFullCode, LINK_GROUPS, linkCodeFrom } from '@/lib/link-code'

type Step = { kind: 'scan' } | { kind: 'type' } | { kind: 'confirm'; code: string; device: string } | { kind: 'done'; device: string }

const ERRORS = ['link_expired', 'link_used', 'link_not_found'] as const

function errorKey(err: unknown): string {
  const code = err instanceof ApiError ? err.code : ''
  return (ERRORS as readonly string[]).includes(code) ? code : 'generic'
}

function TypeCode({ busy, onCode }: { busy: boolean; onCode: (code: string) => void }) {
  const t = useTranslations('account.connect')
  const [code, setCode] = useState('')
  const ready = isFullCode(code, LINK_GROUPS)
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (ready) onCode(code)
      }}
    >
      <label htmlFor="link-code-input" className="text-body text-text-secondary">
        {t('typeLabel')}
      </label>
      <input
        id="link-code-input"
        autoComplete="off"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        autoFocus
        value={code}
        placeholder="K7QM-4XPA"
        onChange={(e) => setCode(cleanCode(e.target.value, LINK_GROUPS))}
        className="h-12 rounded-full border border-transparent bg-surface px-5 text-center font-mono text-[20px] uppercase tracking-[0.12em] outline-none focus:border-text"
      />
      <Button type="submit" variant="primary" full disabled={!ready || busy} className="h-12 rounded-full font-semibold">
        {t('check')}
      </Button>
    </form>
  )
}

export default function ConnectPage() {
  const t = useTranslations('account.connect')
  const name = useDeviceName()
  const { data: user, isLoading } = useSession()
  const inspect = useInspectLink()
  const approve = useApproveLink()
  const [step, setStep] = useState<Step>({ kind: 'scan' })
  const [camera, setCamera] = useState<ScannerState>('starting')
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  const check = useCallback(
    (code: string) => {
      setError(null)
      inspect.mutate(code, {
        onSuccess: (r) => setStep({ kind: 'confirm', code, device: r.device }),
        onError: (err) => {
          setError(errorKey(err))
          setStep((s) => (s.kind === 'scan' ? { kind: 'type' } : s))
        },
      })
    },
    [inspect],
  )

  useEffect(() => {
    if (!user || started.current) return
    started.current = true
    const code = linkCodeFrom(window.location.hash.slice(1))
    if (!code) return
    history.replaceState(null, '', window.location.pathname)
    check(code)
  }, [user, check])

  if (isLoading) return <Skeleton className="mx-4 mt-16 h-64" />
  if (!user)
    return (
      <main>
        <TopBar title={t('title')} />
        <EmptyState
          title={t('signInFirst')}
          action={
            <Link href="/login" className="inline-flex h-11 items-center rounded-[var(--radius-button)] bg-accent px-4 font-semibold text-on-accent">
              {t('signIn')}
            </Link>
          }
        />
      </main>
    )

  return (
    <main className="pb-10">
      <TopBar title={t('title')} />
      <div className="flex flex-col gap-4 px-4 pt-2">
        {step.kind === 'scan' && (
          <>
            <QrScanner label={t('aim')} onCode={check} onState={setCamera} />
            <p className="text-center text-body text-text-secondary">{camera === 'denied' ? t('cameraDenied') : camera === 'unavailable' ? t('cameraMissing') : t('aim')}</p>
            <Button variant={camera === 'denied' || camera === 'unavailable' ? 'primary' : 'secondary'} full onClick={() => setStep({ kind: 'type' })} className="h-12 rounded-full font-semibold">
              {t('type')}
            </Button>
          </>
        )}
        {step.kind === 'type' && (
          <>
            <TypeCode busy={inspect.isPending} onCode={check} />
            <button type="button" onClick={() => setStep({ kind: 'scan' })} className="mx-auto min-h-11 text-ui font-semibold text-link">
              {t('camera')}
            </button>
          </>
        )}
        {error && (step.kind === 'type' || step.kind === 'confirm') && (
          <p role="alert" className="text-center text-note text-danger">
            {t(`errors.${error}`)}
          </p>
        )}
        {step.kind === 'confirm' && (
          <div className="flex flex-col items-center gap-4 pt-4 text-center">
            <span className="inline-flex size-16 items-center justify-center rounded-full bg-surface" aria-hidden="true">
              <DeviceIcon device={step.device} size={34} />
            </span>
            <h2 className="font-[family-name:var(--font-display)] text-title-md font-bold">{t('confirmTitle', { device: name(step.device) })}</h2>
            <Notice tone="warning" icon={<IconWarning size={20} />}>
              <span className="block text-left">{t('confirmBody')}</span>
            </Notice>
            <Button
              variant="primary"
              full
              disabled={approve.isPending}
              onClick={() =>
                approve.mutate(step.code, {
                  onSuccess: () => setStep({ kind: 'done', device: step.device }),
                  onError: (err) => setError(errorKey(err)),
                })
              }
              className="h-12 rounded-full font-semibold"
            >
              {t('approve')}
            </Button>
            <Button
              variant="ghost"
              full
              onClick={() => {
                setError(null)
                setStep({ kind: 'scan' })
              }}
              className="h-11"
            >
              {t('cancel')}
            </Button>
          </div>
        )}
        {step.kind === 'done' && (
          <div className="flex flex-col items-center gap-4 pt-8 text-center">
            <span className="inline-flex size-16 items-center justify-center rounded-full bg-success text-bg" aria-hidden="true">
              <IconCheck size={36} />
            </span>
            <h2 role="status" className="font-[family-name:var(--font-display)] text-title-md font-bold">
              {t('done', { device: name(step.device) })}
            </h2>
            <Link href="/me/devices" className={cx('inline-flex h-11 items-center rounded-[var(--radius-button)] bg-surface px-4 font-semibold active:bg-surface-pressed')}>
              {t('back')}
            </Link>
          </div>
        )}
      </div>
    </main>
  )
}
