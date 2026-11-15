'use client'

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

const HELP_SECTIONS = ['look', 'answer', 'better', 'defect', 'empty'] as const

export function SwapHelpSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('classify.help')
  return (
    <Sheet open={open} onClose={onClose} title={t('title')}>
      <div className="flex flex-col gap-4 px-4 py-4">
        {HELP_SECTIONS.map((s) => (
          <section key={s}>
            <h3 className="text-[16px] font-bold">{t(`${s}Title`)}</h3>
            <p className="mt-1 text-[16px] leading-snug text-text-secondary">{t(`${s}Body`)}</p>
          </section>
        ))}
        <button type="button" onClick={onClose} className={swapButton.mid}>
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

function TechnicalData({ reveal }: { reveal: Reveal }) {
  const t = useTranslations('classify.about')
  const fmt = useFmt()
  const label = useOffsetLabel()
  const first = reveal.frames[0]?.mjd ?? 0
  return (
    <div className="space-y-4 pb-2 text-body">
      {reveal.p_real !== null && (
        <section>
          <h4 className="font-semibold">{t('chance', { pct: Math.round(reveal.p_real * 100) })}</h4>
          <p className="mt-1 text-note text-text-secondary">{t('chanceHint')}</p>
        </section>
      )}
      <section>
        <h4 className="font-semibold">{t('photos')}</h4>
        <ul className="mt-1 divide-y-[0.5px] divide-divider">
          {reveal.frames.map((f, i) => (
            <li key={f.t + i} className="flex min-h-12 items-center justify-between gap-3 py-1 text-note">
              <span>{label((f.mjd - first) * 86400)}</span>
              <span className="text-right text-text-secondary">
                <span className="block">{formatDateTimeSeconds(f.t, fmt.locale)}</span>
                <span className="block">{t('infrared', { range: formatWavelength([f.wl_min, f.wl_max], fmt.locale) })}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
      <p className="text-note text-text-secondary">{t('field', { size: fmt.fixed(reveal.size_arcmin, 1), band: reveal.band })}</p>
      <section>
        <h4 className="font-semibold">{t('where')}</h4>
        <p className="mt-1 text-note text-text-secondary">{t(reveal.kind === 'sky' ? 'whereSky' : 'whereBody', { ra: fmt.fixed(reveal.ra, 4), dec: fmt.fixed(reveal.dec, 4) })}</p>
      </section>
      <CatalogLinks ra={reveal.ra} dec={reveal.dec} />
    </div>
  )
}

export function UnderstandSheet({ open, onClose, reveal, answer, verdict, hintsShown, onShowComputer }: { open: boolean; onClose: () => void; reveal: Reveal; answer: Answer; verdict: Verdict; hintsShown: boolean; onShowComputer: (() => void) | null }) {
  const t = useTranslations('classify')
  const others = reveal.votes.real + reveal.votes.artifact + reveal.votes.unsure > 1
  const sky = reveal.kind === 'sky'
  return (
    <Sheet open={open} onClose={onClose} title={t('understand.title')}>
      <div className="px-4 pb-4 pt-1">
        <Row voice="you" name={t('understand.you')}>
          {t(answer)}
        </Row>
        {(!sky || hintsShown) && (
          <Row
            voice="program"
            name={t('understand.computer')}
            action={
              onShowComputer && (
                <button type="button" onClick={onShowComputer} className="inline-flex min-h-11 shrink-0 items-center text-note font-semibold text-link">
                  {t('understand.showOnPhoto')}
                </button>
              )
            }
          >
            {sky ? t('understand.computerHints') : t('understand.computerFound', { guess: t(`guesses.${reveal.kind}`) })}
          </Row>
        )}
        {verdict.truth && (
          <Row voice="known" name={t('understand.right')}>
            {t(`understand.${TRUTH_WORD[verdict.truth]}`)}
          </Row>
        )}
        {!verdict.truth && others && (
          <Row voice="others" name={t('understand.others')}>
            {t('understand.othersCount', { moves: reveal.votes.real, still: reveal.votes.artifact, unsure: reveal.votes.unsure })}
          </Row>
        )}
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
