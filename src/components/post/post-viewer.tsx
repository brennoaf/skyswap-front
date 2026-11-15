'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react'
import { KitChart, QrWarning } from '@/components/charts/charts'
import { PostHeader } from '@/components/feed/post-card'
import { IconCrosshair, IconStepBack, IconStepForward } from '@/components/icons'
import { PlayerBar } from '@/components/player/player-bar'
import { usePlaybackKeys } from '@/components/player/use-playback'
import { ActionRow } from '@/components/post/action-row'
import { EraTimeline } from '@/components/post/era-timeline'
import { MarkResult, PredictionHelp } from '@/components/post/marking-help'
import { MediaStage, STAGE_BOX, usePlayer, type Point, type StageMode } from '@/components/post/media-stage'
import { AboutSheet, ColoursSheet, MoreSheet, NotesSheet, TagSheet } from '@/components/post/post-sheets'
import { buildSequences, centre, framePool, nearestByWavelength, type FilterKey, type Sequence } from '@/components/post/sequences'
import { EmptyState, Skeleton, TopBar } from '@/components/ui/primitives'
import type { Frame } from '@/lib/api/client'
import { useCelebrate, useLearn, useObject, useObjectPosts, usePost, useSaveMarks, useSession } from '@/lib/api/hooks'
import { cx } from '@/lib/format'
import { hasWise, LONG_BASELINE_FPS } from '@/lib/long-baseline'
import { postCaption, postTitle } from '@/lib/post-text'
import { useShare } from '@/lib/share'
import { useUi } from '@/lib/state/ui'
import { useFmt } from '@/lib/use-fmt'

const CHART_KIND = { spectrum: 'spectrum', lightcurve: 'lightcurve', motion: 'motion' } as const
const PASS_GAP_DAYS = 20
const NO_PREDICTION = new Map<number, { x: number; y: number }>()

type SheetKey = 'more' | 'about' | 'tags' | 'colours' | 'notes' | null
type Dots = { count: number; active: number; onPick: (i: number) => void }

function groupsOf(type: string, frames: Frame[]): number[] {
  if (frames.length < 2) return [0]
  if (type !== 'timelapse') return frames.map((_, i) => i)
  const starts = [0]
  for (let i = 1; i < frames.length; i++) if ((frames[i]?.mjd ?? 0) - (frames[i - 1]?.mjd ?? 0) > PASS_GAP_DAYS) starts.push(i)
  return starts
}

