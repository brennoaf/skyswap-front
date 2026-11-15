'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { SwapHelpSheet } from '@/components/classify/swap-sheets'
import { IconMoves, IconQuestion } from '@/components/icons'
import { LoginForm } from '@/components/shell/login-sheet'
import { IconButton, TopBar } from '@/components/ui/primitives'
import { useSession } from '@/lib/api/hooks'
import { Deck } from './deck/deck'
import { DeckSkeleton, StateScreen } from './deck/deck-states'

function LoginIntro() {
  const t = useTranslations('classify')
  return (
    <div className="pt-6">
      <div className="flex flex-col items-center px-6 text-center">
        <span className="mb-4 inline-flex size-16 items-center justify-center rounded-full border-[0.5px] border-divider bg-bg-elevated text-text" aria-hidden="true">
          <IconMoves size={40} />
        </span>
        <h2 className="font-[family-name:var(--font-display)] text-title-lg font-bold leading-tight">{t('loginTitle')}</h2>
        <p className="mt-2 max-w-80 text-text-secondary">{t('loginBody')}</p>
      </div>
      <div className="mx-auto mt-4 max-w-96">
        <LoginForm />
      </div>
    </div>
  )
}

export default function ClassifyPage() {
  const t = useTranslations('classify')
  const session = useSession()
  const user = session.data
  const [help, setHelp] = useState(false)
  const openHelp = () => setHelp(true)
  return (
    <main className="flex h-[calc(100dvh-var(--height-bottomnav)-env(safe-area-inset-bottom))] flex-col overflow-hidden">
      {user ? (
        <Deck key={user.id} userId={user.id} onHelp={openHelp} />
      ) : session.isLoading ? (
        <DeckSkeleton onHelp={openHelp} />
      ) : session.isError ? (
        <StateScreen kind="failed" busy={session.isFetching} onRetry={() => void session.refetch()} onHelp={openHelp} />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <TopBar
            title={t('title')}
            back={false}
            actions={
              <IconButton label={t('help.open')} onClick={openHelp}>
                <IconQuestion size={26} />
              </IconButton>
            }
          />
          <LoginIntro />
        </div>
      )}
      <SwapHelpSheet open={help} onClose={() => setHelp(false)} />
    </main>
  )
}
