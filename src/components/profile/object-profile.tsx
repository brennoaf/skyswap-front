'use client'

import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { KitChart, QrWarning } from '@/components/charts/charts'
import { frameTiles, PostGrid, tilesFromPosts } from '@/components/profile/post-grid'
import { IconBell, IconChart, IconChevronDownSmall, IconCompare, IconFlask, IconGrid, IconLink, IconMap, IconMore, IconReel, IconSpectrum, IconTarget, IconWarning } from '@/components/icons'
import { Button, Chip, EmptyState, IconButton, IconTabs, isSaturated, isVerified, Notice, ObjectAvatar, ObjectBadges, Sheet, SheetRow, Skeleton, TopBar } from '@/components/ui/primitives'
import type { ObjectProfile } from '@/lib/api/client'
import { useFollow, useLearn, useObject, useObjectPosts, useSession } from '@/lib/api/hooks'
import { BAND_HUE, BANDS, compactNumber, formatDec, formatRa, formatShortDate } from '@/lib/format'
import { useShare } from '@/lib/share'
import { useUi } from '@/lib/state/ui'

type Tab = 'photos' | 'spectrum' | 'timelapses' | 'measurements'
type Highlight = 'why' | 'colours' | 'sources' | 'position'

function HighlightBubble({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <li className="flex w-[72px] shrink-0 flex-col items-center gap-1">
      <button type="button" onClick={onClick} className="flex size-[64px] items-center justify-center rounded-full border-[1.5px] border-ring-seen bg-surface text-text" aria-label={label}>
        {children}
      </button>
      <span className="w-full truncate text-center text-meta">{label}</span>
    </li>
  )
}

function ProfileSkeleton() {
  return (
    <div className="px-4 pt-3" aria-hidden="true">
      <div className="flex items-center gap-4">
        <Skeleton className="size-[91px] rounded-full" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-full" />
        </div>
      </div>
      <Skeleton className="mt-4 h-12 w-full" />
      <Skeleton className="mt-4 h-8 w-full" />
    </div>
  )
}

function FollowButton({ profile }: { profile: ObjectProfile }) {
  const t = useTranslations('profile')
  const { data: user } = useSession()
  const ask = useUi((s) => s.askLogin)
  const follow = useFollow(profile.id)
  const on = profile.following
  return (
    <Button
      variant={on ? 'secondary' : 'primary'}
      className="h-8 flex-1"
      aria-pressed={on}
      disabled={follow.isPending}
      onClick={() => (user ? follow.mutate(!on) : ask('follow'))}
    >
      {on ? t('following') : t('follow')}
      {on && <IconChevronDownSmall size={20} />}
    </Button>
  )
}

