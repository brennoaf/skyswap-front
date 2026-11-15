'use client'

import { useTranslations } from 'next-intl'
import { useState, type FormEvent } from 'react'
import { IconMore } from '@/components/icons'
import { Chip, Sheet, SheetRow } from '@/components/ui/primitives'
import { UserAvatar } from '@/components/ui/user-avatar'
import type { CommentNode } from '@/lib/api/client'
import { useFinders, useSession, useTalk, useThread, type ThreadSort, type Vote } from '@/lib/api/hooks'
import { cx, relativeTime } from '@/lib/format'
import { useUi } from '@/lib/state/ui'

const MAX_CHARS = 2000

function useGate() {
  const { data: user } = useSession()
  const ask = useUi((s) => s.askLogin)
  return { user, gate: (run: () => void) => (user ? run() : ask('community')) }
}

export function useAgo() {
  const t = useTranslations('common')
  return (ms: number) => {
    const r = relativeTime(ms)
    return r.unit === 'now' ? t('time.now') : t(`time.${r.unit}`, { value: r.value })
  }
}

function Arrow({ up, on }: { up: boolean; on: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" className={up ? '' : 'rotate-180'}>
      <path d="M10 3.5 3.8 10.6h3.9v5.9h4.6v-5.9h3.9z" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}

export function Votes({ votes, mine, onVote, size = 'md', label }: { votes: number; mine: number; onVote: (v: Vote) => void; size?: 'sm' | 'md'; label: string }) {
  const t = useTranslations('community.talk')
  const tone = mine > 0 ? 'text-accent' : mine < 0 ? 'text-warning' : 'text-text-secondary'
  return (
    <span role="group" aria-label={label} className={cx('inline-flex items-center rounded-full', size === 'md' ? 'h-9 bg-surface' : 'h-8', tone)} data-testid="votes">
      <button type="button" aria-label={t('up')} aria-pressed={mine > 0} onClick={() => onVote(mine > 0 ? 0 : 1)} className="hit-44 inline-flex h-full items-center justify-center rounded-full px-2 active:bg-surface-pressed">
        <Arrow up on={mine > 0} />
      </button>
      <span className="min-w-5 text-center text-note font-semibold tabular-nums text-text" data-testid="votes-count">
        {votes}
      </span>
      <button type="button" aria-label={t('down')} aria-pressed={mine < 0} onClick={() => onVote(mine < 0 ? 0 : -1)} className="hit-44 inline-flex h-full items-center justify-center rounded-full px-2 active:bg-surface-pressed">
        <Arrow up={false} on={mine < 0} />
      </button>
    </span>
  )
}

export function PostVotes({ id, votes, mine }: { id: string; votes: number; mine: number }) {
  const t = useTranslations('community.talk')
  const talk = useTalk(id)
  const { gate } = useGate()
  const pending = talk.votePost.isPending ? talk.votePost.variables : null
  const now = pending ?? mine
  return <Votes votes={votes - mine + now} mine={now} label={t('postVotes')} onVote={(v) => gate(() => talk.votePost.mutate(v))} />
}

export function FindersLine({ id, finder, total }: { id: string; finder: { name: string; avatar: string | null } | null; total: number }) {
  const t = useTranslations('community.talk')
  const [open, setOpen] = useState(false)
  const list = useFinders(id, open)
  if (!finder) return <span className="block truncate text-account font-medium">{t('anonymousFinders', { n: total })}</span>
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen(true)
        }}
        className="flex min-w-0 max-w-full items-center gap-1 text-left"
        data-testid="finders"
      >
        <span className="min-w-[4.5rem] truncate text-account font-semibold">{finder.name}</span>
        {total > 1 && <span className="shrink-0 whitespace-nowrap text-note text-text-secondary">{t('andOthers', { n: total - 1 })}</span>}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('findersTitle', { n: total })}>
        <p className="px-4 pb-2 text-note leading-snug text-text-secondary">{t('findersLead')}</p>
        <ul className="px-2 pb-2" data-testid="finders-list">
          {(list.data?.finders ?? []).map((f) => (
            <li key={f.name} className="flex min-h-14 items-center gap-3 rounded-[var(--radius-button)] px-2">
              <span className={cx('inline-flex shrink-0 rounded-full p-[2px]', f.first && 'story-ring')}>
                <UserAvatar nickname={f.name} src={f.avatar} size={40} className="ring-2 ring-bg" />
              </span>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-ui font-semibold">{f.name}</span>
                {f.first && <span className="block text-note text-text-secondary">{t('firstFinder')}</span>}
              </span>
            </li>
          ))}
          {(list.data?.anonymous ?? 0) > 0 && <li className="px-2 py-2 text-note text-text-secondary">{t('findersAnonymous', { n: list.data?.anonymous ?? 0 })}</li>}
        </ul>
      </Sheet>
    </>
  )
}

