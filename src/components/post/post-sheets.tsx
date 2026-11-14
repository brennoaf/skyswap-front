'use client'

import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { QrWarning } from '@/components/charts/charts'
import { IconCompare, IconDirect, IconFlask, IconLink, IconNote, IconWarning } from '@/components/icons'
import { NotesPanel } from '@/components/post/notes-panel'
import { centre, FILTERS, type FilterKey, type Sequence } from '@/components/post/sequences'
import { TagPanel } from '@/components/post/tag-panel'
import { CatalogLinks } from '@/components/ui/catalog-links'
import { Notice, Sheet, SheetRow } from '@/components/ui/primitives'
import type { Frame, ObjectProfile, PostDetail } from '@/lib/api/client'
import { cx, formatWavelength } from '@/lib/format'
import { useFmt } from '@/lib/use-fmt'

export function ColoursSheet({
  open,
  onClose,
  sequences,
  active,
  onPick,
  wave,
  range,
  onWave,
  sliderFrame,
}: {
  open: boolean
  onClose: () => void
  sequences: Record<FilterKey, Sequence>
  active: string
  onPick: (k: FilterKey) => void
  wave: number
  range: { min: number; max: number }
  onWave: (v: number) => void
  sliderFrame: Frame | null
}) {
  const t = useTranslations('viewer')
  const fmt = useFmt()
  const value = t('wavelengthValue', { value: fmt.fixed(wave, 2) })
  return (
    <Sheet open={open} onClose={onClose} title={t('filters')} dim={false}>
      <ul className="no-scrollbar flex gap-3 overflow-x-auto px-4 pb-1 pt-3">
        {FILTERS.map((k) => {
          const s = sequences[k]
          const thumb = s.frames[Math.floor(s.frames.length / 2)] ?? s.frames[0]
          const on = active === k
          return (
            <li key={k} className="shrink-0">
              <button type="button" aria-pressed={on} disabled={!thumb} onClick={() => onPick(k)} title={t(`filterHints.${k}`)} className="flex w-[76px] flex-col items-center gap-1.5 disabled:opacity-35">
                <span className={cx('text-meta', on ? 'font-semibold text-text' : 'text-text-secondary')}>{t(`filterNames.${k}`)}</span>
                <span className={cx('relative block size-[76px] overflow-hidden rounded-[4px] bg-media-bg', on && 'ring-2 ring-text ring-offset-2 ring-offset-sheet')}>
                  {thumb && <Image src={thumb.src} alt="" fill sizes="76px" className="pixelated object-contain" unoptimized />}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <p className="px-4 pt-2 text-meta text-text-secondary">{active === 'slider' ? (sliderFrame ? `${sliderFrame.band}, ${formatWavelength(sliderFrame.wavelength_um)}, ${fmt.shortDate(sliderFrame.t)}` : t('filterEmpty')) : sequences[active as FilterKey]?.frames.length ? t(`filterHints.${active}`) : t('filterEmpty')}</p>
      <div className="px-4 pb-2 pt-4">
        <div className="flex items-baseline justify-between">
          <label htmlFor="wavelength" className="text-body font-semibold">
            {t('wavelength')}
          </label>
          <output htmlFor="wavelength" className="font-mono text-body">
            {value}
          </output>
        </div>
        <input
          id="wavelength"
          type="range"
          min={range.min}
          max={range.max}
          step={0.01}
          value={wave}
          aria-valuetext={value}
          onChange={(e) => onWave(Number(e.target.value))}
          className="mt-3 h-11 w-full appearance-none bg-transparent [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:[background:var(--gradient-bands)] [&::-webkit-slider-thumb]:-mt-[7px] [&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-text"
        />
        <div className="flex justify-between text-meta text-text-secondary">
          <span>{t('wavelengthValue', { value: fmt.fixed(range.min, 2) })}</span>
          <span>{t('wavelengthValue', { value: fmt.fixed(range.max, 2) })}</span>
        </div>
      </div>
    </Sheet>
  )
}

export function TagSheet({ open, onClose, postId, tags }: { open: boolean; onClose: () => void; postId: string; tags: PostDetail['tags'] }) {
  const t = useTranslations('tags')
  return (
    <Sheet open={open} onClose={onClose} title={t('title')}>
      <div className="px-4 py-4">
        <p className="mb-3 text-note text-text-secondary">{t('explain')}</p>
        <TagPanel postId={postId} tags={tags} />
      </div>
    </Sheet>
  )
}

export function NotesSheet({ open, onClose, postId, objectId, title }: { open: boolean; onClose: () => void; postId: string; objectId: string; title: string }) {
  return (
    <Sheet open={open} onClose={onClose} labelledBy="notes-title">
      <NotesPanel postId={postId} objectId={objectId} title={title} />
    </Sheet>
  )
}

export function MoreSheet({
  open,
  onClose,
  onAbout,
  onNotes,
  onCompare,
  onShare,
  onCopy,
  labHref,
}: {
  open: boolean
  onClose: () => void
  onAbout: () => void
  onNotes: () => void
  onCompare: (() => void) | null
  onShare: () => void
  onCopy: () => void
  labHref: string
}) {
  const t = useTranslations('post.menu')
  return (
    <Sheet open={open} onClose={onClose}>
      <div className="py-1">
        <SheetRow icon={<IconWarning size={26} />} label={t('about')} hint={t('aboutHint')} onClick={onAbout} />
        {onCompare && <SheetRow icon={<IconCompare size={26} />} label={t('compare')} onClick={onCompare} />}
        <SheetRow icon={<IconNote size={26} />} label={t('notes')} hint={t('notesHint')} onClick={onNotes} />
        <SheetRow icon={<IconFlask size={26} />} label={t('lab')} hint={t('labHint')} href={labHref} onClick={onClose} />
        <SheetRow icon={<IconDirect size={26} />} label={t('share')} onClick={onShare} />
        <SheetRow icon={<IconLink size={26} />} label={t('copyLink')} onClick={onCopy} />
      </div>
    </Sheet>
  )
}

export function AboutSheet({ open, onClose, data, profile, frame, wise }: { open: boolean; onClose: () => void; data: PostDetail; profile: ObjectProfile | undefined; frame: Frame | undefined; wise?: boolean }) {
  const t = useTranslations('viewer')
  const tp = useTranslations('post')
  const tc = useTranslations('common')
  const fmt = useFmt()
  const { post, object } = data
  const fs = post.flags_summary
  const releases = [...new Set(post.frames.flatMap((f) => f.release.split('+')).map((r) => r.trim().toUpperCase()))].filter(Boolean)
  const c = frame ? centre(frame) : null
  return (
    <Sheet open={open} onClose={onClose} title={tp('menu.about')}>
      <div className="space-y-4 px-4 py-4 text-body">
        {frame && (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
            <dt className="text-text-secondary">{t('aboutBand')}</dt>
            <dd>{frame.band || '-'}</dd>
            <dt className="text-text-secondary">{t('wavelength')}</dt>
            <dd>{c !== null ? `${formatWavelength(frame.wavelength_um)}` : '-'}</dd>
            <dt className="text-text-secondary">{t('aboutDate')}</dt>
            <dd>{frame.t ? fmt.dateTime(frame.t) : '-'}</dd>
            <dt className="text-text-secondary">{t('aboutRelease')}</dt>
            <dd>{frame.release ? frame.release.toUpperCase().replace('+', ' + ') : releases.join(' + ') || '-'}</dd>
            <dt className="text-text-secondary">{t('aboutKind')}</dt>
            <dd>{t(`kinds.${frame.kind}`)}</dd>
            {frame.telescope && (
              <>
                <dt className="text-text-secondary">{t('longBaseline.telescope')}</dt>
                <dd>{frame.telescope}</dd>
              </>
            )}
            {frame.n_exp !== null && (
              <>
                <dt className="text-text-secondary">{t('longBaseline.exposures')}</dt>
                <dd>{frame.n_exp}</dd>
              </>
            )}
            <dt className="text-text-secondary">{t('aboutFov')}</dt>
            <dd>{frame.fov_deg ? tc('arcmin', { n: fmt.fixed(frame.fov_deg * 60, 1) }) : '-'}</dd>
          </dl>
        )}
        {object.saturation === 'heavy' && (
          <Notice tone="warning" icon={<IconWarning size={20} />}>
            <p>{t('saturatedWarning')}</p>
            {profile?.limits.slice(0, 2).map((l) => (
              <p key={l} className="mt-1 text-text-secondary">
                {l}
              </p>
            ))}
          </Notice>
        )}
        {post.frames.length > 0 && (
          <section aria-labelledby="flags-title">
            <h3 id="flags-title" className="mb-2 text-ui font-semibold">
              {t('flags')}
            </h3>
            <ul className="divide-y-[0.5px] divide-divider">
              {(['saturated', 'cosmic_ray', 'persistence', 'satellite'] as const).map((k) => (
                <li key={k} className="flex min-h-10 items-center justify-between">
                  <span>{t(`flagItems.${k}`)}</span>
                  <span className="text-text-secondary">{k === 'satellite' ? t('notFlagged') : t('flagFrac', { pct: Math.round(fs[k] * 100) })}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {wise && (
          <Notice icon={<IconWarning size={20} />}>
            <p>{t('longBaseline.honest')}</p>
          </Notice>
        )}
        {releases.filter((r) => r.startsWith('QR')).length > 1 && <QrWarning />}
        {profile && profile.sources.length > 0 && (
          <section aria-labelledby="sources-title">
            <h3 id="sources-title" className="mb-2 text-ui font-semibold">
              {t('sources')}
            </h3>
            <ul className="space-y-1.5">
              {profile.sources.map((s) => (
                <li key={s.id}>
                  <a href={s.url} target="_blank" rel="noreferrer" className="text-link">
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
        {profile && <CatalogLinks ra={profile.ra} dec={profile.dec} />}
        <p className="text-meta text-text-secondary">{t('dataNotice')}</p>
        {wise && <p className="text-meta text-text-secondary">{t('longBaseline.credit')}</p>}
      </div>
    </Sheet>
  )
}
