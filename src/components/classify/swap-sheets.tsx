'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { useOffsetLabel } from '@/components/classify/photo-viewer'
import { VoiceSymbol, type Voice } from '@/components/classify/voices'
import { CatalogLinks } from '@/components/ui/catalog-links'
import { Sheet } from '@/components/ui/primitives'
import type { Reveal } from '@/lib/api/client'
import { formatDateTimeSeconds, formatWavelength } from '@/lib/format'
import { TRUTH_WORD, type Answer, type Verdict } from '@/lib/swap-verdict'
import { useFmt } from '@/lib/use-fmt'
import { swapButton } from './swap-photo'

const HELP_SECTIONS = ['look', 'answer', 'better', 'defect', 'black', 'empty', 'robot'] as const

export function SwapHelpSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('classify.help')
  return (
    <Sheet open={open} onClose={onClose} title={t('title')}>
      <div className="flex flex-col gap-4 px-4 py-4">
        {HELP_SECTIONS.map((s) => (
          <section key={s}>
            <h3 className="text-[16px] font-bold">{t(`${s}Title`)}</h3>
            <p className="mt-1 text-[16px] leading-snug text-text-secondary">{t(`${s}Body`)}</p>
            {s === 'robot' && (
              <details className="mt-1 text-[16px] leading-snug text-text-secondary" data-testid="robot-more">
                <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-link">{t('more')}</summary>
                <p>{t('robotMore')}</p>
              </details>
            )}
          </section>
        ))}
        <button type="button" onClick={onClose} className={`${swapButton.mid} flex-none`}>
          {t('ok')}
        </button>
      </div>
    </Sheet>
  )
}

function Row({ voice, name, children, action }: { voice: Voice; name: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b-[0.5px] border-divider py-2.5 text-[16px] leading-snug">
      <VoiceSymbol voice={voice} />
      <span className="min-w-0 flex-1">
        <b className="font-semibold">{name}: </b>
        {children}
      </span>
      {action}
    </div>
  )
}

export function TechnicalData({ reveal }: { reveal: Reveal }) {
  const t = useTranslations('classify.about')
  const fmt = useFmt()
  const label = useOffsetLabel()
  const first = reveal.frames[0]?.mjd ?? 0
  return (
    <div className="space-y-4 pb-2 text-ui">
      {reveal.p_real !== null && (
        <section>
          <h4 className="font-semibold">{t('chance', { pct: Math.round(reveal.p_real * 100) })}</h4>
          <p className="mt-1 text-ui text-text-secondary">{t('chanceHint')}</p>
        </section>
      )}
      <section>
        <h4 className="font-semibold">{t('photos')}</h4>
        <ul className="mt-1 divide-y-[0.5px] divide-divider">
          {reveal.frames.map((f, i) => (
            <li key={f.t + i} className="flex min-h-12 items-center justify-between gap-3 py-1 text-ui">
              <span>{label((f.mjd - first) * 86400)}</span>
              <span className="text-right text-text-secondary">
                <span className="block">{formatDateTimeSeconds(f.t, fmt.locale)}</span>
                <span className="block">{t('infrared', { range: formatWavelength([f.wl_min, f.wl_max], fmt.locale) })}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
      <p className="text-ui text-text-secondary">{t('field', { size: fmt.fixed(reveal.size_arcmin, 1), band: reveal.band })}</p>
      <section>
        <h4 className="font-semibold">{t('where')}</h4>
        <p className="mt-1 text-ui text-text-secondary">{t(reveal.kind === 'sky' ? 'whereSky' : 'whereBody', { ra: fmt.fixed(reveal.ra, 4), dec: fmt.fixed(reveal.dec, 4) })}</p>
      </section>
      <CatalogLinks ra={reveal.ra} dec={reveal.dec} />
    </div>
  )
}

export function UnderstandSheet({ open, onClose, reveal, answer, verdict }: { open: boolean; onClose: () => void; reveal: Reveal; answer: Answer; verdict: Verdict }) {
  const t = useTranslations('classify')
  return (
    <Sheet open={open} onClose={onClose} title={t('understand.title')}>
      <div className="px-4 pb-4 pt-1">
        <Row voice="you" name={t('understand.you')}>
          {t(`answered.${answer}`)}
        </Row>
        <Row voice="program" name={t('understand.computer')}>
          {t('understand.computerFound', { guess: t(`guesses.${reveal.kind}`) })}
        </Row>
        <Row voice="known" name={t('understand.right')}>
          {t(`understand.${TRUTH_WORD[verdict.truth]}`)}
        </Row>
        <h3 className="mt-4 text-[16px] font-bold">{t('understand.why')}</h3>
        <p className="mt-1 text-[16px] leading-snug text-text-secondary">{t(`understand.${verdict.why}`)}</p>
        <details className="mt-4 border-t-[0.5px] border-divider pt-1">
          <summary className="flex min-h-11 cursor-pointer items-center text-[16px] font-semibold">{t('understand.technical')}</summary>
          <TechnicalData reveal={reveal} />
        </details>
        <button type="button" onClick={onClose} className={`${swapButton.mid} mt-3 w-full`}>
          {t('understand.close')}
        </button>
      </div>
    </Sheet>
  )
}

export function PhotoSourceSheet({ open, onClose, offsets, sky }: { open: boolean; onClose: () => void; offsets: number[]; sky: { ra: number; dec: number; t0: string } | null }) {
  const t = useTranslations('classify.about')
  const fmt = useFmt()
  const label = useOffsetLabel()
  const start = sky ? Date.parse(sky.t0) : 0
  return (
    <Sheet open={open} onClose={onClose} title={t('title')}>
      <div className="space-y-4 px-4 py-4 text-ui" data-testid="photo-source">
        {sky && (
          <section>
            <h3 className="text-[16px] font-bold">{t('where')}</h3>
            <p className="mt-1 leading-snug text-text-secondary">{t('whereBody', { ra: fmt.fixed(sky.ra, 4), dec: fmt.fixed(sky.dec, 4) })}</p>
          </section>
        )}
        <section>
          <h3 className="text-[16px] font-bold">{t('photos')}</h3>
          <ol className="mt-1">
            {offsets.map((s, i) => (
              <li key={i} className="flex min-h-11 items-center justify-between gap-3 border-b-[0.5px] border-divider py-1">
                <span>{i + 1}</span>
                <span className="text-right text-text-secondary">{sky ? formatDateTimeSeconds(new Date(start + s * 1000).toISOString(), fmt.locale) : label(s)}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </Sheet>
  )
}

export function KnownSheet({ known, onClose }: { known: { name: string; object: string | null } | null; onClose: () => void }) {
  const t = useTranslations('classify')
  const name = known?.name ?? ''
  return (
    <Sheet open={!!known} onClose={onClose} title={t('strip.knownTitle', { name })}>
      <div className="flex flex-col gap-4 px-4 py-4">
        <p className="text-[16px] leading-snug text-text-secondary">{t('strip.knownBody', { name })}</p>
        {known?.object && (
          <Link href={`/o/${known.object}`} className={`${swapButton.primary} flex-none`}>
            {t('strip.profile', { name })}
          </Link>
        )}
        <button type="button" onClick={onClose} className={`${swapButton.mid} flex-none`}>
          {t('understand.close')}
        </button>
      </div>
    </Sheet>
  )
}