function Composer({ id, parentId = null, onDone, autoFocus = false, placeholder }: { id: string; parentId?: number | null; onDone?: () => void; autoFocus?: boolean; placeholder: string }) {
  const t = useTranslations('community.talk')
  const talk = useTalk(id)
  const { user, gate } = useGate()
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const send = (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    gate(() =>
      talk.comment.mutate(
        { body: text, parent_id: parentId },
        {
          onSuccess: () => {
            setText('')
            setError(null)
            onDone?.()
          },
          onError: (err) => setError((err as { code?: string }).code === 'too_many' ? t('tooMany') : t('sendFailed')),
        },
      ),
    )
  }
  return (
    <form onSubmit={send} className="flex flex-col gap-2" data-testid={parentId ? 'reply-form' : 'comment-form'}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
        readOnly={!user}
        onPointerDown={(e) => {
          if (user) return
          e.preventDefault()
          gate(() => null)
        }}
        onKeyDown={(e) => {
          if (user || (e.key.length > 1 && e.key !== 'Enter')) return
          e.preventDefault()
          gate(() => null)
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        rows={parentId ? 2 : 3}
        autoFocus={autoFocus}
        className="w-full resize-none rounded-[var(--radius-button)] border-[0.5px] border-divider bg-surface px-3 py-2 text-body leading-snug text-text placeholder:text-text-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      />
      {error && (
        <p role="alert" className="text-note text-warning">
          {error}
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        {onDone && (
          <button type="button" onClick={onDone} className="hit-44 h-9 rounded-full px-3 text-note font-semibold text-text-secondary">
            {t('cancel')}
          </button>
        )}
        <button type="submit" disabled={!text.trim() || talk.comment.isPending} className="hit-44 h-9 rounded-full bg-accent px-4 text-note font-semibold text-on-accent disabled:opacity-45">
          {parentId ? t('reply') : t('send')}
        </button>
      </div>
    </form>
  )
}

function Comment({ id, c, collapsed, onToggle }: { id: string; c: CommentNode; collapsed: boolean; onToggle: () => void }) {
  const t = useTranslations('community.talk')
  const ago = useAgo()
  const talk = useTalk(id)
  const { gate } = useGate()
  const [replying, setReplying] = useState(false)
  const [menu, setMenu] = useState(false)
  const pending = talk.voteComment.isPending && talk.voteComment.variables?.cid === c.id ? talk.voteComment.variables.value : null
  const vote = pending ?? c.my_vote
  const gone = c.state !== 'ok' && c.body === null
  return (
    <li className="relative" style={{ paddingLeft: c.depth * 14 }} data-testid="comment" data-depth={c.depth}>
      {Array.from({ length: c.depth }, (_, i) => (
        <span key={i} aria-hidden="true" className="absolute inset-y-0 w-px bg-divider" style={{ left: i * 14 + 15 }} />
      ))}
      <div className="py-2 pl-1">
        <div className="flex items-center gap-2">
          <UserAvatar nickname={c.author} src={c.avatar} size={24} />
          <span className="min-w-0 truncate text-note font-semibold">{c.author ?? t('removedAuthor')}</span>
          <span className="shrink-0 text-meta text-text-secondary">{ago(c.created_at)}</span>
          {c.replies > 0 && (
            <button type="button" onClick={onToggle} aria-expanded={!collapsed} className="hit-44 ml-auto shrink-0 rounded-full px-2 text-meta font-medium text-text-secondary">
              {collapsed ? t('showReplies', { n: c.replies }) : t('hideReplies')}
            </button>
          )}
        </div>
        <p className={cx('mt-1 whitespace-pre-wrap break-words pl-8 text-body leading-snug', gone && 'italic text-text-secondary')}>{gone ? t(c.state === 'deleted' ? 'removed' : 'hidden') : c.body}</p>
        {c.state === 'hidden' && c.mine && <p className="pl-8 text-meta text-warning">{t('hiddenMine')}</p>}
        {c.state !== 'deleted' && (
          <div className="mt-0.5 flex items-center gap-1 pl-6">
            {c.mine ? (
              <span className="px-2 text-note font-semibold tabular-nums text-text-secondary" aria-label={t('points', { n: c.score })}>
                {t('points', { n: c.score })}
              </span>
            ) : (
              <Votes size="sm" votes={c.score - c.my_vote + vote} mine={vote} label={t('commentVotes')} onVote={(v) => gate(() => talk.voteComment.mutate({ cid: c.id, value: v }))} />
            )}
            {c.depth < 5 && !gone && (
              <button type="button" onClick={() => gate(() => setReplying((r) => !r))} className="hit-44 h-8 rounded-full px-2 text-note font-semibold text-text-secondary active:bg-surface">
                {t('reply')}
              </button>
            )}
            {!gone && (
              <button type="button" aria-label={t('more')} onClick={() => setMenu(true)} className="hit-44 inline-flex size-8 items-center justify-center rounded-full text-text-secondary active:bg-surface">
                <IconMore size={20} />
              </button>
            )}
          </div>
        )}
        {replying && (
          <div className="mt-1 pl-8">
            <Composer id={id} parentId={c.id} autoFocus placeholder={t('replyTo', { name: c.author ?? '' })} onDone={() => setReplying(false)} />
          </div>
        )}
      </div>
      <Sheet open={menu} onClose={() => setMenu(false)} title={t('commentMenu')}>
        {c.mine ? (
          <SheetRow
            danger
            label={t('delete')}
            onClick={() => {
              talk.remove.mutate(c.id)
              setMenu(false)
            }}
          />
        ) : (
          <SheetRow
            label={c.reported ? t('reported') : t('report')}
            onClick={() => {
              if (!c.reported) gate(() => talk.report.mutate(c.id))
              setMenu(false)
            }}
          />
        )}
      </Sheet>
    </li>
  )
}

export function Discussion({ id }: { id: string }) {
  const t = useTranslations('community.talk')
  const [sort, setSort] = useState<ThreadSort>('best')
  const [closed, setClosed] = useState<Set<number>>(new Set())
  const thread = useThread(id, sort)
  const list = thread.data?.comments ?? []
  const shown: CommentNode[] = []
  let hideBelow: number | null = null
  for (const c of list) {
    if (hideBelow !== null && c.depth > hideBelow) continue
    hideBelow = closed.has(c.id) ? c.depth : null
    shown.push(c)
  }
  return (
    <section className="px-4 pt-6" aria-labelledby="talk-title" data-testid="discussion">
      <div className="flex items-center justify-between gap-2">
        <h2 id="talk-title" className="text-title-sm font-bold">
          {t('title', { n: thread.data?.count ?? 0 })}
        </h2>
        <div role="group" aria-label={t('sortLabel')} className="flex gap-1.5">
          <Chip active={sort === 'best'} onClick={() => setSort('best')} className="min-h-8 px-2.5 text-note">
            {t('best')}
          </Chip>
          <Chip active={sort === 'new'} onClick={() => setSort('new')} className="min-h-8 px-2.5 text-note">
            {t('new')}
          </Chip>
        </div>
      </div>
      <div className="pt-3">
        <Composer id={id} placeholder={t('placeholder')} />
      </div>
      {thread.isSuccess && !list.length && <p className="py-6 text-center text-note text-text-secondary">{t('empty')}</p>}
      <ul className="pt-2">
        {shown.map((c) => (
          <Comment
            key={c.id}
            id={id}
            c={c}
            collapsed={closed.has(c.id)}
            onToggle={() =>
              setClosed((s) => {
                const next = new Set(s)
                if (next.has(c.id)) next.delete(c.id)
                else next.add(c.id)
                return next
              })
            }
          />
        ))}
      </ul>
    </section>
  )
}
