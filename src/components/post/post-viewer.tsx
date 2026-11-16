'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react'
import { KitChart, QrWarning } from '@/components/charts/charts'
import { mixesBatches } from '@/components/charts/chart-math'
import { PostHeader } from '@/components/feed/post-card'
import { IconClose, IconUndo } from '@/components/icons'
import { ModeRow, PlaybackBar, Track } from '@/components/player/sequence'
import { usePlaybackKeys } from '@/components/player/use-playback'
import { ActionRow } from '@/components/post/action-row'
import { PredictionHelp } from '@/components/post/marking-help'
import { markPlan, passStarts } from '@/components/post/mark-plan'
import { MediaStage, STAGE_BOX, usePlayer, type Point, type StageMode, type Trail } from '@/components/post/media-stage'
import { AboutSheet, ColoursSheet, MoreSheet, NotesSheet, TagSheet } from '@/components/post/post-sheets'
import { buildSequences, centre, framePool, nearestByWavelength, type FilterKey, type Sequence } from '@/components/post/sequences'
import { Button, EmptyState, IconButton, Skeleton, TopBar } from '@/components/ui/primitives'
import type { Frame } from '@/lib/api/client'
import { useCelebrate, useLearn, useObject, useObjectPosts, usePost, useSaveMarks, useSession } from '@/lib/api/hooks'
import { cx } from '@/lib/format'
import { isTyping, plainKey } from '@/lib/keys'
import { eraLayout, hasWise, LONG_BASELINE_FPS } from '@/lib/long-baseline'
import { passLayout, type TrackLayout } from '@/lib/passes'
import { modalCount } from '@/lib/modal-history'
import { postCaption, postTitle } from '@/lib/post-text'
import { useShare } from '@/lib/share'
import { useUi } from '@/lib/state/ui'
import { useFmt } from '@/lib/use-fmt'

const CHART_KIND = { spectrum: 'spectrum', lightcurve: 'lightcurve', motion: 'motion' } as const
const FLASH_MS = 300
const NO_PREDICTION = new Map<number, { x: number; y: number }>()

type SheetKey = 'more' | 'about' | 'tags' | 'colours' | 'notes' | null
type Look = 'seq' | 'path' | 'blink'
const DAY_MS = 86400000

function trackOf(frames: Frame[], longBaseline: boolean): TrackLayout {
  if (!longBaseline) return passLayout(frames.map((f) => Date.parse(f.t) / DAY_MS))
  const { positions, segments } = eraLayout(frames)
  return { positions, segments: segments.map((s) => ({ from: s.from, to: s.to, kind: s.kind === 'gap' ? 'faint' : s.kind === 'spherex' ? 'accent' : 'solid' })) }
}

