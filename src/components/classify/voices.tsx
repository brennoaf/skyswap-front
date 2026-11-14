'use client'

import { cx } from '@/lib/format'

export type Voice = 'you' | 'program' | 'known' | 'others'

export function VoiceSymbol({ voice, className }: { voice: Voice; className?: string }) {
  return (
    <span className={cx('inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-reels-bg', className)} aria-hidden="true">
      <svg viewBox="0 0 16 16" className="size-4">
        {voice === 'you' && <circle cx="8" cy="8" r="5" fill="var(--color-voice-you)" stroke="var(--color-mark-outline)" strokeWidth="1" />}
        {voice === 'program' && <rect x="2.5" y="2.5" width="11" height="11" fill="none" stroke="var(--color-voice-program)" strokeWidth="1.6" strokeDasharray="2.6 2" />}
        {voice === 'known' && <path d="M8 1.5L14.5 8L8 14.5L1.5 8Z" fill="none" stroke="var(--color-voice-known)" strokeWidth="1.8" />}
        {voice === 'others' && <path d="M8 2.5L14 13.5H2Z" fill="none" stroke="var(--color-voice-others)" strokeWidth="1.8" strokeLinejoin="round" />}
      </svg>
    </span>
  )
}

export function VoiceMark({ voice, u, v, faint = false }: { voice: Voice; u: number; v: number; faint?: boolean }) {
  const x = u * 100
  const y = v * 100
  return (
    <svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 100 100" aria-hidden="true" opacity={faint ? 0.45 : 1} data-voice={voice}>
      {voice === 'you' && <circle cx={x} cy={y} r="2.4" fill="var(--color-voice-you)" stroke="var(--color-mark-outline)" strokeWidth="0.6" />}
      {voice === 'program' && <rect x={x - 7} y={y - 7} width="14" height="14" fill="none" stroke="var(--color-voice-program)" strokeWidth="0.9" strokeDasharray="2.2 1.6" />}
      {voice === 'known' && <path d={`M${x} ${y - 9}L${x + 9} ${y}L${x} ${y + 9}L${x - 9} ${y}Z`} fill="none" stroke="var(--color-voice-known)" strokeWidth="0.9" />}
    </svg>
  )
}
