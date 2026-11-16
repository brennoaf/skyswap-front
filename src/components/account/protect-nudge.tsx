'use client'

import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { IconClose, IconShield } from '@/components/icons'
import { Button, IconButton } from '@/components/ui/primitives'
import { PROTECT_AFTER_ANSWERS } from '@/lib/api/account'
import { useSession } from '@/lib/api/hooks'
import { useAccountUi } from '@/lib/state/account'
import { ProtectSheet, useNeedsProtection } from './protect'

const QUIET = ['/classify', '/reels', '/login', '/me/devices', '/me/connect']

export function ProtectNudge() {
  const t = useTranslations('account.protect')
  const pathname = usePathname()
  const { data: user } = useSession()
  const dismissed = useAccountUi((s) => s.nudgeDismissed)
  const dismiss = useAccountUi((s) => s.dismissNudge)
  const offer = useAccountUi((s) => s.offer)
  const clearOffer = useAccountUi((s) => s.clearOffer)
  const quiet = QUIET.some((p) => pathname.startsWith(p))
  const { account, needed } = useNeedsProtection(!!user && !dismissed && !quiet)
  const [open, setOpen] = useState(false)
  const show = !!user && !dismissed && !quiet && needed && (account.data?.answers ?? 0) >= PROTECT_AFTER_ANSWERS
  return (
    <>
      {show && !open && !offer && (
        <aside
          aria-labelledby="protect-nudge"
          className="fixed inset-x-0 bottom-[calc(var(--height-bottomnav)+env(safe-area-inset-bottom)+8px)] z-40 mx-auto w-full max-w-[var(--width-app)] px-3"
        >
          <div className="flex items-center gap-3 rounded-2xl bg-sheet py-2 pl-4 pr-1 shadow-[0_8px_30px_rgb(0_0_0/0.35)] ring-1 ring-divider">
            <IconShield size={26} className="shrink-0" />
            <div className="min-w-0 flex-1 leading-tight">
              <p id="protect-nudge" className="text-ui font-semibold">
                {t('nudgeTitle')}
              </p>
              <p className="text-note text-text-secondary">{t('nudgeBody')}</p>
            </div>
            <Button variant="primary" onClick={() => setOpen(true)} className="shrink-0 font-semibold">
              {t('nudgeAction')}
            </Button>
            <IconButton label={t('dismiss')} onClick={dismiss}>
              <IconClose size={22} />
            </IconButton>
          </div>
        </aside>
      )}
      <ProtectSheet
        open={open || offer}
        skip={offer && !open}
        onClose={() => {
          setOpen(false)
          clearOffer()
        }}
      />
    </>
  )
}