function groupsOf(type: string, frames: Frame[]): number[] {
  if (frames.length < 2) return [0]
  if (type !== 'timelapse') return frames.map((_, i) => i)
  return passStarts(frames)
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
  community,
  saturated,
  pathMarks,
  frameRef,
  markFrame,
  flash,
  banner,
  markLabel,
  trail,
  markBar,
  finalPanel,
  onMark,
  onBand,
  onInfo,
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
  community: { frame: number; x: number; y: number }[] | null
  saturated: boolean
  pathMarks: { x: number; y: number }[]
  frameRef: MutableRefObject<Frame | undefined>
  markFrame: number | null
  flash: Point | null
  banner: ReactNode
  markLabel: string
  trail: Trail | null
  markBar: ReactNode
  finalPanel: ReactNode
  onMark: (p: Point) => void
  onBand: (band: string) => void
  onInfo?: () => void
  actions: ReactNode
}) {
  const watching = mode === 'play' || mode === 'path'
  const player = usePlayer(frames.length, watching, longBaseline ? LONG_BASELINE_FPS : undefined, longBaseline ? LONG_BASELINE_FPS : undefined)
  const { index, setIndex, setPlaying, playing, blinking, startBlink, stopBlink } = player
  usePlaybackKeys(player, watching)
  const t = useTranslations('seq')
  const tp = useTranslations('player')
  const fmt = useFmt()
  const [look, setLook] = useState<Look>('seq')
  const path = look === 'path'
  const [outside, setOutside] = useState<Record<string, boolean>>({})
  const current = frames[index]
  const groups = useMemo(() => groupsOf(groupType, frames), [groupType, frames])
  const activeGroup = Math.max(0, groups.findLastIndex((g) => g <= index))
  const layout = useMemo(() => trackOf(frames, longBaseline), [frames, longBaseline])

  useEffect(() => {
    if (look === 'blink' && !blinking) setLook('seq')
  }, [look, blinking])

  const pickLook = (next: Look) => {
    if (next === 'blink') startBlink()
    else stopBlink()
    setLook(next)
  }
  const looks: { key: Look; label: string }[] = [
    { key: 'seq', label: t('sequence') },
    ...(longBaseline ? [{ key: 'path' as const, label: t('path') }] : []),
    ...(frames.length > 1 ? [{ key: 'blink' as const, label: t('blink') }] : []),
  ]

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
    if (!watching) setPlaying(false)
    if (mode === 'mark' && markFrame !== null && index !== markFrame) setIndex(markFrame)
  }, [mode, watching, markFrame, index, setPlaying, setIndex])

  const band = current?.band
  useEffect(() => {
    if (band) onBand(band)
  }, [band, onBand])

  const pickGroup = useCallback((i: number) => setIndex(groups[Math.max(0, Math.min(groups.length - 1, i))] ?? 0), [groups, setIndex])
  const noteOutside = useCallback((src: string, out: boolean) => setOutside((o) => (o[src] === out ? o : { ...o, [src]: out })), [])
  return (
    <>
      <MediaStage
        frames={frames}
        index={index}
        playing={playing}
        onPlaying={setPlaying}
        onIndex={setIndex}
        predicted={predicted}
        mode={mode}
        myMarks={myMarks}
        flash={flash}
        banner={banner}
        markLabel={markLabel}
        trail={trail}
        community={community}
        compareFrames={compareFrames}
        saturated={saturated}
        path={longBaseline && path ? pathMarks : null}
        onOutside={noteOutside}
        onSwipe={(dir) => pickGroup(activeGroup + dir)}
        onMark={onMark}
      />

      {mode === 'mark' ? markBar : mode === 'path' ? finalPanel : null}

      {watching && frames.length > 1 && (
        <div className="pt-1.5" data-testid="post-player">
          <PlaybackBar
            playing={player.running}
            onToggle={() => {
              stopBlink()
              setPlaying(!playing)
            }}
            onStep={(d) => {
              stopBlink()
              setPlaying(false)
              setIndex((i) => i + d)
            }}
          >
            <Track
              layout={layout}
              current={index}
              label={t('track')}
              valueText={t('trackValue', { n: index + 1, total: frames.length, date: current ? fmt.shortDate(current.t) : '' })}
              onPick={(i) => {
                stopBlink()
                setPlaying(false)
                setIndex(i)
              }}
            />
          </PlaybackBar>
          {mode === 'play' && <ModeRow items={looks} value={look} onChange={pickLook} onInfo={onInfo} />}
          {current && outside[current.src] && <p className="px-4 pt-1.5 text-meta text-text-secondary">{tp('outside')}</p>}
        </div>
      )}

      {mode === 'compare' && mixedReleases && (
        <div className="px-3 pb-2">
          <QrWarning />
        </div>
      )}

      {mode !== 'mark' && mode !== 'path' && <div className="pt-1">{actions}</div>}
    </>
  )
}

function trailOf(marks: Point[], predicted: Map<number, { x: number; y: number }>): Trail {
  const mine = [...marks].sort((a, b) => a.frame - b.frame)
  return { mine, predicted: mine.flatMap((m) => predicted.get(m.frame) ?? []) }
}

