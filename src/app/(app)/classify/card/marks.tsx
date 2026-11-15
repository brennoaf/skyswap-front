'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { VoiceMark } from '@/components/classify/voices'
import type { CardHint } from '@/lib/explore/flashlight'
import { cx } from '@/lib/format'
import { hasOutsideArea } from '@/lib/out-of-field'

export type Mark = { u: number; v: number }

export function GuideRing({ mark }: { mark: Mark | undefined }) {
  if (!mark) return null
  return (
    <svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 100 100" aria-hidden="true" data-testid="guide-ring">
      <circle cx={mark.u * 100} cy={mark.v * 100} r="8" fill="none" stroke="var(--color-mark-halo)" strokeWidth="2" opacity="0.6" />
      <circle cx={mark.u * 100} cy={mark.v * 100} r="8" fill="none" stroke="var(--color-on-media)" strokeWidth="1.1" />
    </svg>
  )
}

export function HintRings({ hints, panel }: { hints: CardHint[]; panel: number }) {
  return (
    <>
      {hints.map((h, i) => (
        <VoiceMark key={i} voice="program" u={h.u} v={h.v} faint={h.visit !== panel} />
      ))}
    </>
  )
}

export function useHintLine(hints: CardHint[] | null, panel: number): string | null {
  const t = useTranslations('classify.flashlight')
  if (!hints) return null
  const here = hints.find((h) => h.visit === panel)
  return here ? t(`kinds.${here.kind}`) : hints.length ? t('elsewhere') : t('none')
}

export function useOutside(img: HTMLImageElement | null, n: number) {
  const [outside, setOutside] = useState<boolean[]>([])
  useEffect(() => {
    if (!img) return
    const tile = Math.round(img.naturalHeight / 2)
    setOutside(Array.from({ length: n }, (_, i) => hasOutsideArea(img, i * tile, 0, tile)))
  }, [img, n])
  return outside
}

export function SpotMark({ u, v, faint }: { u: number; v: number; faint: boolean }) {
  const reduce = useReducedMotion()
  return (
    <span aria-hidden="true" className={cx('pointer-events-none absolute size-11 -translate-x-1/2 -translate-y-1/2', faint && 'opacity-50')} style={{ left: `${u * 100}%`, top: `${v * 100}%` }} data-testid="spot-mark">
      <motion.span
        initial={reduce ? false : { scale: 0.3, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 520, damping: 16 }}
        className="absolute inset-0 rounded-full border-[2.5px] border-accent shadow-[0_0_0_2px_color-mix(in_srgb,var(--color-mark-halo)_60%,transparent),inset_0_0_0_2px_color-mix(in_srgb,var(--color-mark-halo)_60%,transparent)]"
      />
      {!reduce && <motion.span className="absolute -inset-2.5 rounded-full border-2 border-accent" initial={{ scale: 0.6, opacity: 0.8 }} animate={{ scale: [0.6, 1.3], opacity: [0.8, 0] }} transition={{ duration: 1.6, ease: 'easeOut', repeat: Infinity }} />}
    </span>
  )
}
