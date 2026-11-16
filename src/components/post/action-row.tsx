'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { IconColours, IconSave, IconTag, IconTarget } from '@/components/icons'
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
  extra,
}: {
  tag: Action
  mark: Action
  colours: Action
  save: Action
  saved: boolean
  tagCount?: number | null
  dots?: { count: number; active: number; onPick?: (i: number) => void } | null
  extra?: ReactNode
}) {
  const t = useTranslations('post.actions')
  return (
    <div className="relative flex h-12 items-center px-[5px]">
      <ActionButton label={t('tag')} action={tag}>
        <IconTag />
      </ActionButton>
      {tagCount ? <span className="-ml-1.5 mr-0.5 text-body font-semibold">{tagCount}</span> : null}
      <ActionButton label={t('mark')} action={mark}>
        <IconTarget />
      </ActionButton>
      <ActionButton label={t('colours')} action={colours}>
        <IconColours />
      </ActionButton>
      {dots && dots.count > 1 && (
        <div className="flex h-11 min-w-0 flex-1" role="group" aria-label={t('pass', { n: dots.active + 1, total: dots.count })}>
          <button type="button" aria-label={t('prevPass')} disabled={dots.active <= 0} onClick={() => dots.onPick?.(dots.active - 1)} className="h-full min-w-11 flex-1" />
          <button type="button" aria-label={t('nextPass')} disabled={dots.active >= dots.count - 1} onClick={() => dots.onPick?.(dots.active + 1)} className="h-full min-w-11 flex-1" />
          <span className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 gap-2.5" aria-hidden="true">
            {Array.from({ length: Math.min(dots.count, 7) }).map((_, i) => (
              <span key={i} className={cx('size-1.5 rounded-full', i === Math.min(dots.active, 6) ? 'bg-accent' : 'bg-ring-seen')} />
            ))}
          </span>
        </div>
      )}
      <div className="ml-auto flex items-center gap-1">
        {extra}
        <ActionButton label={saved ? t('unsave') : t('save')} action={save}>
          <IconSave filled={saved} />
        </ActionButton>
      </div>
    </div>
  )
}
