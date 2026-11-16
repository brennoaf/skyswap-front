'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { SpotSheet } from '@/components/feed/spot-sheet'
import { IconAddDot, IconMoves } from '@/components/icons'
import { ObjectAvatar, Skeleton } from '@/components/ui/primitives'
import { useStories } from '@/lib/api/hooks'
import { FINDS_STORY, storyFresh, useUi } from '@/lib/state/ui'

function SpotBubble({ onClick }: { onClick: () => void }) {
  const t = useTranslations('stories')
  return (
    <li className="flex w-[91px] shrink-0 flex-col items-center gap-1">
      <button type="button" onClick={onClick} className="relative size-[91px] rounded-full" aria-label={t('spotLabel')}>
        <span className="absolute inset-0 rounded-full border-[3.5px] border-ring-seen" aria-hidden="true" />
        <span className="absolute inset-[6.86%] overflow-hidden rounded-full" aria-hidden="true">
          <svg viewBox="0 0 80 80" className="size-full">
            <defs>
              <radialGradient id="spot-sky" cx="40%" cy="35%" r="75%">
                <stop offset="0%" stopColor="var(--color-spot-sky-top)" />
                <stop offset="100%" stopColor="var(--color-spot-sky-bottom)" />
              </radialGradient>
            </defs>
            <rect width="80" height="80" fill="url(#spot-sky)" />
            {[[14, 20, 1.2], [60, 14, 0.9], [66, 52, 1.4], [22, 62, 1], [48, 66, 0.8], [34, 30, 0.7]].map(([x, y, r]) => (
              <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="var(--color-spot-star)" opacity="0.85" />
            ))}
            <g stroke="var(--color-spot-reticle)" strokeWidth="2.2" strokeLinecap="round" fill="none">
              <circle cx="40" cy="40" r="11" />
              <path d="M40 22V29M40 51V58M22 40H29M51 40H58" />
            </g>
          </svg>
        </span>
        <IconAddDot className="absolute bottom-[8.79%] right-[8.79%]" size={20} />
      </button>
      <span className="w-full truncate text-center text-story text-text-secondary">{t('spot')}</span>
    </li>
  )
}

export function StoriesRow() {
  const t = useTranslations('stories')
  const { data, isLoading } = useStories()
  const seen = useUi((s) => s.storySeen)
  const seenFinds = useUi((s) => s.seenFinds)
  const open = useUi((s) => s.openStory)
  const [spot, setSpot] = useState(false)
  return (
    <section aria-label={t('title')}>
      <ul className="no-scrollbar flex gap-[14px] overflow-x-auto px-[7px] pb-2">
        <SpotBubble onClick={() => setSpot(true)} />
        {isLoading &&
          Array.from({ length: 5 }).map((_, i) => (
            <li key={i} className="flex w-[91px] shrink-0 flex-col items-center gap-1">
              <Skeleton className="size-[91px] rounded-full" />
              <Skeleton className="h-3 w-16" />
            </li>
          ))}
        {data && data.finds.some((id) => !seenFinds.includes(id)) && (
          <li className="flex w-[91px] shrink-0 flex-col items-center gap-1">
            <button type="button" onClick={() => open(FINDS_STORY)} aria-label={t('openFinds')} className="story-ring-finds relative grid size-[91px] place-items-center rounded-full p-[3.5px]">
              <span className="grid size-full place-items-center rounded-full border-4 border-bg bg-media-bg text-accent">
                <IconMoves size={36} />
              </span>
            </button>
            <span className="w-full truncate text-center text-story">{t('find.name')}</span>
          </li>
        )}
        {data &&
          [...data.stories]
            .map((s) => ({ s, fresh: storyFresh(seen, s.object.id, s.object.last_seen) }))
            .sort((a, b) => Number(b.fresh) - Number(a.fresh))
            .map(({ s, fresh }) => (
              <li key={s.object.id} className="flex w-[91px] shrink-0 flex-col items-center gap-1">
                <button type="button" onClick={() => open(s.object.id)} aria-label={t('open', { name: s.object.name })} className="relative rounded-full">
                  <ObjectAvatar src={s.object.avatar} alt="" size={91} ring={fresh ? 'new' : 'seen'} />
                </button>
                <span className={fresh ? 'w-full truncate text-center text-story' : 'w-full truncate text-center text-story text-text-secondary'}>{s.object.name}</span>
              </li>
            ))}
      </ul>
      <SpotSheet open={spot} onClose={() => setSpot(false)} />
    </section>
  )
}
