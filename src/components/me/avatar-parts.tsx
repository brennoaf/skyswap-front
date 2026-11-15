'use client'

import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'framer-motion'
import Image from 'next/image'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import { IconChevronLeft, IconChevronRight, IconDice } from '@/components/icons'
import { glassClass } from '@/components/ui/glass'
import { Button, Sheet } from '@/components/ui/primitives'
import { UserAvatar } from '@/components/ui/user-avatar'
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

const RING = 4
const RING_MASK = `radial-gradient(farthest-side, transparent calc(100% - ${RING}px), #000 calc(100% - ${RING}px))`
const CARD = 112

export function AvatarCarousel({ choice, hero = 200, name = null }: { choice: Choice; hero?: number; name?: string | null }) {
  const t = useTranslations('auth')
  const tp = useTranslations('player')
  const reduce = useReducedMotion()
  const track = useRef<HTMLDivElement>(null)
  const cards = useRef<(HTMLButtonElement | null)[]>([])
  const options = choice.options
  const selected = choice.selected
  const index = Math.max(0, options.findIndex((a) => a.id === selected?.id))
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const go = (i: number, focus = false) => {
    const a = options[(i + options.length) % options.length]
    if (!a) return
    choice.pick(a.id)
    const el = cards.current[(i + options.length) % options.length]
    const box = track.current
    if (el && box) box.scrollTo({ left: el.offsetLeft - (box.clientWidth - el.offsetWidth) / 2, behavior: reduce ? 'auto' : 'smooth' })
    if (focus) el?.focus({ preventScroll: true })
  }

  const onScroll = () => {
    clearTimeout(settle.current)
    settle.current = setTimeout(() => {
      const box = track.current?.getBoundingClientRect()
      if (!box) return
      const mid = box.left + box.width / 2
      let best = -1
      let gap = Infinity
      cards.current.forEach((el, i) => {
        if (!el) return
        const r = el.getBoundingClientRect()
        const d = Math.abs(r.left + r.width / 2 - mid)
        if (d < gap) [best, gap] = [i, d]
      })
      const a = options[best]
      if (a && a.id !== selected?.id) choice.pick(a.id)
    }, 90)
  }

  useEffect(() => () => clearTimeout(settle.current), [])

  const preview = (
    <span className="relative inline-flex items-center justify-center" style={{ width: hero, height: hero }} aria-hidden="true" data-testid="avatar-preview">
      <span className="story-ring absolute inset-0 rounded-full" style={{ WebkitMask: RING_MASK, mask: RING_MASK }} />
      <span className={cx(glassClass('media'), 'absolute rounded-full')} style={{ inset: RING + 2 }} />
      <motion.span
        key={selected?.id ?? 'none'}
        initial={reduce ? false : { scale: 0.94, opacity: 0.4 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        className="relative inline-flex overflow-hidden rounded-full bg-surface-pressed"
        style={{ width: hero - (RING + 6) * 2, height: hero - (RING + 6) * 2 }}
      >
        {selected ? (
          <Image src={selected.url} alt="" width={hero} height={hero} unoptimized onError={() => choice.drop(selected.id)} className="size-full object-cover" data-testid="avatar-preview-image" data-avatar={selected.id} />
        ) : (
          !choice.loading && <UserAvatar nickname={name || null} size={hero - (RING + 6) * 2} />
        )}
      </motion.span>
    </span>
  )

  return (
    <div className="flex flex-col items-center">
      {preview}
      {name !== null && (
        <p className="mt-3 h-6 max-w-full truncate text-title-sm font-semibold" aria-hidden="true">
          {name}
        </p>
      )}
      <span id="avatar-choice" className="sr-only">
        {t('pictureLabel')}
      </span>
      <div className={cx('relative mt-4 w-full', !choice.loading && !options.length && 'hidden')}>
        <div
          ref={track}
          role="radiogroup"
          aria-labelledby="avatar-choice"
          onScroll={onScroll}
          onKeyDown={(e) => {
            const move = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
            if (!move) return
            e.preventDefault()
            go(index + move, true)
          }}
          className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ paddingInline: `calc(50% - ${CARD / 2}px)` }}
          data-testid="avatar-carousel"
        >
          {choice.loading
            ? [0, 1, 2].map((i) => <span key={i} className="shrink-0 snap-center rounded-[28px] bg-surface-pressed" style={{ width: CARD, height: CARD }} />)
            : options.map((a, i) => {
                const on = i === index
                return (
                  <motion.button
                    key={a.id}
                    ref={(el) => {
                      cards.current[i] = el
                    }}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    tabIndex={on ? 0 : -1}
                    aria-label={t('pictureOption', { n: i + 1 })}
                    onClick={() => go(i)}
                    initial={reduce ? false : { opacity: 0, y: 14, rotateY: -35 }}
                    animate={{ opacity: on ? 1 : 0.55, y: 0, rotateY: 0, scale: on ? 1 : 0.88 }}
                    transition={{ duration: reduce ? 0 : 0.28, delay: reduce ? 0 : i * 0.05, ease: [0.2, 0.8, 0.2, 1] }}
                    className={cx('shrink-0 snap-center overflow-hidden rounded-[28px] outline-none focus-visible:ring-2 focus-visible:ring-accent', on && 'ring-2 ring-text ring-offset-2 ring-offset-bg')}
                    style={{ width: CARD, height: CARD }}
                    data-avatar={a.id}
                  >
                    <Image src={a.url} alt="" width={CARD} height={CARD} unoptimized onError={() => choice.drop(a.id)} className="size-full object-cover" />
                  </motion.button>
                )
              })}
        </div>
        {options.length > 1 && (
          <>
            <button type="button" aria-label={tp('prev')} onClick={() => go(index - 1)} className={cx(glassClass(), 'absolute left-1 top-1/2 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full text-text [@media(pointer:fine)]:inline-flex')}>
              <IconChevronLeft size={22} />
            </button>
            <button type="button" aria-label={tp('next')} onClick={() => go(index + 1)} className={cx(glassClass(), 'absolute right-1 top-1/2 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full text-text [@media(pointer:fine)]:inline-flex')}>
              <IconChevronRight size={22} />
            </button>
          </>
        )}
      </div>
      <div className="mt-2 flex items-center gap-3">
        <span className="flex items-center gap-1.5" aria-hidden="true" data-testid="avatar-dots">
          {options.map((a, i) => (
            <span key={a.id} className={cx('h-1.5 rounded-full transition-[width,background-color]', i === index ? 'w-4 bg-text' : 'w-1.5 bg-divider')} />
          ))}
        </span>
        <button type="button" aria-label={t('redraw')} onClick={choice.redraw} disabled={choice.drawing} className={cx(glassClass(), 'inline-flex size-11 items-center justify-center rounded-full text-text disabled:opacity-50')} data-testid="avatar-redraw">
          <IconDice size={24} />
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
      <AvatarCarousel choice={choice} />
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
