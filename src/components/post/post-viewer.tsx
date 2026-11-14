'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useRef, useState } from 'react'
import { KitChart } from '@/components/charts/charts'
import { PostHeader } from '@/components/feed/post-card'
import { ActionRow } from '@/components/post/action-row'
import { MediaStage, usePlayer, type Point, type StageMode } from '@/components/post/media-stage'
import { AboutSheet, ColoursSheet, MoreSheet, NotesSheet, TagSheet } from '@/components/post/post-sheets'
import { buildSequences, centre, framePool, nearestByWavelength, type FilterKey, type Sequence } from '@/components/post/sequences'
import { EmptyState, Skeleton, TopBar } from '@/components/ui/primitives'
import type { Frame } from '@/lib/api/client'
import { useLearn, useObject, useObjectPosts, usePost, useSaveMarks, useSession } from '@/lib/api/hooks'
import { useShare } from '@/lib/share'
import { useUi } from '@/lib/state/ui'
import { useFmt } from '@/lib/use-fmt'

const CHART_KIND = { spectrum: 'spectrum', lightcurve: 'lightcurve', motion: 'motion' } as const
const PASS_GAP_DAYS = 20

type SheetKey = 'more' | 'about' | 'tags' | 'colours' | 'notes' | null

function groupsOf(type: string, frames: Frame[]): number[] {
  if (frames.length < 2) return [0]
  if (type !== 'timelapse') return frames.map((_, i) => i)
  const starts = [0]
  for (let i = 1; i < frames.length; i++) if ((frames[i]?.mjd ?? 0) - (frames[i - 1]?.mjd ?? 0) > PASS_GAP_DAYS) starts.push(i)
  return starts
}

