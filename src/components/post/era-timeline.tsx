'use client'

import { useTranslations } from 'next-intl'
import type { Frame } from '@/lib/api/client'
import { cx } from '@/lib/format'
import { eraLayout, frameYear, telescopeOf } from '@/lib/long-baseline'

export function EraTimeline({ frames, index, onPick, path, onPath }: { frames: Frame[]; index: number; onPick: (i: number) => void; path: boolean; onPath: (on: boolean) => void }) {
  const t = useTranslations('viewer.longBaseline')
  if (frames.length < 2) return null
  const { startYear, endYear, positions, segments } = eraLayout(frames)
  const x = (p: number) => `calc(6px + ${p} * (100% - 12px))`
  const current = frames[index]
  const gap = segments.find((s) => s.kind === 'gap')
  return (
    <section aria-label={t('timeline')} className="px-3 pt-2">
      {gap && (
        <div className="relative h-3.5 text-micro italic text-text-secondary" aria-hidden="true">
          <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: x((gap.from + gap.to) / 2) }}>
            {t('asleep')}
          </span>
        </div>
      )}
      <div className="relative h-8">
        {segments.map((s, i) => (
          <span
            key={i}
            aria-hidden="true"
            className={cx('absolute top-1/2 -translate-y-1/2', s.kind === 'gap' ? 'h-0 border-t-2 border-dashed border-ring-seen' : s.kind === 'spherex' ? 'h-[3px] rounded-full bg-accent' : 'h-[2px] rounded-full bg-text-muted')}
            style={{ left: x(s.from), width: `calc(${s.to - s.from} * (100% - 12px))` }}
          />
        ))}
        {positions.map((p, i) => {
          const f = frames[i] as Frame
          const sx = telescopeOf(f) === 'SPHEREx'
          return (
            <button
              key={f.src}
              type="button"
              aria-label={t('frame', { year: frameYear(f), telescope: telescopeOf(f) })}
              aria-current={i === index ? 'true' : undefined}
              onClick={() => onPick(i)}
              className="absolute top-1/2 flex h-8 w-3 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
              style={{ left: x(p) }}
            >
              <span className={cx('block rounded-full', i === index ? 'size-3 bg-text ring-2 ring-accent' : sx ? 'size-2 bg-accent' : 'size-1.5 bg-text-secondary')} />
            </button>
          )
        })}
      </div>
      <div className="relative h-4 text-meta text-text-secondary" aria-hidden="true">
        <span className="absolute left-0">{startYear}</span>
        <span className="absolute right-0">{endYear}</span>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <p className="text-note text-text-secondary">{current ? t('now', { year: frameYear(current), telescope: telescopeOf(current), n: index + 1, total: frames.length }) : ''}</p>
        <button
          type="button"
          role="switch"
          aria-checked={path}
          onClick={() => onPath(!path)}
          className={cx('inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-note font-semibold', path ? 'bg-text text-bg' : 'bg-surface text-text')}
        >
          <span className={cx('size-2 rounded-full', path ? 'bg-crosshair' : 'bg-ring-seen')} aria-hidden="true" />
          {t('path')}
        </button>
      </div>
    </section>
  )
}
