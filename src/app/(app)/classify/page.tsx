'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { SwapHelpSheet } from '@/components/classify/swap-sheets'
import { IconQuestion } from '@/components/icons'
import { LoginForm } from '@/components/shell/login-sheet'
import { IconButton, TopBar } from '@/components/ui/primitives'
import { useSession } from '@/lib/api/hooks'
import { Deck } from './deck/deck'
import { DeckSkeleton, StateScreen } from './deck/deck-states'

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
          <div className="mx-auto max-w-96 pt-4">
            <LoginForm />
          </div>
        </div>
      )}
      <SwapHelpSheet open={help} onClose={() => setHelp(false)} />
    </main>
  )
}
