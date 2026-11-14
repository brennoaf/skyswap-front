'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { useEffect } from 'react'
import { BadgeArt } from '@/components/ui/badge-art'
import { IconStar } from '@/components/icons'
import { useUi, type Toast } from '@/lib/state/ui'

function ToastBody({ toast }: { toast: Toast }) {
  const t = useTranslations()
  if (toast.kind === 'xp')
    return (
      <>
        <IconStar size={22} className="text-warning" />
        <span>{toast.streak ? t('xp.gainedStreak', { xp: toast.xp }) : t('xp.gained', { xp: toast.xp })}</span>
      </>
    )
  if (toast.kind === 'badge')
    return (
      <>
        <BadgeArt badge={toast.badge} size={30} earned />
        <span>
          <span className="block text-meta text-text-secondary">{t('badges.earned')}</span>
          <span className="font-semibold">{t(`badges.items.${toast.badge}.name`)}</span>
        </span>
      </>
    )
  return <span>{t(toast.key, toast.values)}</span>
}

function ToastItem({ toast }: { toast: Toast & { id: number } }) {
  const dismiss = useUi((s) => s.dismissToast)
  const reduce = useReducedMotion()
  useEffect(() => {
    const timer = setTimeout(() => dismiss(toast.id), toast.kind === 'badge' ? 4200 : 2600)
    return () => clearTimeout(timer)
  }, [toast, dismiss])
  return (
    <motion.li
      layout={!reduce}
      initial={{ opacity: 0, y: -16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12 }}
      className="pointer-events-auto flex items-center gap-2.5 rounded-2xl bg-sheet px-4 py-2.5 text-body shadow-[0_8px_30px_rgb(0_0_0/0.35)] ring-1 ring-divider"
      onClick={() => dismiss(toast.id)}
    >
      <ToastBody toast={toast} />
    </motion.li>
  )
}

export function Toaster() {
  const toasts = useUi((s) => s.toasts)
  return (
    <ol aria-live="polite" className="pointer-events-none fixed inset-x-0 top-3 z-[70] mx-auto flex w-full max-w-[var(--width-app)] flex-col items-center gap-2 px-4">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} />
        ))}
      </AnimatePresence>
    </ol>
  )
}