function MarkKeys({ onUndo, onStop }: { onUndo: () => void; onStop: () => void }) {
  const latest = useRef({ onUndo, onStop })
  useEffect(() => {
    latest.current = { onUndo, onStop }
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || modalCount()) return
      const undoKey = (e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey) && !e.shiftKey
      if (undoKey || (e.key === 'Backspace' && plainKey(e))) {
        e.preventDefault()
        latest.current.onUndo()
      } else if (e.key === 'Escape' && plainKey(e)) latest.current.onStop()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
  return null
}

function MarkBar({ saving, canUndo, onUndo, onStop }: { saving: boolean; canUndo: boolean; onUndo: () => void; onStop: () => void }) {
  const t = useTranslations('viewer')
  return (
    <div className="flex h-12 items-center justify-between gap-2 px-2" data-testid="mark-bar">
      <button type="button" onClick={onUndo} disabled={saving || !canUndo} className="hit-44 inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-note font-medium text-text-secondary disabled:opacity-40">
        <IconUndo size={18} />
        {t('markUndo')}
      </button>
      {saving && (
        <span role="status" className="text-note text-text-secondary">
          {t('markSaving')}
        </span>
      )}
      <IconButton label={t('markClose')} onClick={onStop}>
        <IconClose size={24} />
      </IconButton>
    </div>
  )
}

function PathPanel({ predicted, people, markAll, onMarkAll, onDone }: { predicted: boolean; people: number; markAll: number | null; onMarkAll: () => void; onDone: () => void }) {
  const t = useTranslations('viewer')
  return (
    <div className="px-3 pb-1 pt-2" data-testid="mark-final">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-ui font-semibold">{t('pathTitle')}</h2>
          <p className="text-note leading-snug text-text-secondary">
            {t('pathMine')}
            {predicted && ` ${t('pathPredicted')}`}
          </p>
          {people > 0 && <p className="text-note text-text-secondary">{t('markPeople', { people })}</p>}
        </div>
        <Button variant="primary" className="h-9 shrink-0 px-4" onClick={onDone}>
          {t('markDone')}
        </Button>
      </div>
      {markAll !== null && (
        <button type="button" onClick={onMarkAll} className="hit-44 mt-1 inline-flex min-h-8 items-center text-note text-link">
          {t('markAll', { total: markAll })}
        </button>
      )}
    </div>
  )
}

function MarkBanner({ first, name, bright, n, total }: { first: boolean; name: string; bright: boolean; n: number; total: number }) {
  const t = useTranslations('viewer')
  if (first) {
    return (
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 bg-media-scrim px-4 pb-3 pt-2.5 text-center text-on-media" data-testid="mark-banner">
        <p className="text-title-md font-bold leading-tight [text-wrap:balance]">{t('markTap', { name: name.split(' (')[0] })}</p>
        <p className="mt-0.5 text-note leading-snug text-on-media-muted">{bright ? t('markHintBright') : t('markMoves')}</p>
      </div>
    )
  }
  return (
    <div className="pointer-events-none absolute inset-x-0 top-2 z-20 flex justify-center" aria-live="polite">
      <span className="rounded-full bg-media-scrim px-2.5 py-0.5 text-meta font-medium text-on-media" data-testid="mark-count">
        {t('markCount', { n: Math.min(n, total), total })}
      </span>
    </div>
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
  const [plan, setPlan] = useState<number[] | null>(null)
  const [step, setStep] = useState(0)
  const [flash, setFlash] = useState<Point | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
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
  const originalFrames = sequences?.original.frames
  const markFrames = useMemo(() => plan ?? markPlan(originalFrames ?? []), [plan, originalFrames])
  const marking = mode === 'mark'

  useEffect(() => () => clearTimeout(flashTimer.current), [])

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
  const mixedReleases = !!compareFrames && mixesBatches(compareFrames.map((f) => f.release))
  const totalTags = data.tags.counts ? Object.values(data.tags.counts).reduce((a, b) => a + b, 0) : 0
  const original = filter === 'original'
  const predicted = seq?.predicted ?? NO_PREDICTION

  const stopMark = () => {
    clearTimeout(flashTimer.current)
    setFlash(null)
    setDraft([])
    setMode('play')
  }

  const startMark = (all = false) => {
    if (!user) return ask('mark')
    if (marking && !all) return stopMark()
    const mine = new Set(data.my_marks.map((m) => m.frame))
    clearTimeout(flashTimer.current)
    setFilter('original')
    setWave(null)
    setDraft([])
    setFlash(null)
    setStep(0)
    setPlan(all ? sequences.original.frames.flatMap((_, i) => (mine.has(i) ? [] : [i])) : null)
    setMode('mark')
  }
  const shareIt = () => void share({ title, path: `/p/${post.id}` })

  const closePath = () => {
    setMode('play')
    if (gain) celebrate(gain.xp, gain.badges)
    setGain(null)
  }

  const finishMarking = (marks: Point[]) => {
    if (!user) return ask('mark')
    save.mutate(marks, {
      onSuccess: (r) => {
        setDraft([])
        setMode('path')
        setGain({ xp: r.xp, badges: r.new_badges })
      },
      onError: () => toast({ kind: 'info', key: 'viewer.markFailed' }),
    })
  }

  const pick = (p: Point) => {
    const frame = markFrames[step]
    if (flash || save.isPending || frame === undefined) return
    const mark = { frame, x: Math.round(p.x * 1e4) / 1e4, y: Math.round(p.y * 1e4) / 1e4 }
    const next = [...draft.filter((m) => m.frame !== frame), mark]
    setDraft(next)
    setFlash(mark)
    flashTimer.current = setTimeout(() => {
      setFlash(null)
      if (step + 1 < markFrames.length) setStep(step + 1)
      else finishMarking(next)
    }, FLASH_MS)
  }

  const undo = () => {
    if (save.isPending) return
    if (flash) {
      clearTimeout(flashTimer.current)
      setDraft((d) => d.filter((m) => m.frame !== flash.frame))
      setFlash(null)
      return
    }
    const back = step >= markFrames.length ? markFrames.length - 1 : step - 1
    const frame = markFrames[back]
    if (back < 0 || frame === undefined) return
    setDraft((d) => d.filter((m) => m.frame !== frame))
    setStep(back)
  }

  const actions = (
    <ActionRow
      tag={{ onClick: () => setSheet('tags') }}
      mark={{ onClick: () => startMark(), active: marking }}
      colours={{ onClick: () => setSheet('colours'), active: !original }}
      save={{ onClick: () => toggleSaved(post.id) }}
      saved={saved}
      tagCount={data.tags.counts ? totalTags : null}
    />
  )

  return (
    <main className="pb-6">
      <TopBar title={t('title')} />
      {!marking && <PostHeader item={data} onMore={() => setSheet('more')} />}

      {isChart ? (
        <>
          <div className={cx('w-full overflow-y-auto bg-bg px-3 py-2', STAGE_BOX)}>
            <KitChart kind={CHART_KIND[post.type as keyof typeof CHART_KIND]} url={post.chart as string} />
          </div>
          {actions}
        </>
      ) : (
        <PostStage
          key={post.id}
          frames={frames}
          groupType={original ? post.type : 'timelapse'}
          filterKey={filter}
          predicted={predicted}
          mode={mode}
          longBaseline={longBaseline}
          bestBand={profile?.best_bands[0]}
          compareFrames={compareFrames}
          mixedReleases={mixedReleases}
          myMarks={original ? data.my_marks : []}
          community={original ? (data.community_marks?.frames ?? null) : null}
          saturated={object.saturation === 'heavy'}
          pathMarks={pathMarks}
          frameRef={frameRef}
          markFrame={marking ? (markFrames[step] ?? null) : null}
          flash={flash}
          banner={<MarkBanner first={step === 0} name={object.name} bright={object.saturation === 'heavy'} n={step + 1} total={markFrames.length} />}
          markLabel={t('markPad', { name: object.name })}
          trail={mode === 'path' ? trailOf(data.my_marks, predicted) : null}
          markBar={<MarkBar saving={save.isPending} canUndo={step > 0 || !!flash} onUndo={undo} onStop={stopMark} />}
          finalPanel={
            <PathPanel
              predicted={predicted.size > 0}
              people={data.community_marks?.people ?? 0}
              markAll={data.my_marks.length < post.frames.length ? post.frames.length : null}
              onMarkAll={() => startMark(true)}
              onDone={closePath}
            />
          }
          onMark={pick}
          onBand={onBand}
          onInfo={(seq?.predicted.size ?? 0) > 0 ? () => setPrediction(true) : undefined}
          actions={actions}
        />
      )}

      {(mode === 'play' || mode === 'compare') && (
      <div className="px-3">
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
      )}

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
      {marking && <MarkKeys onUndo={undo} onStop={stopMark} />}
      <PredictionHelp
        open={prediction}
        onClose={() => setPrediction(false)}
        onMark={() => {
          setPrediction(false)
          startMark()
        }}
      />
    </main>
  )
}
