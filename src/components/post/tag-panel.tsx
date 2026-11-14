'use client'

import { useTranslations } from 'next-intl'
import type { TagSummary } from '@/lib/api/client'
import { useSession, useSetTag, type TagKey } from '@/lib/api/hooks'
import { cx } from '@/lib/format'
import { useUi } from '@/lib/state/ui'

export const TAGS: TagKey[] = ['asteroid', 'artifact', 'brightness', 'unsure']

const TAG_EMOJI: Record<TagKey, string> = { asteroid: '☄️', artifact: '🧩', brightness: '🔆', unsure: '🤔' }

export function TagPanel({ postId, tags, compact = false }: { postId: string; tags: TagSummary; compact?: boolean }) {
  const t = useTranslations('tags')
  const { data: user } = useSession()
  const ask = useUi((s) => s.askLogin)
  const setTag = useSetTag(postId)
  const total = tags.counts ? Object.values(tags.counts).reduce((a, b) => a + b, 0) : 0
  return (
    <div>
      <div className={cx('flex flex-wrap gap-2', compact && 'gap-1.5')}>
        {TAGS.map((tag) => {
          const mine = tags.mine.includes(tag)
          const count = tags.counts?.[tag] ?? 0
          const pct = total ? Math.round((count / total) * 100) : 0
          return (
            <button
              key={tag}
              type="button"
              aria-pressed={mine}
              disabled={setTag.isPending}
              onClick={() => (user ? setTag.mutate({ tag, on: !mine }) : ask('tag'))}
              className={cx(
                'relative inline-flex min-h-10 items-center gap-1.5 overflow-hidden rounded-full border-[0.5px] px-3 text-body font-medium',
                mine ? 'border-accent bg-accent/15 text-text' : 'border-divider bg-surface text-text',
              )}
            >
              {tags.counts && <span aria-hidden="true" className="absolute inset-y-0 left-0 bg-accent/15" style={{ width: `${pct}%` }} />}
              <span aria-hidden="true" className="relative">
                {TAG_EMOJI[tag]}
              </span>
              <span className="relative">{t(`items.${tag}`)}</span>
              {tags.counts && <span className="relative text-meta text-text-secondary">{count}</span>}
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-meta text-text-secondary">{tags.counts ? t('consensus', { total }) : t('hidden')}</p>
    </div>
  )
}