function PostStage({
  frames,
  groupType,
  filterKey,
  predicted,
  mode,
  longBaseline,
  bestBand,
  compareFrames,
  mixedReleases,
  myMarks,
  draftMarks,
  community,
  revealPrediction,
  saturated,
  pathMarks,
  frameRef,
  markedCount,
  saving,
  onMark,
  onMarkDone,
  onBand,
  actions,
}: {
  frames: Frame[]
  groupType: string
  filterKey: string
  predicted: Map<number, { x: number; y: number }>
  mode: StageMode
  longBaseline: boolean
  bestBand: string | undefined
  compareFrames: [Frame, Frame] | null
  mixedReleases: boolean
  myMarks: Point[]
  draftMarks: Point[]
  community: { frame: number; x: number; y: number }[] | null
  revealPrediction: boolean
  saturated: boolean
  pathMarks: { x: number; y: number }[]
  frameRef: MutableRefObject<Frame | undefined>
  markedCount: number
  saving: boolean
  onMark: (p: Point) => void
  onMarkDone: () => void
  onBand: (band: string) => void
  actions: (dots: Dots | null) => ReactNode
}) {
  const t = useTranslations('viewer')
  const player = usePlayer(frames.length, mode === 'play', longBaseline ? LONG_BASELINE_FPS : undefined, longBaseline ? LONG_BASELINE_FPS : undefined)
  const { index, setIndex, setPlaying, playing } = player
  usePlaybackKeys(player, mode === 'play')
  const [path, setPath] = useState(false)
  const [outside, setOutside] = useState<Record<string, boolean>>({})
  const current = frames[index]
  const groups = useMemo(() => groupsOf(groupType, frames), [groupType, frames])
  const activeGroup = Math.max(0, groups.findLastIndex((g) => g <= index))
  const seconds = useMemo(() => frames.map((f) => (Date.parse(f.t) - Date.parse(frames[0]?.t ?? f.t)) / 1000), [frames])
  const dates = useMemo(() => frames.map((f) => f.t), [frames])

  useEffect(() => {
    frameRef.current = current
  }, [frameRef, current])

  const started = useRef(false)
  useEffect(() => {
    setIndex(0)
  }, [filterKey, setIndex])
  useEffect(() => {
    if (started.current || !bestBand || filterKey !== 'original') return
    started.current = true
    const first = frames.findIndex((f) => f.band === bestBand)
    if (first > 0) setIndex(first)
  }, [bestBand, frames, filterKey, setIndex])

  useEffect(() => {
    if (mode !== 'play') setPlaying(false)
    if (mode === 'mark') setIndex(0)
  }, [mode, setPlaying, setIndex])

  const band = current?.band
  useEffect(() => {
    if (band) onBand(band)
  }, [band, onBand])

  const pickGroup = useCallback((i: number) => setIndex(groups[Math.max(0, Math.min(groups.length - 1, i))] ?? 0), [groups, setIndex])
  const noteOutside = useCallback((src: string, out: boolean) => setOutside((o) => (o[src] === out ? o : { ...o, [src]: out })), [])
  const thumb = useCallback(
    (i: number) => {
      const f = frames[i]
      return f ? <Image src={f.src} alt="" fill sizes="56px" className="pixelated object-contain" unoptimized /> : null
    },
    [frames],
  )
  const step = 'inline-flex size-11 shrink-0 items-center justify-center rounded-full disabled:opacity-40'

  return (
    <>
      <MediaStage
        frames={frames}
        index={index}
        playing={playing}
        onPlaying={setPlaying}
        onIndex={setIndex}
        predicted={predicted}
        revealPrediction={revealPrediction}
        mode={mode}
        myMarks={myMarks}
        draftMarks={draftMarks}
        community={community}
        compareFrames={compareFrames}
        saturated={saturated}
        path={longBaseline && path ? pathMarks : null}
        onOutside={noteOutside}
        onSwipe={(dir) => pickGroup(activeGroup + dir)}
        onMark={(p) => {
          onMark(p)
          if (index + 1 < frames.length) setIndex(index + 1)
        }}
      />

      {mode === 'mark' ? (
        <div className="flex h-12 items-center gap-1 px-[5px]" aria-live="polite">
          <button type="button" aria-label={t('prev')} disabled={index <= 0} onClick={() => setIndex(index - 1)} className={step}>
            <IconStepBack size={24} />
          </button>
          <span className="min-w-0 flex-1 truncate text-center text-note">{t('markProgress', { n: index + 1, total: frames.length, marked: markedCount })}</span>
          <button type="button" aria-label={t('next')} disabled={index >= frames.length - 1} onClick={() => setIndex(index + 1)} className={step}>
            <IconStepForward size={24} />
          </button>
          <button type="button" disabled={saving} onClick={onMarkDone} className="hit-44 mr-2 h-9 shrink-0 rounded-full bg-accent px-4 text-body font-semibold text-on-accent disabled:opacity-50">
            {saving ? t('markSaving') : t('markDone')}
          </button>
        </div>
      ) : (
        actions(!longBaseline && groups.length > 1 ? { count: groups.length, active: activeGroup, onPick: pickGroup } : null)
      )}

      {mode === 'compare' && mixedReleases && (
        <div className="px-3 pb-2">
          <QrWarning />
        </div>
      )}

      {mode === 'play' && frames.length > 1 && (
        <div className="px-3 pb-2">
          <PlayerBar dense playback={player} seconds={seconds} dates={dates} outside={!!(current && outside[current.src])} thumb={thumb} />
        </div>
      )}

      {longBaseline && <EraTimeline frames={frames} index={index} onPick={setIndex} path={path} onPath={setPath} />}
    </>
  )
}

