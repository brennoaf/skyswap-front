'use client'

import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { useEffect, useMemo, useRef, useState } from 'react'
import { KitChart, QrWarning } from '@/components/charts/charts'
import { frameTiles, PostGrid, tilesFromPosts } from '@/components/profile/post-grid'
import { IconBell, IconChart, IconChevronDownSmall, IconFlask, IconGrid, IconLink, IconMap, IconMore, IconReel, IconSpectrum, IconTarget, IconWarning, IconChevronRight } from '@/components/icons'
import { Button, Chip, EmptyState, IconButton, IconTabs, isSaturated, isVerified, ObjectAvatar, ObjectBadges, Sheet, SheetRow, Skeleton, TopBar } from '@/components/ui/primitives'
import type { ObjectProfile } from '@/lib/api/client'
import { useFollow, useLearn, useObject, useObjectPosts, useSession } from '@/lib/api/hooks'
import { BAND_HUE, BANDS, compactNumber, cx, formatShortDate } from '@/lib/format'
import { useShare } from '@/lib/share'
import { useUi } from '@/lib/state/ui'
import { objectBio } from '@/lib/post-text'
import { useBandList, useBandName } from '@/lib/use-band'
import { SkyMapSheet } from '@/components/sky/sky-map-sheet'

type Tab = 'photos' | 'spectrum' | 'timelapses' | 'measurements'

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
  const bandName = useBandName()
  const bandList = useBandList()
  const seen = useUi((s) => s.seenStories.includes(id))
  const openStory = useUi((s) => s.openStory)
  const [tab, setTab] = useState<Tab>('photos')
  const [band, setBand] = useState<string | null>(null)
  const [why, setWhy] = useState(false)
  const [more, setMore] = useState(false)
  const [map, setMap] = useState(false)
  const [bioOpen, setBioOpen] = useState(false)

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
  const verdictKey = isSaturated(profile.saturation) && (profile.verdict === 'clear' || profile.verdict === 'with_help') ? `${profile.verdict}_bright` : profile.verdict
  const tiles = band ? frameTiles(posts ?? [], band, locale) : tilesFromPosts(posts ?? [], locale)

  return (
    <main>
      <TopBar
        title={profile.kind === 'candidate' ? t('candidateTitle', { id: profile.id }) : profile.name}
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
            <p className="flex items-center gap-1 text-account font-semibold">
              <span className="truncate">{tp(`kinds.${profile.kind}`)}</span>
              <ObjectBadges verified={isVerified(profile.verdict)} saturated={isSaturated(profile.saturation)} size={15} />
            </p>
            <dl className="mt-2 flex gap-[23px]">
              {(
                [
                  ['posts', profile.stats.posts],
                  ['passes', profile.stats.passes],
                  ['followers', profile.stats.followers],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="flex flex-col-reverse leading-tight">
                  <dt className="text-body">{t(k, { n: v })}</dt>
                  <dd className="text-title-sm font-semibold">{compactNumber(v, locale)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <div className="mt-3 space-y-1 text-body">
          <p className={cx(!bioOpen && 'line-clamp-2')}>{profile.kind === 'candidate' ? t('candidateBody') : objectBio(profile.bio, locale)}</p>
          {bioOpen ? (
            <>
              {profile.aliases.length > 0 && <p className="text-text-secondary">{t('aliases', { names: profile.aliases.slice(0, 4).join(', ') })}</p>}
              <p className="text-text-secondary">{t('seen', { n: profile.n_images, from: formatShortDate(profile.first_seen, locale), to: formatShortDate(profile.last_seen, locale) })}</p>
              {profile.best_bands.length > 0 && <p className="text-text-secondary">{t('bestBands', { bands: bandList(profile.best_bands) })}</p>}
              {profile.facts.length > 0 && (
                <dl className="grid grid-cols-2 gap-2 py-1">
                  {profile.facts.map((f, i) => (
                    <div key={`${f.label}-${i}`} className="rounded-lg bg-surface px-3 py-2">
                      <dt className="text-meta text-text-secondary">{f.label}</dt>
                      <dd className="font-semibold">
                        {typeof f.value === 'number' ? f.value.toLocaleString(locale, { maximumFractionDigits: 3 }) : f.value} {f.unit ?? ''}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
              <p>
                {profile.sources.map((s, i) => (
                  <span key={s.id}>
                    {i > 0 && ', '}
                    <a href={s.url} target="_blank" rel="noreferrer" className="text-link">
                      {s.label.split(/[(,]/)[0]?.trim()}
                    </a>
                  </span>
                ))}
              </p>
            </>
          ) : (
            <button type="button" onClick={() => setBioOpen(true)} className="hit-44 text-text-secondary">
              {tp('more')}
            </button>
          )}
        </div>
      </section>

      <div className="mt-3 flex gap-[6px] px-4">
        <FollowButton profile={profile} />
        <Button className="h-8 flex-1 whitespace-nowrap px-2 text-body" onClick={() => setMap(true)}>
          {t('skyMap')}
        </Button>
        <Link href={`/lab/${profile.id}`} className="hit-44 inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-[var(--radius-button)] bg-surface text-ui font-medium active:bg-surface-pressed">
          <IconFlask size={18} />
          {t('lab')}
        </Link>
      </div>

      {(unmeasurable || profile.verdict === 'indicative' || isSaturated(profile.saturation)) && (
        <div className="mt-4 px-4">
          <button type="button" onClick={() => setWhy(true)} className="flex min-h-11 w-full items-center gap-3 rounded-xl bg-surface px-3 py-2 text-left text-note active:bg-surface-pressed">
            <IconWarning size={20} className="shrink-0 text-warning" />
            <span className="min-w-0 flex-1 font-semibold">{unmeasurable ? t('whyTitle') : t(`verdicts.${verdictKey}`)}</span>
            <IconChevronRight size={20} className="shrink-0 text-text-secondary" />
          </button>
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
                {bandName(b)}
              </Chip>
            ))}
          </div>
          {posts ? <PostGrid tiles={tiles} /> : <Skeleton className="aspect-[3/4] w-1/3 rounded-none" />}
        </>
      )}

      {tab === 'timelapses' && <PostGrid tiles={tilesFromPosts((posts ?? []).filter((p) => p.type === 'long_baseline' || p.type === 'timelapse' || p.type === 'pass_blink'), locale)} />}

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

      <Sheet open={why} onClose={() => setWhy(false)} title={t('why')}>
        <div className="space-y-3 px-4 py-4 text-body">
          <p className="font-semibold">{t(`verdicts.${verdictKey}`)}</p>
          <ul className="list-disc space-y-2 pl-4 text-text-secondary">
            {profile.limits.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      </Sheet>

      <Sheet open={more} onClose={() => setMore(false)}>
        <div className="py-2">
          <SheetRow icon={<IconFlask size={26} />} label={tp('menu.lab')} hint={tp('menu.labHint')} href={`/lab/${profile.id}`} onClick={() => setMore(false)} />
          <SheetRow icon={<IconMap size={26} />} label={t('skyMap')} onClick={() => { setMore(false); setMap(true) }} />
          <SheetRow icon={<IconLink size={26} />} label={t('share')} onClick={() => { setMore(false); void share({ title: profile.name, path: `/o/${profile.id}` }) }} />
        </div>
      </Sheet>

      <SkyMapSheet open={map} onClose={() => setMap(false)} object={profile} />
    </main>
  )
}
