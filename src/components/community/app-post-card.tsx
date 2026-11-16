'use client'

import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { cx } from '@/lib/format'

export function AppAvatar({ size = 40 }: { size?: number }) {
  return (
    <span className="inline-flex shrink-0 overflow-hidden rounded-full ring-1 ring-divider" style={{ width: size, height: size }}>
      <Image src="/icon-192.png" alt="" width={size} height={size} className="size-full" unoptimized />
    </span>
  )
}

export function AppBadge({ className }: { className?: string }) {
  const t = useTranslations('community')
  return (
    <span className={cx('inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-surface px-2 text-meta font-semibold text-text-secondary', className)} data-testid="app-badge">
      <Image src="/icon-rounded-256.png" alt="" width={12} height={12} className="size-3" unoptimized />
      {t('appAccount')}
    </span>
  )
}
