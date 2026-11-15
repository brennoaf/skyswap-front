'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import type { CSSProperties, ReactNode } from 'react'
import { IconClose, IconQuestion } from '@/components/icons'
import { IconButton } from '@/components/ui/primitives'

export const STEP_TITLE = 'font-[family-name:var(--font-display)] font-bold leading-tight [text-wrap:balance]'
export const STEP_BODY = 'text-title-sm leading-[1.4] text-text-secondary [@media(min-height:700px)]:text-title-md'
const SHELL_STYLE = { '--swap-photo': 'max(200px, min(calc(min(100vw, var(--width-app)) - 24px), calc(100dvh - 330px - env(safe-area-inset-top) - env(safe-area-inset-bottom))))' } as CSSProperties
const WIDE_STYLE = { '--swap-photo': 'max(200px, min(min(100vw, var(--width-app)), calc(100dvh - 230px - env(safe-area-inset-top) - env(safe-area-inset-bottom))))' } as CSSProperties

export function SwapShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div style={wide ? WIDE_STYLE : SHELL_STYLE} className="fixed inset-0 z-[45] mx-auto flex max-w-[var(--width-app)] flex-col overflow-hidden overscroll-none bg-bg pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]" data-testid="swap-screen">
      {children}
    </div>
  )
}

export function SwapHeader({ step, top, leave = '/', onHelp }: { step?: string | null; top?: ReactNode; leave?: string; onHelp: () => void }) {
  const t = useTranslations('classify')
  return (
    <header className="flex h-[52px] shrink-0 items-center gap-1 px-1">
      <Link href={leave} aria-label={t('leave')} className="flex size-12 shrink-0 items-center justify-center rounded-full text-text active:bg-surface">
        <IconClose size={28} />
      </Link>
      <div className="min-w-0 flex-1 text-center">
        {top ?? (step && <p className="truncate text-ui font-semibold leading-tight text-text-secondary">{step}</p>)}
      </div>
      <IconButton label={t('help.open')} onClick={onHelp} className="size-12">
        <IconQuestion size={26} />
      </IconButton>
    </header>
  )
}
