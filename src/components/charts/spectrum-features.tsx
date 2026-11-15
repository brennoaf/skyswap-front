'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import { KitChart, useKitJson } from '@/components/charts/charts'
import { cx } from '@/lib/format'

export interface SpectrumFeature {
  id: string
  name_pt: string
  name_en: string
  kind: 'dip' | 'bump'
  from_um: number
  to_um: number
  center_um: number
  change_pct: number
  times: number
  narrow?: boolean
  also?: { name_pt: string; name_en: string }[]
  passes?: string[]
}

export interface FeaturesData {
  judged: boolean
  reason: string | null
  features: SpectrumFeature[]
}

export type Highlight = [number, number] | null

export const featureName = (f: { name_pt: string; name_en: string }, locale: string) => (locale.startsWith('pt') ? f.name_pt : f.name_en)

function list(items: string[], locale: string, type: 'conjunction' | 'disjunction' = 'conjunction'): string {
  return new Intl.ListFormat(locale, { style: 'long', type }).format(items)
}

function useFeatureLine() {
  const t = useTranslations('features')
  const locale = useLocale()
  const um = (f: SpectrumFeature) => f.center_um.toLocaleString(locale, { maximumFractionDigits: f.narrow ? 2 : 1 })
  return (f: SpectrumFeature) => {
    const name = featureName(f, locale)
    if (f.kind === 'dip') return t('dip', { name, pct: Math.round(Math.abs(f.change_pct)), um: um(f) })
    const when = f.passes?.length ? list(f.passes.map((d) => new Date(d).toLocaleDateString(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' })), locale) : null
    const amount = f.times >= 2 ? t('times', { n: f.times.toLocaleString(locale, { maximumFractionDigits: 0 }) }) : t('percent', { n: Math.round(f.change_pct) })
    return when ? t('bumpWhen', { name, amount, um: um(f), when }) : t('bump', { name, amount, um: um(f) })
  }
}

export function SpectrumFeatures({ data, highlight, onHighlight }: { data: FeaturesData; highlight: Highlight; onHighlight: (h: Highlight) => void }) {
  const t = useTranslations('features')
  const locale = useLocale()
  const line = useFeatureLine()
  if (data.reason === 'no_spectrum') return null
  return (
    <section className="mt-4" data-testid="spectrum-features">
      <h3 className="text-ui font-semibold">{t('title')}</h3>
      {!data.judged ? (
        <p className="mt-1 text-body leading-snug text-text-secondary">{t(data.reason === 'too_bright' ? 'tooBright' : 'tooFaint')}</p>
      ) : !data.features.length ? (
        <p className="mt-1 text-body leading-snug text-text-secondary">{t('none')}</p>
      ) : (
        <ul className="mt-1">
          {data.features.map((f) => {
            const on = !!highlight && highlight[0] === f.from_um && highlight[1] === f.to_um
            return (
              <li key={`${f.id}-${f.center_um}`}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => onHighlight(on ? null : [f.from_um, f.to_um])}
                  className={cx('-mx-2 block w-[calc(100%+16px)] rounded-lg px-2 py-2 text-left text-body leading-snug', on && 'bg-surface')}
                >
                  {line(f)}
                  {!!f.also?.length && <span className="block text-note text-text-secondary">{t('also', { names: list(f.also.map((a) => featureName(a, locale)), locale, 'disjunction') })}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {data.judged && <p className="mt-1 text-note text-text-secondary">{t('rule')}</p>}
    </section>
  )
}

export function ProfileSpectrum({ spectra, features, mixedBatches }: { spectra: string; features: string | undefined; mixedBatches: boolean }) {
  const [highlight, setHighlight] = useState<Highlight>(null)
  const found = useKitJson<FeaturesData>(features)
  return (
    <>
      <KitChart kind="spectrum" url={spectra} titled mixedBatches={mixedBatches} highlight={highlight} />
      {found.data && <SpectrumFeatures data={found.data} highlight={highlight} onHighlight={setHighlight} />}
    </>
  )
}
