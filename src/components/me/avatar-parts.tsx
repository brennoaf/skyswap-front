'use client'

import { keepPreviousData, useQuery } from '@tanstack/react-query'
import Image from 'next/image'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import { Button, Sheet } from '@/components/ui/primitives'
import { api, ApiError, unwrap, type User } from '@/lib/api/client'
import { useSetAvatar } from '@/lib/api/hooks'
import { cx } from '@/lib/format'

export type Avatar = NonNullable<User['avatar']>

const SEEN_LIMIT = 30

export function useAvatarChoice(enabled = true) {
  const [seen, setSeen] = useState<string[]>([])
  const [round, setRound] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const [broken, setBroken] = useState<string[]>([])
  const offer = useQuery({
    queryKey: ['avatar-offer', round],
    enabled,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    placeholderData: keepPreviousData,
    queryFn: async () => unwrap(await api.GET('/api/avatars/offer', { params: { query: seen.length ? { not: seen.join(',') } : {} } })).avatars,
  })
  const options = (offer.data ?? []).filter((a) => !broken.includes(a.id))
  const selected = options.find((a) => a.id === picked) ?? options[0] ?? null
  return {
    options,
    selected,
    loading: offer.isPending && enabled,
    drawing: offer.isFetching,
    pick: setPicked,
    drop: (id: string) => setBroken((b) => [...b, id]),
    redraw: () => {
      setSeen((s) => [...s, ...(offer.data ?? []).map((a) => a.id)].slice(-SEEN_LIMIT))
      setPicked(null)
      setRound((r) => r + 1)
    },
  }
}

type Choice = ReturnType<typeof useAvatarChoice>

export function AvatarChoices({ choice, size = 56 }: { choice: Choice; size?: number }) {
  const t = useTranslations('auth')
  if (choice.loading) {
    return (
      <div className="flex gap-3" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className="rounded-full bg-surface-pressed" style={{ width: size, height: size }} />
        ))}
      </div>
    )
  }
  if (!choice.options.length) return null
  return (
    <div>
      <p id="avatar-choice" className="mb-2 text-note text-text-secondary">
        {t('pictureLabel')}
      </p>
      <div className="flex items-center gap-3">
        <div role="radiogroup" aria-labelledby="avatar-choice" className="flex gap-3">
          {choice.options.map((a, i) => {
            const on = choice.selected?.id === a.id
            return (
              <button
                key={a.id}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={t('pictureOption', { n: i + 1 })}
                onClick={() => choice.pick(a.id)}
                className={cx('shrink-0 overflow-hidden rounded-full ring-offset-2 ring-offset-bg', on ? 'ring-2 ring-text' : 'ring-0 opacity-80')}
                style={{ width: size, height: size }}
              >
                <Image src={a.url} alt="" width={size} height={size} unoptimized onError={() => choice.drop(a.id)} className="size-full object-cover" />
              </button>
            )
          })}
        </div>
        <button type="button" onClick={choice.redraw} disabled={choice.drawing} className="inline-flex min-h-11 min-w-0 items-center px-1 text-left text-note font-semibold text-link disabled:opacity-50">
          {t('redraw')}
        </button>
      </div>
    </div>
  )
}

function SwapPanel({ onDone, onCancel }: { onDone: () => void; onCancel: (() => void) | null }) {
  const t = useTranslations('me.avatar')
  const choice = useAvatarChoice()
  const save = useSetAvatar()
  const taken = save.error instanceof ApiError && save.error.code === 'avatar_taken'
  return (
    <div className="flex flex-col gap-4 px-6 pb-4 pt-2">
      <h2 id="avatar-sheet-title" className="text-title-sm font-semibold">
        {t('chooseTitle')}
      </h2>
      <AvatarChoices choice={choice} />
      {!choice.loading && !choice.options.length && <p className="text-body text-text-secondary">{t('none')}</p>}
      {save.error && <p className="text-meta text-danger">{t(taken ? 'taken' : 'failed')}</p>}
      <div className="flex gap-2">
        {onCancel && (
          <Button full className="h-11" onClick={onCancel}>
            {t('cancel')}
          </Button>
        )}
        <Button
          variant="primary"
          full
          className="h-11"
          disabled={!choice.selected || save.isPending}
          onClick={() => {
            if (!choice.selected) return
            save.mutate(choice.selected.id, {
              onSuccess: onDone,
              onError: (err) => {
                if (err instanceof ApiError && err.code === 'avatar_taken') choice.redraw()
              },
            })
          }}
        >
          {t('use')}
        </Button>
      </div>
    </div>
  )
}

function AvatarAbout({ avatar, onSwap }: { avatar: Avatar; onSwap: () => void }) {
  const t = useTranslations('me.avatar')
  const locale = useLocale()
  const date = avatar.date ? new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${avatar.date}T00:00:00Z`)) : null
  return (
    <div className="flex flex-col gap-3 px-6 pb-4 pt-2">
      <Image src={avatar.url} alt="" width={192} height={192} unoptimized className="mx-auto size-48 rounded-[var(--radius-sheet)] object-cover" />
      <div>
        <p className="text-note text-text-secondary">{t('pieceOf')}</p>
        <h2 id="avatar-sheet-title" lang="en" className="text-title-sm font-semibold leading-snug">
          {avatar.title}
        </h2>
        <p className="text-meta text-text-secondary">{t('originalTitle')}</p>
      </div>
      <dl className="flex flex-col gap-1 text-body">
        {date && (
          <div>
            <dt className="inline text-text-secondary">{t('date')}: </dt>
            <dd className="inline">{date}</dd>
          </div>
        )}
        <div>
          <dt className="inline text-text-secondary">{t('credit')}: </dt>
          <dd className="inline">{avatar.credit}</dd>
        </div>
      </dl>
      <a href={avatar.image_url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-body font-semibold text-link">
        {t('whole')}
      </a>
      <p className="text-meta leading-snug text-text-secondary">{t('note')}</p>
      <Button full className="h-11" onClick={onSwap}>
        {t('swap')}
      </Button>
    </div>
  )
}

export function AvatarSheet({ avatar, open, onClose }: { avatar: Avatar | null; open: boolean; onClose: () => void }) {
  const [swapping, setSwapping] = useState(false)
  const close = () => {
    setSwapping(false)
    onClose()
  }
  return (
    <Sheet open={open} onClose={close} labelledBy="avatar-sheet-title">
      {open && (avatar && !swapping ? <AvatarAbout avatar={avatar} onSwap={() => setSwapping(true)} /> : <SwapPanel onDone={() => setSwapping(false)} onCancel={avatar ? () => setSwapping(false) : null} />)}
    </Sheet>
  )
}
