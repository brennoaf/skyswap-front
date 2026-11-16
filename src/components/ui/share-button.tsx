'use client'

import { useTranslations } from 'next-intl'
import { IconShare } from '@/components/icons'
import { cx } from '@/lib/format'
import { useShare } from '@/lib/share'

export function ShareButton({ title, path, className }: { title: string; path: () => string; className?: string }) {
  const t = useTranslations('seq')
  const share = useShare()
  return (
    <button
      type="button"
      onClick={() => void share({ title, path: path(), system: true })}
      className={cx('hit-44 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-surface px-3.5 text-note font-semibold text-text transition-transform active:scale-95 active:bg-surface-pressed', className)}
      data-testid="share-button"
    >
      <IconShare size={18} />
      {t('share')}
    </button>
  )
}