export function ObjectProfileView({ id }: { id: string }) {
  const locale = useLocale()
  const t = useTranslations('profile')
  const tp = useTranslations('post')
  const ts = useTranslations('stories')
  const { data: profile, isLoading, isError } = useObject(id)
  const { data: posts } = useObjectPosts(id)
  const { data: user } = useSession()
  const learn = useLearn()
  const share = useShare()
  const seen = useUi((s) => s.seenStories.includes(id))
  const openStory = useUi((s) => s.openStory)
  const [tab, setTab] = useState<Tab>('photos')
  const [band, setBand] = useState<string | null>(null)
  const [highlight, setHighlight] = useState<Highlight | null>(null)
  const [more, setMore] = useState(false)
  const [map, setMap] = useState(false)

  const learnRef = useRef(learn.mutate)
  learnRef.current = learn.mutate
  const userId = user?.id
  const objectId = profile?.id
  const hasSpectra = !!profile?.measurements.spectra

  useEffect(() => {
    if (userId && objectId) learnRef.current({ event: 'object_viewed', ref: objectId })
  }, [userId, objectId])

  useEffect(() => {
    if (tab === 'spectrum' && userId && objectId && hasSpectra) learnRef.current({ event: 'spectrum_opened', ref: objectId })
  }, [tab, userId, objectId, hasSpectra])

  const bandsPresent = useMemo(() => BANDS.filter((b) => posts?.some((p) => p.frames.some((f) => f.band === b))), [posts])
  const timelapse = posts?.find((p) => p.type === 'timelapse')
  const blink = posts?.find((p) => p.type === 'pass_blink') ?? timelapse

  if (isError) return <EmptyState title={t('noPosts')} />
  if (isLoading || !profile) {
    return (
      <main>
        <TopBar title="" />
        <ProfileSkeleton />
      </main>
    )
  }

  const unmeasurable = profile.verdict === 'not_measurable' || profile.verdict === 'not_detected'
  const tiles = band ? frameTiles(posts ?? [], band, locale) : tilesFromPosts(posts ?? [])

  return (
    <main>
      <TopBar
        title={profile.handle}
        actions={
          <>
            <Link href="/alerts" aria-label={t('notifications')} className="inline-flex size-11 items-center justify-center">
              <IconBell />
            </Link>
            <IconButton label={t('more')} onClick={() => setMore(true)}>
              <IconMore />
            </IconButton>
          </>
        }
      />

      <section className="px-[10px] pt-1">
        <div className="flex items-center gap-[15px]">
          <button type="button" onClick={() => openStory(profile.id)} aria-label={tp('openStory', { name: profile.name })} className="relative shrink-0 rounded-full">
            <ObjectAvatar src={profile.avatar} alt="" size={91} ring={timelapse ? (seen ? 'seen' : 'new') : 'none'} />
            {profile.has_new_data && <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded border-2 border-bg bg-danger px-1 text-micro font-bold uppercase text-white">{ts('new')}</span>}
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-1 text-account font-semibold">
              <span className="truncate">{profile.kind === 'candidate' ? t('candidateTitle', { id: profile.id }) : profile.name}</span>
              <ObjectBadges verified={isVerified(profile.verdict)} saturated={isSaturated(profile.saturation)} size={15} />
            </h2>
            <dl className="mt-2 flex gap-[23px]">
              {[
                [profile.stats.posts, t('posts')],
                [profile.stats.passes, t('passes')],
                [profile.stats.followers, t('followers')],
              ].map(([v, l]) => (
                <div key={String(l)} className="flex flex-col-reverse leading-tight">
                  <dt className="text-body">{l}</dt>
                  <dd className="text-title-sm font-semibold">{compactNumber(Number(v), locale)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <div className="mt-3 space-y-1 text-body">
          <p className="text-text-secondary">{profile.official_target ? tp('officialTarget') : tp(`kinds.${profile.kind}`)}</p>
          {profile.kind === 'candidate' ? <p>{t('candidateBody')}</p> : <p>{profile.bio}</p>}
          {profile.aliases.length > 0 && <p className="text-text-secondary">{t('aliases', { names: profile.aliases.slice(0, 4).join(' · ') })}</p>}
          <p>
            {profile.sources.slice(0, 3).map((s, i) => (
              <span key={s.id}>
                {i > 0 && ' · '}
                <a href={s.url} target="_blank" rel="noreferrer" className="text-link">
                  {s.label.split(/[(,]/)[0]?.trim()}
                </a>
              </span>
            ))}
          </p>
        </div>
      </section>

      <div className="mt-3 flex gap-[6px] px-4">
        <FollowButton profile={profile} />
        <Button className="h-8 flex-1" onClick={() => setMap(true)}>
          {t('skyMap')}
        </Button>
        <Link href={`/lab/${profile.id}`} className="inline-flex h-8 flex-1 items-center justify-center rounded-[var(--radius-button)] bg-surface text-ui font-medium active:bg-surface-pressed">
          {t('lab')}
        </Link>
        {blink && (
          <Link href={`/p/${blink.id}?compare=1`} aria-label={t('compare')} title={t('compare')} className="inline-flex size-8 items-center justify-center rounded-[var(--radius-button)] bg-surface">
            <IconCompare size={24} />
          </Link>
        )}
      </div>

      <ul className="no-scrollbar mt-4 flex gap-3 overflow-x-auto px-4">
        <HighlightBubble label={t('highlights.why')} onClick={() => setHighlight('why')}>
          <IconWarning size={28} />
        </HighlightBubble>
        <HighlightBubble label={t('highlights.colours')} onClick={() => setHighlight('colours')}>
          <span className="flex gap-0.5">
            {BANDS.map((b) => (
              <span key={b} className="h-6 w-1.5 rounded-full" style={{ background: BAND_HUE[b], opacity: profile.best_bands.includes(b) ? 1 : 0.25 }} />
            ))}
          </span>
        </HighlightBubble>
        <HighlightBubble label={t('highlights.position')} onClick={() => setHighlight('position')}>
          <IconTarget size={28} />
        </HighlightBubble>
        <HighlightBubble label={t('highlights.sources')} onClick={() => setHighlight('sources')}>
          <IconLink size={28} />
        </HighlightBubble>
      </ul>

      {(unmeasurable || profile.verdict === 'indicative' || isSaturated(profile.saturation)) && (
        <div className="mt-4 px-4">
          <Notice tone="warning" icon={<IconWarning size={20} />}>
            <p className="font-semibold">{unmeasurable ? t('whyTitle') : t(`verdicts.${profile.verdict}`)}</p>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-text-secondary">
              {profile.limits.slice(0, 2).map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </Notice>
        </div>
      )}

      <div className="mt-3">
        <IconTabs<Tab>
          label={t('tabs.label')}
          value={tab}
          onChange={setTab}
          tabs={[
            { key: 'photos', icon: <IconGrid />, label: t('tabs.photos') },
            { key: 'spectrum', icon: <IconSpectrum />, label: t('tabs.spectrum') },
            { key: 'timelapses', icon: <IconReel />, label: t('tabs.timelapses') },
            { key: 'measurements', icon: <IconChart />, label: t('tabs.measurements') },
          ]}
        />
      </div>

      {tab === 'photos' && (
        <>
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-3 py-2">
            <Chip active={!band} onClick={() => setBand(null)}>
              {t('filterAll')}
            </Chip>
            {bandsPresent.map((b) => (
              <Chip key={b} active={band === b} onClick={() => setBand(b)}>
                <span className="size-2 rounded-full" style={{ background: BAND_HUE[b] }} />
                {b}
              </Chip>
            ))}
          </div>
          {posts ? <PostGrid tiles={tiles} /> : <Skeleton className="aspect-[3/4] w-1/3 rounded-none" />}
        </>
      )}

      {tab === 'timelapses' && <PostGrid tiles={tilesFromPosts((posts ?? []).filter((p) => p.type === 'timelapse' || p.type === 'pass_blink'))} />}

      {tab === 'spectrum' && (
        <section className="space-y-3 px-4 py-4">
          {profile.measurements.spectra ? (
            <>
              <h3 className="text-ui font-semibold">{t('tabs.spectrum')}</h3>
              <KitChart kind="spectrum" url={profile.measurements.spectra} />
              <QrWarning />
            </>
          ) : (
            <EmptyState title={t('noSpectrum')} />
          )}
        </section>
      )}

      {tab === 'measurements' && (
        <section className="space-y-6 px-4 py-4">
          {!profile.measurements.motion && !profile.measurements.lightcurve && <EmptyState title={t('noMeasurements')} />}
          {profile.measurements.motion && <KitChart kind="motion" url={profile.measurements.motion} />}
          {timelapse && (
            <Link href={`/p/${timelapse.id}?mark=1`} className="flex items-center gap-3 rounded-xl bg-surface p-3">
              <IconTarget size={28} />
              <span className="flex-1 text-body">{tp('menu.mark')}</span>
            </Link>
          )}
          {profile.measurements.lightcurve && <KitChart kind="lightcurve" url={profile.measurements.lightcurve} />}
          <QrWarning />
        </section>
      )}

      <Sheet open={highlight !== null} onClose={() => setHighlight(null)} title={highlight ? t(`highlights.${highlight}`) : ''}>
        <div className="space-y-3 px-4 py-4 text-body">
          {highlight === 'why' && (
            <>
              <p className="font-semibold">{t(`verdicts.${profile.verdict}`)}</p>
              <ul className="list-disc space-y-2 pl-4 text-text-secondary">
                {profile.limits.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </>
          )}
          {highlight === 'colours' && (
            <>
              <p>{t('bestBands', { bands: profile.best_bands.join(', ') })}</p>
              <p className="text-text-secondary">{t('seen', { n: profile.n_images, from: formatShortDate(profile.first_seen, locale), to: formatShortDate(profile.last_seen, locale) })}</p>
              <dl className="grid grid-cols-2 gap-2">
                {profile.facts.map((f, i) => (
                  <div key={`${f.label}-${i}`} className="rounded-lg bg-surface px-3 py-2">
                    <dt className="text-meta text-text-secondary">{f.label}</dt>
                    <dd className="font-semibold">
                      {typeof f.value === 'number' ? f.value.toLocaleString('en-US', { maximumFractionDigits: 3 }) : f.value} {f.unit ?? ''}
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          )}
          {highlight === 'position' && (
            <>
              <p className="text-text-secondary">{t('coords', { epoch: profile.epoch })}</p>
              <p className="font-mono text-ui">
                {formatRa(profile.ra)} {formatDec(profile.dec)}
              </p>
              <p className="font-mono text-note text-text-secondary">
                {profile.ra.toFixed(5)}°, {profile.dec.toFixed(5)}°
              </p>
              <Link href={`/sky?ra=${profile.ra.toFixed(5)}&dec=${profile.dec.toFixed(5)}&fov=0.1&name=${encodeURIComponent(profile.name)}`} className="inline-flex h-9 items-center rounded-[var(--radius-button)] bg-accent px-4 font-medium text-on-accent">
                {t('skyMap')}
              </Link>
            </>
          )}
          {highlight === 'sources' && (
            <ul className="space-y-2">
              {profile.sources.map((s) => (
                <li key={s.id}>
                  <a href={s.url} target="_blank" rel="noreferrer" className="text-link">
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Sheet>

      <Sheet open={more} onClose={() => setMore(false)}>
        <div className="py-2">
          <SheetRow icon={<IconFlask size={26} />} label={tp('menu.lab')} hint={tp('menu.labHint')} href={`/lab/${profile.id}`} onClick={() => setMore(false)} />
          <SheetRow icon={<IconMap size={26} />} label={t('skyMap')} onClick={() => { setMore(false); setMap(true) }} />
          <SheetRow icon={<IconLink size={26} />} label={t('share')} onClick={() => { setMore(false); void share({ title: profile.name, path: `/o/${profile.id}` }) }} />
        </div>
      </Sheet>

      <Sheet open={map} onClose={() => setMap(false)} title={t('skyMapTitle')}>
        <div className="px-4 py-3">
          <div className="aspect-square w-full overflow-hidden rounded-xl bg-media-bg">
            {map && (
              <iframe
                title={t('skyMapTitle')}
                className="size-full"
                loading="lazy"
                src={`https://aladin.cds.unistra.fr/AladinLite/?target=${encodeURIComponent(`${profile.ra} ${profile.dec}`)}&fov=0.25&survey=CDS%2FP%2FDSS2%2Fcolor`}
              />
            )}
          </div>
          <p className="mt-2 text-meta text-text-secondary">{t('skyMapHint')}</p>
          <p className="text-meta text-text-secondary">{t('skyMapCredit')}</p>
        </div>
      </Sheet>
    </main>
  )
}
