'use client'

import { useTranslations } from 'next-intl'
import { useState, type ReactNode } from 'react'
import { IconFingerprint, IconShield } from '@/components/icons'
import { Button, Sheet } from '@/components/ui/primitives'
import { isProtected, useAccount, useCreatePasskey, useNewRecoveryCode, usePasskeySupport } from '@/lib/api/account'
import { useUi } from '@/lib/state/ui'
import { RecoveryCodeView } from './recovery-code'

function Hero({ icon, title, body, id }: { icon: ReactNode; title: string; body: string; id?: string }) {
  return (
    <div className="flex flex-col items-center px-6 pt-2 text-center">
      <span className="inline-flex size-16 items-center justify-center rounded-full bg-surface text-text" aria-hidden="true">
        {icon}
      </span>
      <h2 id={id} className="mt-3 font-[family-name:var(--font-display)] text-title-md font-bold">
        {title}
      </h2>
      <p className="mt-1 text-body text-text-secondary">{body}</p>
    </div>
  )
}

export function ProtectFlow({ onDone }: { onDone: () => void }) {
  const t = useTranslations('account.protect')
  const toast = useUi((s) => s.toast)
  const supported = usePasskeySupport()
  const account = useAccount()
  const passkey = useCreatePasskey()
  const recovery = useNewRecoveryCode()
  const [code, setCode] = useState<string | null>(null)
  const finish = () => {
    toast({ kind: 'info', key: 'account.protect.done' })
    onDone()
  }
  const afterPasskey = () => {
    if (account.data?.recovery) return finish()
    recovery.mutate(undefined, { onSuccess: setCode })
  }

  if (code) return <RecoveryCodeView code={code} onDone={finish} />
  const busy = passkey.isPending || recovery.isPending
  return (
    <div className="flex flex-col gap-4 pb-4">
      <Hero id="protect-title" icon={<IconShield size={34} />} title={t('title')} body={t('body')} />
      <div className="flex flex-col gap-2 px-6">
        {supported !== false && (
          <>
            <Button variant="primary" full disabled={busy || supported === null} onClick={() => passkey.mutate(undefined, { onSuccess: afterPasskey })} className="h-12 rounded-full font-semibold">
              <IconFingerprint size={24} />
              {passkey.isPending ? t('creating') : t('create')}
            </Button>
            <p className="px-2 text-center text-note text-text-secondary">{t('passkeyHint')}</p>
          </>
        )}
        {supported === false && <p className="text-center text-body text-text-secondary">{t('unsupported')}</p>}
        {passkey.isError && (
          <p role="alert" className="text-center text-note text-danger">
            {t('failed')}
          </p>
        )}
        {(supported === false || passkey.isError) && (
          <Button variant={supported === false ? 'primary' : 'secondary'} full disabled={busy} onClick={() => recovery.mutate(undefined, { onSuccess: setCode })} className="h-12 rounded-full font-semibold">
            {t('codeOnly')}
          </Button>
        )}
      </div>
    </div>
  )
}

export function ProtectSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} labelledBy="protect-title">
      {open && <ProtectFlow onDone={onClose} />}
    </Sheet>
  )
}

export function SaveHere({ nickname, onDone }: { nickname: string; onDone: () => void }) {
  const t = useTranslations('account.saveHere')
  const supported = usePasskeySupport()
  const passkey = useCreatePasskey()
  return (
    <div className="flex flex-col gap-4 pb-4">
      <Hero icon={<IconFingerprint size={34} />} title={t('title', { nickname })} body={t('body')} />
      <div className="flex flex-col gap-2 px-6">
        <Button variant="primary" full disabled={passkey.isPending || !supported} onClick={() => passkey.mutate(undefined, { onSuccess: onDone })} className="h-12 rounded-full font-semibold">
          {t('save')}
        </Button>
        <Button variant="ghost" full onClick={onDone} className="h-11">
          {t('later')}
        </Button>
        {passkey.isError && (
          <p role="alert" className="text-center text-note text-danger">
            {t('failed')}
          </p>
        )}
      </div>
    </div>
  )
}

export function useNeedsProtection(enabled: boolean) {
  const account = useAccount(enabled)
  return { account, needed: !!account.data && !isProtected(account.data) }
}
