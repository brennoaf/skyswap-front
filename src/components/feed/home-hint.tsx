'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { IconClose } from '@/components/icons'
import { IconButton } from '@/components/ui/primitives'
import { useMe, useSession } from '@/lib/api/hooks'
import { useUi } from '@/lib/state/ui'

export function useFirstVisitHints(): { ready: boolean; homeHint: boolean } {
  const tourDone = useUi((s) => s.onboardingDone && s.languageChosen)
  const dismissed = useUi((s) => s.homeHintDismissed)
  const { data: user, isLoading } = useSession()
  const me = useMe(!!user)
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])
  const ready = hydrated && tourDone && !isLoading && !(user && me.isLoading)
  const answered = !!user && (me.data?.counts.votes ?? 1) > 0
  return { ready, homeHint: ready && !dismissed && !answered }
}

export function HomeHint() {
  const t = useTranslations('home.hint')
  const dismiss = useUi((s) => s.dismissHomeHint)
  const { homeHint } = useFirstVisitHints()
  if (!homeHint) return null
  return (
    <div className="mx-4 mb-2 flex min-h-11 items-center gap-2 rounded-xl bg-surface pl-3 text-note">
      <p className="min-w-0 flex-1 py-1.5 text-text-secondary">{t('text')}</p>
      <Link href="/classify" className="inline-flex h-11 shrink-0 items-center font-semibold text-link">
        {t('action')}
      </Link>
      <IconButton label={t('dismiss')} onClick={dismiss}>
        <IconClose size={20} />
      </IconButton>
    </div>
  )
}
