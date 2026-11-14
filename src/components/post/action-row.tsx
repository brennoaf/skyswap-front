'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { IconColours, IconComment, IconSave, IconTarget } from '@/components/icons'
import { cx } from '@/lib/format'

export type Action = { onClick?: () => void; href?: string; active?: boolean }

function ActionButton({ label, action, children }: { label: string; action: Action; children: ReactNode }) {
  const cls = cx('inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-transform active:scale-90', action.active ? 'text-accent' : 'text-text')
  return action.href ? (
    <Link href={action.href} aria-label={label} title={label} className={cls}>
      {children}
    </Link>
  ) : (
    <button type="button" aria-label={label} title={label} aria-pressed={action.active} onClick={action.onClick} className={cls}>
      {children}
    </button>
  )
}

export function ActionRow({
  tag,
  mark,
  colours,
  save,
  saved,
  tagCount,
  dots,
}: {
  tag: Action
  mark: Action
  colours: Action
  save: Action
  saved: boolean
  tagCount?: number | null
  dots?: { count: number; active: number; onPick?: (i: number) => void } | null
}) {
  const t = useTranslations('post.actions')
  return (
    <div className="relative flex h-12 items-center px-[5px]" data-tour="post-actions">
      <ActionButton label={t('tag')} action={tag}>
        <IconComment />
      </ActionButton>
      {tagCount ? <span className="-ml-1.5 mr-0.5 text-body font-semibold">{tagCount}</span> : null}
      <ActionButton label={t('mark')} action={mark}>
        <IconTarget />
      </ActionButton>
      <ActionButton label={t('colours')} action={colours}>
        <IconColours />
      </ActionButton>
      {dots && dots.count > 1 && (
        <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2" role="tablist" aria-label={t('passes')}>
          {Array.from({ length: Math.min(dots.count, 7) }).map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === dots.active}
              aria-label={t('pass', { n: i + 1, total: dots.count })}
              onClick={() => dots.onPick?.(i)}
              className="flex h-11 w-4 items-center justify-center"
            >
              <span className={cx('size-1.5 rounded-full', i === dots.active ? 'bg-accent' : 'bg-ring-seen')} />
            </button>
          ))}
        </div>
      )}
      <div className="ml-auto">
        <ActionButton label={saved ? t('unsave') : t('save')} action={save}>
          <IconSave filled={saved} />
        </ActionButton>
      </div>
    </div>
  )
}
