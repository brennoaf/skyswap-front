'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useRef, useState } from 'react'
import { KitChart, QrWarning } from '@/components/charts/charts'
import { PostHeader, PostMoreSheet } from '@/components/feed/post-card'
import { IconCompare, IconTarget, IconWarning } from '@/components/icons'
import { NotesPanel } from '@/components/post/notes-panel'
import { buildSequences, centre, FILTERS, framePool, nearestByWavelength, type FilterKey, type Sequence } from '@/components/post/sequences'
import { PlayerControls, Stage, usePlayer, type Point } from '@/components/post/stage'
import { TagPanel } from '@/components/post/tag-panel'
import { Button, Chip, EmptyState, Notice, Skeleton, TopBar } from '@/components/ui/primitives'
import { useLearn, useObjectPosts, usePost, useSaveMarks, useSession } from '@/lib/api/hooks'
import { cx, formatDate, formatShortDate } from '@/lib/format'
import { useUi } from '@/lib/state/ui'

type Mode = 'play' | 'mark' | 'compare'

const CHART_KIND = { spectrum: 'spectrum', lightcurve: 'lightcurve', motion: 'motion' } as const

function FilterCarousel({ sequences, active, onPick }: { sequences: Record<FilterKey, Sequence>; active: string; onPick: (k: FilterKey) => void }) {
  const t = useTranslations('viewer')
  return (
    <div>
      <h3 className="sr-only">{t('filters')}</h3>
      <ul className="no-scrollbar flex gap-3 overflow-x-auto px-3 py-2">
        {FILTERS.map((k) => {
          const s = sequences[k]
          const thumb = s.frames[Math.floor(s.frames.length / 2)] ?? s.frames[0]
          const on = active === k
          return (
            <li key={k} className="shrink-0">
              <button type="button" aria-pressed={on} disabled={!thumb} onClick={() => onPick(k)} title={t(`filterHints.${k}`)} className="flex w-[76px] flex-col items-center gap-1 disabled:opacity-35">
                <span className={cx('text-[12px]', on ? 'font-semibold text-text' : 'text-text-secondary')}>{t(`filterNames.${k}`)}</span>
                <span className={cx('relative block size-[76px] overflow-hidden rounded-[4px] bg-media-bg', on && 'ring-2 ring-text ring-offset-2 ring-offset-bg')}>
                  {thumb && <Image src={thumb.src} alt="" fill sizes="76px" className="pixelated object-contain" unoptimized />}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function WavelengthSlider({ value, onChange, min, max }: { value: number | null; onChange: (v: number) => void; min: number; max: number }) {
  const t = useTranslations('viewer')
  return (
    <label className="flex items-center gap-3 px-4 py-1">
      <span className="shrink-0 text-[13px] text-text-secondary">{t('wavelength')}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={0.01}
        value={value ?? min}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-11 flex-1"
        style={{ accentColor: 'var(--color-accent)', background: 'linear-gradient(90deg,#5b8cff,#3ec6ff,#33d6a6,#c6e04a,#ffa63d,#ff5a4f)', height: 4, borderRadius: 4 }}
        aria-valuetext={value ? t('wavelengthValue', { value: value.toFixed(2) }) : undefined}
      />
      <span className="w-[64px] shrink-0 text-right font-mono text-[13px]">{value ? t('wavelengthValue', { value: value.toFixed(2) }) : '—'}</span>
    </label>
  )
}

export function PostViewer({ id }: { id: string }) {
  const t = useTranslations('viewer')
  const tp = useTranslations('post')
  const params = useSearchParams()
  const { data, isLoading, isError } = usePost(id)
  const { data: objectPosts } = useObjectPosts(data?.object.id)
  const { data: user } = useSession()
  const ask = useUi((s) => s.askLogin)
  const toast = useUi((s) => s.toast)
  const save = useSaveMarks(id)
  const learn = useLearn()
  const learnRef = useRef(learn.mutate)
  learnRef.current = learn.mutate
  const [more, setMore] = useState(false)
  const [filter, setFilter] = useState<FilterKey | 'slider'>('original')
  const [wave, setWave] = useState<number | null>(null)
  const [mode, setMode] = useState<Mode>(params.get('mark') ? 'mark' : params.get('compare') ? 'compare' : 'play')
  const [draft, setDraft] = useState<Point[]>([])
  const [compare, setCompare] = useState(50)
  const bandsSeen = useRef(new Set<string>())

  const sequences = useMemo(() => (data ? buildSequences(data.post, objectPosts ?? []) : null), [data, objectPosts])
  const pool = useMemo(() => framePool(objectPosts ?? []), [objectPosts])
  const range = useMemo(() => {
    const cs = pool.map(centre).filter((c): c is number => c !== null)
    return cs.length ? { min: Math.floor(Math.min(...cs) * 100) / 100, max: Math.ceil(Math.max(...cs) * 100) / 100 } : { min: 0.75, max: 5 }
  }, [pool])

  const sliderFrame = filter === 'slider' && wave !== null ? nearestByWavelength(pool, wave) : null
  const seq: Sequence | null = sequences ? (filter === 'slider' ? { key: 'slider', frames: sliderFrame ? [sliderFrame] : [], predicted: new Map() } : sequences[filter]) : null
  const frames = seq?.frames ?? []
  const player = usePlayer(frames.length, mode === 'play')
  const current = frames[player.index]

  const setPlaying = player.setPlaying
  useEffect(() => {
    if (mode !== 'play') setPlaying(false)
  }, [mode, setPlaying])

  const userId = user?.id
  const band = current?.band
  useEffect(() => {
    if (!userId || !band || !/^D[1-6]$/.test(band) || bandsSeen.current.has(band)) return
    bandsSeen.current.add(band)
    learnRef.current({ event: 'band_seen', ref: band })
  }, [userId, band])

  const postType = data?.post.type
  const objectId = data?.object.id
  useEffect(() => {
    if (userId && objectId && postType === 'spectrum') learnRef.current({ event: 'spectrum_opened', ref: objectId })
  }, [userId, objectId, postType])

  if (isError) return <EmptyState title={t('notFound')} action={<Link href="/" className="text-link">{tp('menu.profile')}</Link>} />
  if (isLoading || !data || !sequences) {
    return (
      <main>
        <TopBar title={t('title')} />
        <Skeleton className="mx-2 my-2 h-10 w-48" />
        <Skeleton className="aspect-[4/5] w-full rounded-none" />
      </main>
    )
  }

  const { post, object } = data
  const isChart = post.type in CHART_KIND && post.chart
  const canMark = filter === 'original' && post.frames.length > 0
  const compareFrames = (objectPosts ?? []).find((p) => p.type === 'pass_blink')?.frames ?? post.frames
  const markedCount = new Set([...draft, ...data.my_marks].map((m) => m.frame)).size
  const fs = post.flags_summary

  const startMark = () => {
    if (!user) return ask('mark')
    setFilter('original')
    setMode('mark')
  }

  return (
    <main className="pb-6">
      <TopBar title={t('title')} />
      <PostHeader item={data} onMore={() => setMore(true)} />

      {isChart ? (
        <div className="bg-bg px-3 pb-2">
          <KitChart kind={CHART_KIND[post.type as keyof typeof CHART_KIND]} url={post.chart as string} />
        </div>
      ) : (
        <>
          <Stage
            frames={mode === 'compare' ? compareFrames : frames}
            index={mode === 'compare' ? 0 : player.index}
            predicted={seq?.predicted ?? new Map()}
            mode={mode}
            myMarks={filter === 'original' ? data.my_marks : []}
            draftMarks={filter === 'original' ? draft : []}
            community={filter === 'original' ? (data.community_marks?.frames ?? null) : null}
            compare={compare}
            onCompareChange={setCompare}
            onMark={(p) => {
              setDraft((d) => [...d.filter((x) => x.frame !== p.frame), p])
              if (player.index + 1 < frames.length) player.setIndex(player.index + 1)
            }}
          />
          {mode !== 'compare' && <PlayerControls length={frames.length} player={player} />}
        </>
      )}

      {!isChart && (
        <div className="flex gap-2 px-3 py-2">
          <Chip active={mode === 'mark'} onClick={() => (mode === 'mark' ? setMode('play') : startMark())} className={!canMark && mode !== 'mark' ? 'opacity-50' : undefined}>
            <IconTarget size={20} />
            {t('mark')}
          </Chip>
          <Chip active={mode === 'compare'} onClick={() => setMode(mode === 'compare' ? 'play' : 'compare')}>
            <IconCompare size={20} />
            {t('compare')}
          </Chip>
        </div>
      )}

      {mode === 'mark' && (
        <section className="mx-3 mb-2 rounded-2xl border-[0.5px] border-accent/50 bg-accent/10 p-3" aria-live="polite">
          <p className="text-[15px] font-semibold">{t('markTitle')}</p>
          <p className="mt-1 text-[13px] text-text-secondary">{t('markHint')}</p>
          <p className="mt-2 text-[13px]">{t('markProgress', { n: markedCount, total: post.frames.length })}</p>
          <div className="mt-2 flex gap-2">
            <Button
              variant="primary"
              disabled={!draft.length || save.isPending}
              onClick={() =>
                save.mutate(draft, {
                  onSuccess: () => {
                    setDraft([])
                    toast({ kind: 'info', key: 'viewer.markSaved' })
                  },
                })
              }
            >
              {save.isPending ? t('markSaving') : t('markSave')}
            </Button>
            <Button disabled={!draft.length} onClick={() => setDraft([])}>
              {t('markClear')}
            </Button>
            <Button variant="ghost" className="ml-auto" onClick={() => setMode('play')}>
              {t('markDone')}
            </Button>
          </div>
          {data.community_marks && <p className="mt-2 text-[12px] text-text-secondary">{t('markCompare', { people: data.community_marks.people })}</p>}
        </section>
      )}

      {mode === 'compare' && <p className="px-4 pb-2 text-[13px] text-text-secondary">{t('compareHint')}</p>}

      {!isChart && mode === 'play' && (
        <>
          <FilterCarousel
            sequences={sequences}
            active={filter}
            onPick={(k) => {
              setFilter(k)
              setWave(null)
              player.setIndex(0)
            }}
          />
          <WavelengthSlider
            value={wave}
            min={range.min}
            max={range.max}
            onChange={(v) => {
              setWave(v)
              setFilter('slider')
              player.setIndex(0)
            }}
          />
          <p className="px-4 text-[12px] text-text-secondary">
            {filter === 'slider' ? (sliderFrame ? `${sliderFrame.band} · ${formatShortDate(sliderFrame.t)}` : t('filterEmpty')) : frames.length ? t(`filterHints.${filter}`) : t('filterEmpty')}
          </p>
        </>
      )}

      <div className="space-y-4 px-3 pt-3">
        <p className="text-[14px]">
          <Link href={`/o/${object.id}`} className="font-semibold">
            {object.handle}
          </Link>{' '}
          <span className="font-semibold">{post.title}.</span> {post.caption}
        </p>
        <p className="-mt-2 text-[12px] text-text-muted">
          {formatDate(post.date_range[0] ?? '')} → {formatDate(post.date_range[1] ?? '')} · {tp(`types.${post.type}`)}
        </p>

        {(object.saturation === 'heavy' || fs.saturated > 0.5) && (
          <Notice tone="warning" icon={<IconWarning size={20} />}>
            {t('saturatedWarning')}
          </Notice>
        )}

        <section aria-labelledby="tags-title">
          <h3 id="tags-title" className="mb-2 text-[15px] font-semibold">
            {tp('actions.tag')}
          </h3>
          <TagPanel postId={post.id} tags={data.tags} />
        </section>

        {post.frames.length > 0 && (
          <section aria-labelledby="flags-title">
            <h3 id="flags-title" className="mb-2 text-[15px] font-semibold">
              {t('flags')}
            </h3>
            <ul className="grid grid-cols-2 gap-2">
              {(['saturated', 'cosmic_ray', 'persistence', 'satellite'] as const).map((k) => (
                <li key={k} className="rounded-lg bg-surface px-3 py-2">
                  <p className="text-[12px] text-text-secondary">{t(`flagItems.${k}`)}</p>
                  <p className="text-[14px] font-semibold">{k === 'satellite' ? '—' : t('flagFrac', { pct: Math.round(fs[k] * 100) })}</p>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[12px] text-text-secondary">{t('satelliteNote')}</p>
          </section>
        )}

        {new Set(post.frames.map((f) => f.release)).size > 1 && <QrWarning />}

        <NotesPanel postId={post.id} objectId={object.id} title={post.title} />

        <p className="text-[12px] text-text-secondary">{t('dataNotice')}</p>
      </div>

      <PostMoreSheet open={more} onClose={() => setMore(false)} item={data} />
    </main>
  )
}
