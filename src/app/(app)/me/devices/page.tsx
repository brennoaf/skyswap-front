'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { DeviceIcon, useDeviceName } from '@/components/account/device-name'
import { ProtectSheet } from '@/components/account/protect'
import { RecoveryCodeView } from '@/components/account/recovery-code'
import { IconChevronRight, IconQr, IconShield } from '@/components/icons'
import { useAgo } from '@/components/me/profile-parts'
import { Button, EmptyState, Sheet, Skeleton, TopBar } from '@/components/ui/primitives'
import { isProtected, useAccount, useNewRecoveryCode, useRemoveDevice, type Account, type Device } from '@/lib/api/account'
import { useSession } from '@/lib/api/hooks'
import { cx } from '@/lib/format'
import { useUi } from '@/lib/state/ui'

const ROW = 'flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left'

function Protection({ account }: { account: Account }) {
  const t = useTranslations('account')
  const [protect, setProtect] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [code, setCode] = useState<string | null>(null)
  const fresh = useNewRecoveryCode()
  const tc = useTranslations('common')
  const sheet = <ProtectSheet open={protect} onClose={() => setProtect(false)} />
  if (!isProtected(account) || protect)
    return (
      <section className="mx-4 mt-2 flex flex-col gap-3 rounded-2xl bg-surface p-4" aria-labelledby="protect-card">
        <div className="flex items-start gap-3">
          <IconShield size={28} className="shrink-0" />
          <div className="min-w-0 leading-snug">
            <h2 id="protect-card" className="text-ui font-semibold">
              {t('protect.title')}
            </h2>
            <p className="text-note text-text-secondary">{t('protect.body')}</p>
          </div>
        </div>
        <Button variant="primary" full onClick={() => setProtect(true)} className="h-11 font-semibold">
          {t('protect.nudgeAction')}
        </Button>
        {sheet}
      </section>
    )
  return (
    <section aria-labelledby="protected" className="px-4 pt-2">
      <div className="flex items-center gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-surface text-success">
          <IconShield size={26} />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <h2 id="protected" className="text-ui font-semibold">
            {t('devices.protected')}
          </h2>
          <p className="text-note text-text-secondary">{t('devices.protectedBody', { passkeys: account.passkeys, recovery: String(account.recovery) })}</p>
        </div>
      </div>
      <button type="button" onClick={() => setConfirm(true)} className="mt-1 min-h-11 pl-[52px] text-note font-semibold text-link">
        {account.recovery ? t('devices.newCode') : t('devices.addCode')}
      </button>
      <Sheet open={confirm} onClose={() => setConfirm(false)} title={code ? undefined : t('devices.newCodeTitle')} labelledBy={code ? 'recovery-title' : undefined}>
        {code ? (
          <RecoveryCodeView
            code={code}
            onDone={() => {
              setCode(null)
              setConfirm(false)
            }}
          />
        ) : (
          <div className="space-y-3 px-4 py-4">
            {account.recovery && <p className="text-body leading-snug">{t('devices.newCodeBody')}</p>}
            <Button variant="primary" className="h-11 w-full font-semibold" disabled={fresh.isPending} onClick={() => fresh.mutate(undefined, { onSuccess: setCode })}>
              {t('devices.newCodeConfirm')}
            </Button>
            <Button variant="ghost" className="h-11 w-full" onClick={() => setConfirm(false)}>
              {tc('cancel')}
            </Button>
          </div>
        )}
      </Sheet>
    </section>
  )
}

function DeviceRow({ device, onSignOut }: { device: Device; onSignOut: () => void }) {
  const t = useTranslations('account.devices')
  const name = useDeviceName()
  const ago = useAgo()
  const label = name(device.device)
  const details = [device.current ? t('current') : t('seen', { ago: ago(device.last_seen) }), device.passkey ? t('withPasskey') : null].filter(Boolean).join(', ')
  return (
    <li className={ROW} data-testid="device-row" data-current={device.current || undefined}>
      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-surface" aria-hidden="true">
        <DeviceIcon device={device.device} />
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-ui font-medium">{label}</span>
        <span className={cx('block text-note', device.current ? 'font-semibold text-success' : 'text-text-secondary')}>{details}</span>
      </span>
      <Button onClick={onSignOut} aria-label={t('signOutLabel', { device: label })} className="shrink-0 font-semibold">
        {t('signOut')}
      </Button>
    </li>
  )
}

function SignOutSheet({ device, account, onClose }: { device: Device | null; account: Account; onClose: () => void }) {
  const t = useTranslations('account.devices')
  const tc = useTranslations('common')
  const name = useDeviceName()
  const remove = useRemoveDevice()
  return (
    <Sheet open={!!device} onClose={onClose} title={t('confirmTitle')}>
      {device && (
        <div className="space-y-3 px-4 py-4">
          <p className="text-body leading-snug">{device.current ? t('confirmCurrent') : t('confirmOther', { device: name(device.device) })}</p>
          {!device.current && device.passkey && <p className="text-body leading-snug">{t('confirmPasskey')}</p>}
          {device.current && !isProtected(account) && <p className="text-body font-semibold leading-snug text-danger">{t('confirmUnprotected')}</p>}
          <Button variant="danger" className="h-11 w-full font-semibold" disabled={remove.isPending} onClick={() => remove.mutate(device.id, { onSuccess: onClose })}>
            {t('confirm')}
          </Button>
          <Button variant="ghost" className="h-11 w-full" onClick={onClose}>
            {tc('cancel')}
          </Button>
        </div>
      )}
    </Sheet>
  )
}

export default function DevicesPage() {
  const t = useTranslations('account.devices')
  const tc = useTranslations('common')
  const { data: user, isLoading } = useSession()
  const account = useAccount(!!user)
  const ask = useUi((s) => s.askLogin)
  const [leaving, setLeaving] = useState<Device | null>(null)

  if (!isLoading && !user)
    return (
      <main>
        <TopBar title={t('title')} />
        <EmptyState title={t('signedOut')} action={<Button variant="primary" onClick={() => ask('me')}>{t('signIn')}</Button>} />
      </main>
    )
  return (
    <main className="pb-10">
      <TopBar title={t('title')} />
      {account.data ? (
        <>
          <Protection account={account.data} />
          <Link href="/me/connect" className={cx(ROW, 'mt-3 border-y-[0.5px] border-divider active:bg-surface')}>
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent" aria-hidden="true">
              <IconQr size={24} />
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block text-ui font-semibold">{t('connect')}</span>
              <span className="block text-note text-text-secondary">{t('connectHint')}</span>
            </span>
            <IconChevronRight size={20} className="shrink-0 text-text-secondary" />
          </Link>
          <h2 className="px-4 pb-1 pt-5 text-meta font-semibold uppercase tracking-wide text-text-secondary">{t('list')}</h2>
          <ul>
            {account.data.devices.map((d) => (
              <DeviceRow key={d.id} device={d} onSignOut={() => setLeaving(d)} />
            ))}
          </ul>
          <SignOutSheet device={leaving} account={account.data} onClose={() => setLeaving(null)} />
        </>
      ) : account.isError ? (
        <EmptyState title={t('error')} action={<Button onClick={() => void account.refetch()}>{tc('retry')}</Button>} />
      ) : (
        <div className="space-y-3 px-4 pt-2">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      )}
    </main>
  )
}
