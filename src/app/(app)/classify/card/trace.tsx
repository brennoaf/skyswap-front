'use client'

import { useTranslations } from 'next-intl'
import { swapButton } from '@/components/classify/swap-photo'
import { IconClose, IconQuestion } from '@/components/icons'
import { IconButton } from '@/components/ui/primitives'
import { cx } from '@/lib/format'
import { markedCount, MIN_TRACE_MARKS, type CardState } from './card-machine'
import { SpotMark } from './marks'

type Marks = CardState<unknown>['marks']

const PICK_RADIUS = 0.09

export function TraceHeader({ title, sub, onClose, onHelp }: { title: string; sub: string | null; onClose: () => void; onHelp: () => void }) {
  const t = useTranslations('classify.trace')
  const th = useTranslations('classify')
  return (
    <header className="flex h-[52px] shrink-0 items-center gap-1 px-1" data-testid="trace-header">
      <IconButton label={t('cancel')} onClick={onClose} className="size-12">
        <IconClose size={28} />
      </IconButton>
      <div className="min-w-0 flex-1 text-center leading-tight">
        <h1 className="truncate text-title-sm font-bold" data-testid="trace-title">
          {title}
        </h1>
        {sub && <p className="truncate text-note text-text-secondary">{sub}</p>}
      </div>
      <IconButton label={th('help.open')} onClick={onHelp} className="size-12">
        <IconQuestion size={26} />
      </IconButton>
    </header>
  )
}

function Ghost({ u, v, n }: { u: number; v: number; n?: number }) {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute size-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-on-media-muted" style={{ left: `${u * 100}%`, top: `${v * 100}%` }} data-testid="trace-ghost">
      {n !== undefined && <Badge n={n} />}
    </span>
  )
}

function Badge({ n }: { n: number }) {
  return <span className="absolute -top-5 left-1/2 grid size-5 -translate-x-1/2 place-items-center rounded-full bg-accent text-micro font-bold text-on-accent">{n}</span>
}

export function TraceLayer({ marks, at, review, panel }: { marks: Marks; at: number; review: boolean; panel: number }) {
  if (!review) {
    const before = [...marks.slice(0, at)].reverse().find((m) => !!m)
    const here = marks[at]
    return (
      <>
        {before && <Ghost u={before.ax} v={before.ay} />}
        {here && <SpotMark u={here.ax} v={here.ay} faint={false} />}
      </>
    )
  }
  const points = marks.flatMap((m, i) => (m ? [{ ...m, i }] : []))
  return (
    <>
      {points.length > 1 && (
        <svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <polyline points={points.map((p) => `${p.ax * 100},${p.ay * 100}`).join(' ')} fill="none" stroke="var(--color-accent)" strokeWidth="1" strokeDasharray="2 1.5" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
      {points.map((p) =>
        p.i === panel ? (
          <span key={p.i} className="pointer-events-none absolute size-11 -translate-x-1/2 -translate-y-1/2 rounded-full border-[2.5px] border-accent" style={{ left: `${p.ax * 100}%`, top: `${p.ay * 100}%` }} data-testid="trace-mark">
            <Badge n={p.i + 1} />
          </span>
        ) : (
          <Ghost key={p.i} u={p.ax} v={p.ay} n={p.i + 1} />
        ),
      )}
    </>
  )
}

export function pickMark(marks: Marks, u: number, v: number): number {
  let best = -1
  let dist = PICK_RADIUS
  marks.forEach((m, i) => {
    if (!m) return
    const d = Math.hypot(m.ax - u, m.ay - v)
    if (d <= dist) [best, dist] = [i, d]
  })
  return best
}

export function TraceBar({ marks, at, review, onMissing, onRetrace, onRedo, onConfirm }: { marks: Marks; at: number; review: boolean; onMissing: () => void; onRetrace: (frame: number) => void; onRedo: () => void; onConfirm: () => void }) {
  const t = useTranslations('classify.trace')
  const n = marks.length
  const count = markedCount(marks)
  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 pb-4" data-testid="trace-bar">
      {!review && (
        <div className="flex justify-center gap-1.5 pt-1" aria-hidden="true">
          {marks.map((m, i) => (
            <span key={i} className={cx('h-1 w-7 rounded-full', i === at ? 'bg-accent' : m !== undefined ? 'bg-text' : 'bg-divider')} />
          ))}
        </div>
      )}
      <p role="status" aria-live="polite" className="pt-3 text-center text-ui leading-snug text-text-secondary [text-wrap:balance]" data-testid="trace-hint">
        {review ? t('count', { n: count, total: n }) : at === 0 ? t('first') : t('next')}
      </p>
      {review && count < MIN_TRACE_MARKS && <p className="pt-1 text-center text-note leading-snug text-text-secondary">{t('needTwo')}</p>}
      {review && (
        <ul className="sr-only">
          {marks.map((m, i) =>
            m ? (
              <li key={i}>
                <button type="button" onClick={() => onRetrace(i)}>
                  {t('redoOne', { n: i + 1 })}
                </button>
              </li>
            ) : null,
          )}
        </ul>
      )}
      <div className="min-h-0 flex-1" />
      {review ? (
        <div className="flex shrink-0 gap-2.5">
          <button type="button" onClick={onRedo} className={`${swapButton.big} flex-1`}>
            {t('redo')}
          </button>
          <button type="button" disabled={count < MIN_TRACE_MARKS} onClick={onConfirm} className={`${swapButton.primary} flex-1 disabled:opacity-45`}>
            {t('confirm')}
          </button>
        </div>
      ) : (
        <button type="button" onClick={onMissing} className={`${swapButton.big} w-full flex-none`} data-testid="trace-missing">
          {t('missing')}
        </button>
      )}
    </div>
  )
}