export function PostViewer({ id }: { id: string }) {
  const celebrate = useCelebrate()
  const [gain, setGain] = useState<{ xp: Parameters<ReturnType<typeof useCelebrate>>[0]; badges: string[] } | null>(null)
  const locale = useLocale()
  const t = useTranslations('viewer')
  const tp = useTranslations('post')
  const tc = useTranslations('common')
  const fmt = useFmt()
  const params = useSearchParams()
  const { data, isLoading, isError } = usePost(id)
  const { data: objectPosts } = useObjectPosts(data?.object.id)
  const { data: profile } = useObject(data?.object.id ?? '')
  const { data: user } = useSession()
  const ask = useUi((s) => s.askLogin)
  const toast = useUi((s) => s.toast)
  const saved = useUi((s) => s.saved.includes(id))
  const toggleSaved = useUi((s) => s.toggleSaved)
  const share = useShare()
  const save = useSaveMarks(id)
  const learn = useLearn()
  const learnRef = useRef(learn.mutate)
  useEffect(() => {
    learnRef.current = learn.mutate
  }, [learn.mutate])

  const [sheet, setSheet] = useState<SheetKey>(params.get('colours') ? 'colours' : params.get('tags') ? 'tags' : null)
  const [filter, setFilter] = useState<FilterKey | 'slider'>('original')
  const [wave, setWave] = useState<number | null>(null)
  const [mode, setMode] = useState<StageMode>(params.get('mark') ? 'mark' : params.get('compare') ? 'compare' : 'play')
  const [draft, setDraft] = useState<Point[]>([])
  const [result, setResult] = useState<Point[] | null>(null)
  const [prediction, setPrediction] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const bandsSeen = useRef(new Set<string>())
  const frameRef = useRef<Frame | undefined>(undefined)

  const sequences = useMemo(() => (data ? buildSequences(data.post, objectPosts ?? []) : null), [data, objectPosts])
  const pool = useMemo(() => framePool(objectPosts ?? []), [objectPosts])
  const range = useMemo(() => {
    const cs = pool.map(centre).filter((c): c is number => c !== null)
    return cs.length ? { min: Math.floor(Math.min(...cs) * 100) / 100, max: Math.ceil(Math.max(...cs) * 100) / 100 } : { min: 0.75, max: 5 }
  }, [pool])

  const sliderFrame = useMemo(() => (filter === 'slider' && wave !== null ? nearestByWavelength(pool, wave) : null), [filter, wave, pool])
  const seq: Sequence | null = useMemo(
    () => (sequences ? (filter === 'slider' ? { key: 'slider', frames: sliderFrame ? [sliderFrame] : [], predicted: NO_PREDICTION } : sequences[filter]) : null),
    [sequences, filter, sliderFrame],
  )
  const frames = useMemo(() => seq?.frames ?? [], [seq])
  const pathMarks = useMemo(() => (data?.post.marks ?? []).map((m) => ({ x: m.x, y: m.y })), [data])

  const userId = user?.id
  const onBand = useCallback(
    (band: string) => {
      if (!userId || !/^D[1-6]$/.test(band) || bandsSeen.current.has(band)) return
      bandsSeen.current.add(band)
      learnRef.current({ event: 'band_seen', ref: band })
    },
    [userId],
  )

  const postType = data?.post.type
  const objectId = data?.object.id
  useEffect(() => {
    if (userId && objectId && postType === 'spectrum') learnRef.current({ event: 'spectrum_opened', ref: objectId })
  }, [userId, objectId, postType])

  if (isError) return <EmptyState title={t('notFound')} action={<Link href="/" className="text-link">{tc('goHome')}</Link>} />
  if (isLoading || !data || !sequences) {
    return (
      <main>
        <TopBar title={t('title')} />
        <div className="flex h-[54px] items-center gap-2 px-2">
          <Skeleton className="size-10 rounded-full" />
          <Skeleton className="h-3 w-32" />
        </div>
        <Skeleton className={cx('w-full rounded-none', STAGE_BOX)} />
      </main>
    )
  }

  const { post, object } = data
  const title = postTitle(post.title, locale)
  const isChart = post.type in CHART_KIND && !!post.chart
  const longBaseline = post.type === 'long_baseline' && filter === 'original'
  const blink = (objectPosts ?? []).find((p) => p.type === 'pass_blink')
  const pairSource = blink && blink.frames.length > 1 ? blink.frames : post.frames
  const compareFrames: [Frame, Frame] | null = pairSource.length > 1 ? [pairSource[0] as Frame, pairSource[pairSource.length - 1] as Frame] : null
  const mixedReleases = !!compareFrames && compareFrames[0].release !== compareFrames[1].release && compareFrames.every((f) => f.release.startsWith('qr'))
  const totalTags = data.tags.counts ? Object.values(data.tags.counts).reduce((a, b) => a + b, 0) : 0
  const markedCount = new Set([...draft, ...data.my_marks].map((m) => m.frame)).size
  const original = filter === 'original'

  const startMark = () => {
    if (!user) return ask('mark')
    setFilter('original')
    setWave(null)
    if (mode !== 'mark') setResult(null)
    setMode(mode === 'mark' ? 'play' : 'mark')
  }
  const shareIt = () => void share({ title, path: `/p/${post.id}` })

  const closeResult = () => {
    setResult(null)
    if (gain) celebrate(gain.xp, gain.badges)
    setGain(null)
  }

  const finishMarking = () => {
    if (!draft.length) return setMode('play')
    const marks = draft
    save.mutate(marks, {
      onSuccess: (r) => {
        setDraft([])
        setMode('play')
        setResult(marks)
        setGain({ xp: r.xp, badges: r.new_badges })
      },
      onError: () => toast({ kind: 'info', key: 'viewer.markFailed' }),
    })
  }

  const actions = (dots: Dots | null) => (
    <ActionRow
      tag={{ onClick: () => setSheet('tags') }}
      mark={{ onClick: startMark, active: mode === 'mark' }}
      colours={{ onClick: () => setSheet('colours'), active: !original }}
      save={{ onClick: () => toggleSaved(post.id) }}
      saved={saved}
      tagCount={data.tags.counts ? totalTags : null}
      dots={isChart ? null : dots}
    />
  )

  return (
    <main className="pb-6">
      <TopBar title={t('title')} />
      <PostHeader item={data} onMore={() => setSheet('more')} />

      {isChart ? (
        <>
          <div className={cx('w-full overflow-y-auto bg-bg px-3 py-2', STAGE_BOX)}>
            <KitChart kind={CHART_KIND[post.type as keyof typeof CHART_KIND]} url={post.chart as string} />
          </div>
          {actions(null)}
        </>
      ) : (
        <PostStage
          key={post.id}
          frames={frames}
          groupType={original ? post.type : 'timelapse'}
          filterKey={filter}
          predicted={seq?.predicted ?? NO_PREDICTION}
          mode={mode}
          longBaseline={longBaseline}
          bestBand={profile?.best_bands[0]}
          compareFrames={compareFrames}
          mixedReleases={mixedReleases}
          myMarks={original ? data.my_marks : []}
          draftMarks={original ? draft : []}
          community={original ? (data.community_marks?.frames ?? null) : null}
          revealPrediction={!!result}
          saturated={object.saturation === 'heavy'}
          pathMarks={pathMarks}
          frameRef={frameRef}
          markedCount={markedCount}
          saving={save.isPending}
          onMark={(p) => setDraft((d) => [...d.filter((x) => x.frame !== p.frame), p])}
          onMarkDone={finishMarking}
          onBand={onBand}
          actions={actions}
        />
      )}

      <div className="px-3">
        {!isChart && (seq?.predicted.size ?? 0) > 0 && (
          <button type="button" onClick={() => setPrediction(true)} className="hit-44 mb-1 inline-flex min-h-9 items-center gap-1.5 text-note text-text-secondary">
            <IconCrosshair size={16} className="shrink-0 text-crosshair" />
            {t('predictionRow')}
          </button>
        )}
        <p className="text-body">
          {data.tags.counts ? (
            <button type="button" className="font-semibold" onClick={() => setSheet('tags')}>
              {tp('taggedBy', { total: totalTags })}
            </button>
          ) : (
            <button type="button" className="text-text-secondary" onClick={() => setSheet('tags')}>
              {tp('tagPrompt')}
            </button>
          )}
          {data.community_marks && <span className="text-text-secondary">, {t('markedBy', { people: data.community_marks.people })}</span>}
        </p>
        <p className={expanded ? 'mt-1 text-body' : 'mt-1 line-clamp-2 text-body'}>
          <Link href={`/o/${object.id}`} className="font-semibold">
            {object.name}
          </Link>{' '}
          <span className="font-semibold">{title}.</span> {postCaption(post.caption, locale)}
        </p>
        {!expanded && post.caption.length > 70 && (
          <button type="button" className="text-body text-text-muted" onClick={() => setExpanded(true)}>
            {tp('more')}
          </button>
        )}
        <p className="mt-1 text-meta text-text-muted">
          <time dateTime={post.date_range[1]}>{fmt.date(post.date_range[1] ?? post.date_range[0] ?? '')}</time>, {tp(`types.${post.type}`)}
        </p>
      </div>

      <MoreSheet
        open={sheet === 'more'}
        onClose={() => setSheet(null)}
        onAbout={() => setSheet('about')}
        onNotes={() => setSheet('notes')}
        playback={!isChart}
        onCompare={
          !isChart && compareFrames
            ? () => {
                setSheet(null)
                setMode(mode === 'compare' ? 'play' : 'compare')
              }
            : null
        }
        onShare={() => {
          setSheet(null)
          shareIt()
        }}
        onCopy={() => {
          setSheet(null)
          void navigator.clipboard
            ?.writeText(new URL(`/p/${post.id}`, window.location.origin).toString())
            .then(() => toast({ kind: 'info', key: 'common.linkCopied' }))
            .catch(() => shareIt())
        }}
        labHref={`/lab/${object.id}`}
      />
      <AboutSheet open={sheet === 'about'} onClose={() => setSheet(null)} data={data} profile={profile} frame={isChart ? undefined : (frameRef.current ?? frames[0])} wise={hasWise(post.frames)} />
      <TagSheet open={sheet === 'tags'} onClose={() => setSheet(null)} postId={post.id} tags={data.tags} />
      <NotesSheet open={sheet === 'notes'} onClose={() => setSheet(null)} postId={post.id} objectId={object.id} title={title} />
      <ColoursSheet
        open={sheet === 'colours'}
        onClose={() => setSheet(null)}
        sequences={sequences}
        active={filter}
        onPick={(k) => {
          setFilter(k)
          setWave(null)
          setMode('play')
        }}
        wave={wave ?? (frameRef.current && centre(frameRef.current)) ?? range.min}
        range={range}
        onWave={(v) => {
          setWave(v)
          setFilter('slider')
          setMode('play')
        }}
        sliderFrame={sliderFrame}
      />
      <PredictionHelp
        open={prediction}
        onClose={() => setPrediction(false)}
        onMark={() => {
          setPrediction(false)
          startMark()
        }}
      />
      <MarkResult marks={result && !prediction ? result : null} predicted={seq?.predicted ?? NO_PREDICTION} onClose={closeResult} />
    </main>
  )
}
