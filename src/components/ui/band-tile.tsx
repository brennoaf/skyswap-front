'use client'

import { IconCheck } from '@/components/icons'
import { cx } from '@/lib/format'

export function BandTile({ label, hue, detail, on, onClick }: { label: string; hue: string; detail?: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={cx('overflow-hidden rounded-xl bg-surface text-left transition-transform active:scale-95', on && 'ring-2 ring-text')}>
      <span className="block h-4" style={{ background: hue }} />
      <span className="block px-2.5 pb-2 pt-1.5">
        <span className="flex h-6 items-center justify-between text-ui font-semibold">
          {label}
          {on && <IconCheck size={20} />}
        </span>
        {detail && <span className="block truncate text-meta tabular-nums text-text-secondary">{detail}</span>}
      </span>
    </button>
  )
}