export function PostViewer({ id }: { id: string }) {
  const t = useTranslations('viewer')
  const tp = useTranslations('post')
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
  const [expanded, setExpanded] = useState(false)
  const bandsSeen = useRef(new Set<string>())

  const sequences = useMemo(() => (data ? buildSequences(data.post, objectPosts ?? []) : null), [data, objectPosts])
  const pool = useMemo(() => framePool(objectPosts ?? []), [objectPosts])
  const range = useMemo(() => {
    const cs = pool.map(centre).filter((c): c is number => c !== null)
    return cs.length ? { min: Math.floor(Math.min(...cs) * 100) / 100, max: Math.ceil(Math.max(...cs) * 100) / 100 } : { min: 0.75, max: 5 }
  }, [pool])

  const sliderFrame = useMemo(() => (filter === 'slider' && wave !== null ? nearestByWavelength(pool, wave) : null), [filter, wave, pool])
  const seq: Sequence | null = useMemo(
    () => (sequences ? (filter === 'slider' ? { key: 'slider', frames: sliderFrame ? [sliderFrame] : [], predicted: new Map() } : sequences[filter]) : null),
    [sequences, filter, sliderFrame],
  )
  const frames = useMemo(() => seq?.frames ?? [], [seq])
  const player = usePlayer(frames.length, mode === 'play')
  const current = frames[player.index]
  const groups = useMemo(() => groupsOf(filter === 'original' ? (data?.post.type ?? '') : 'timelapse', frames), [filter, data?.post.type, frames])
  const activeGroup = Math.max(0, groups.findLastIndex((g) => g <= player.index))
  const currentWave = (current && centre(current)) ?? range.min

  const startedAt = useRef<string | null>(null)
  const bestBand = profile?.best_bands[0]
  const setIndex = player.setIndex
  useEffect(() => {
    if (!bestBand || !data || startedAt.current === data.post.id || filter !== 'original') return
    startedAt.current = data.post.id
    const first = frames.findIndex((f) => f.band === bestBand)
    if (first > 0) setIndex(first)
  }, [bestBand, data, frames, filter, setIndex])

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
        <div className="flex h-[54px] items-center gap-2 px-2">
          <Skeleton className="size-10 rounded-full" />
          <Skeleton className="h-3 w-32" />
        </div>
        <Skeleton className="aspect-[4/5] w-full rounded-none" />
      </main>
    )
  }

  const { post, object } = data
  const isChart = post.type in CHART_KIND && !!post.chart
  const blink = (objectPosts ?? []).find((p) => p.type === 'pass_blink')
  const pairSource = blink && blink.frames.length > 1 ? blink.frames : post.frames
  const compareFrames: [Frame, Frame] | null = pairSource.length > 1 ? [pairSource[0] as Frame, pairSource[pairSource.length - 1] as Frame] : null
  const totalTags = data.tags.counts ? Object.values(data.tags.counts).reduce((a, b) => a + b, 0) : 0
  const markedCount = new Set([...draft, ...data.my_marks].map((m) => m.frame)).size

  const startMark = () => {
    if (!user) return ask('mark')
    setFilter('original')
    setWave(null)
    setMode(mode === 'mark' ? 'play' : 'mark')
  }
  const pickGroup = (i: number) => player.setIndex(groups[Math.max(0, Math.min(groups.length - 1, i))] ?? 0)
  const shareIt = () => void share({ title: post.title, path: `/p/${post.id}` })

  const markBar = (
    <div className="flex items-center gap-1.5 rounded-full bg-media-scrim py-1 pl-3 pr-1 text-meta text-on-media backdrop-blur-sm" aria-live="polite">
      <span className="min-w-0 flex-1 truncate">{t('markProgress', { n: markedCount, total: post.frames.length })}</span>
      <button
        type="button"
        disabled={!draft.length || save.isPending}
        onClick={() =>
          save.mutate(draft, {
            onSuccess: () => {
              setDraft([])
              toast({ kind: 'info', key: 'viewer.markSaved' })
            },
          })
        }
        className="h-8 rounded-full bg-accent px-3 font-semibold text-on-accent disabled:opacity-50"
      >
        {save.isPending ? t('markSaving') : t('markSave')}
      </button>
      <button type="button" onClick={() => setMode('play')} className="h-8 rounded-full px-3 font-semibold">
        {t('markDone')}
      </button>
    </div>
  )

  return (
    <main className="pb-6">
      <TopBar title={t('title')} />
      <PostHeader item={data} onMore={() => setSheet('more')} />

      {isChart ? (
        <div className="aspect-[4/5] w-full overflow-y-auto bg-bg px-3 py-2">
          <KitChart kind={CHART_KIND[post.type as keyof typeof CHART_KIND]} url={post.chart as string} />
        </div>
      ) : (
        <MediaStage
          frames={frames}
          player={player}
          predicted={seq?.predicted ?? new Map()}
          mode={mode}
          myMarks={filter === 'original' ? data.my_marks : []}
          draftMarks={filter === 'original' ? draft : []}
          community={filter === 'original' ? (data.community_marks?.frames ?? null) : null}
          compareFrames={compareFrames}
          markBar={markBar}
          saturated={object.saturation === 'heavy'}
          onSwipe={(dir) => pickGroup(activeGroup + dir)}
          onMark={(p) => {
            setDraft((d) => [...d.filter((x) => x.frame !== p.frame), p])
            if (player.index + 1 < frames.length) player.setIndex(player.index + 1)
          }}
        />
      )}

      <ActionRow
        tag={{ onClick: () => setSheet('tags') }}
        mark={{ onClick: startMark, active: mode === 'mark' }}
        colours={{ onClick: () => setSheet('colours'), active: filter !== 'original' }}
        save={{ onClick: () => toggleSaved(post.id) }}
        saved={saved}
        tagCount={data.tags.counts ? totalTags : null}
        dots={!isChart && groups.length > 1 ? { count: groups.length, active: activeGroup, onPick: pickGroup } : null}
      />

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
          {data.community_marks && <span className="text-text-secondary"> · {t('markedBy', { people: data.community_marks.people })}</span>}
        </p>
        <p className={expanded ? 'mt-1 text-body' : 'mt-1 line-clamp-2 text-body'}>
          <Link href={`/o/${object.id}`} className="font-semibold">
            {object.handle}
          </Link>{' '}
          <span className="font-semibold">{post.title}.</span> {post.caption}
        </p>
        {!expanded && post.caption.length > 70 && (
          <button type="button" className="text-body text-text-muted" onClick={() => setExpanded(true)}>
            {tp('more')}
          </button>
        )}
        <p className="mt-1 text-meta text-text-muted">
          <time dateTime={post.date_range[1]}>{fmt.date(post.date_range[1] ?? post.date_range[0] ?? '')}</time> · {tp(`types.${post.type}`)}
          {post.frames[0] && ` · ${[...new Set(post.frames.flatMap((f) => f.release.split('+')).map((r) => r.trim().toUpperCase()))].join(' + ')}`}
        </p>
      </div>

      <MoreSheet
        open={sheet === 'more'}
        onClose={() => setSheet(null)}
        onAbout={() => setSheet('about')}
        onNotes={() => setSheet('notes')}
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
      <AboutSheet open={sheet === 'about'} onClose={() => setSheet(null)} data={data} profile={profile} frame={current} />
      <TagSheet open={sheet === 'tags'} onClose={() => setSheet(null)} postId={post.id} tags={data.tags} />
      <NotesSheet open={sheet === 'notes'} onClose={() => setSheet(null)} postId={post.id} objectId={object.id} title={post.title} />
      <ColoursSheet
        open={sheet === 'colours'}
        onClose={() => setSheet(null)}
        sequences={sequences}
        active={filter}
        onPick={(k) => {
          setFilter(k)
          setWave(null)
          setMode('play')
          player.setIndex(0)
        }}
        wave={wave ?? currentWave}
        range={range}
        onWave={(v) => {
          setWave(v)
          setFilter('slider')
          setMode('play')
          player.setIndex(0)
        }}
        sliderFrame={sliderFrame}
      />
    </main>
  )
}
