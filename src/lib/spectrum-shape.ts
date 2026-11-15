import type { PointSpectrum } from '@/lib/api/client'

export const SPECTRUM_FORMAT = 2

type Loose = Omit<PointSpectrum, 'object' | 'elsewhere' | 'channels'> & Partial<Pick<PointSpectrum, 'object' | 'elsewhere' | 'channels'>>

export function spectrumShape(raw: Loose): PointSpectrum {
  return {
    ...raw,
    channels: Array.isArray(raw.channels) ? raw.channels : [],
    object: raw.object ?? null,
    elsewhere: Array.isArray(raw.elsewhere) ? raw.elsewhere : [],
  }
}
