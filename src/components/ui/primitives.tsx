'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { IconBack, IconFlask, IconSaturated, IconVerified } from '@/components/icons'
import { cx } from '@/lib/format'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

export function Button({ variant = 'secondary', className, full, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; full?: boolean }) {
  return (
    <button
      {...rest}
      className={cx(
        'inline-flex min-h-8 items-center justify-center gap-1 rounded-[var(--radius-button)] px-3 text-ui font-medium leading-none transition-colors disabled:opacity-50',
        variant === 'primary' && 'bg-accent text-on-accent active:bg-accent-pressed',
        variant === 'secondary' && 'bg-surface text-text active:bg-surface-pressed',
        variant === 'ghost' && 'text-text active:bg-surface',
        variant === 'danger' && 'bg-surface text-danger active:bg-surface-pressed',
        full && 'w-full',
        className,
      )}
    />
  )
}

export function LabChip({ href, label, description, tour }: { href: string; label: string; description: string; tour?: string }) {
  return (
    <Link href={href} aria-label={description} data-tour={tour} className="inline-flex h-11 shrink-0 items-center">
      <span className="inline-flex h-8 items-center gap-1 rounded-full bg-surface pl-2 pr-3 text-body font-semibold active:bg-surface-pressed">
        <IconFlask size={18} />
        {label}
      </span>
    </Link>
  )
}

export function Switch({ offTone = 'bg-surface-pressed', ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'role' | 'className'> & { offTone?: string }) {
  return (
    <>
      <input type="checkbox" role="switch" {...rest} className="peer sr-only" />
      <span aria-hidden="true" className={cx('relative h-6 w-10 shrink-0 rounded-full transition-colors after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-on-accent after:transition-transform peer-checked:bg-accent peer-checked:after:translate-x-4', offTone)} />
    </>
  )
}

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" aria-label={label} title={label} {...rest} className={cx('inline-flex size-11 shrink-0 items-center justify-center rounded-full text-text transition-transform active:scale-90 disabled:opacity-40', className)}>
      {children}
    </button>
  )
}

export function TopBar({ title, back = true, onBack, actions, className, titleClassName }: { title?: ReactNode; back?: boolean; onBack?: () => void; actions?: ReactNode; className?: string; titleClassName?: string }) {
  const router = useRouter()
  const t = useTranslations('common')
  return (
    <header className={cx('sticky top-0 z-30 flex h-[var(--height-topbar)] items-center gap-1 bg-bg px-1', className)}>
      {back && (
        <IconButton label={t('back')} onClick={onBack ?? (() => (history.length > 1 ? router.back() : router.push('/')))}>
          <IconBack />
        </IconButton>
      )}
      <h1 className={cx('min-w-0 flex-1 truncate font-[family-name:var(--font-display)] text-handle font-bold', !back && 'pl-3', titleClassName)}>{title}</h1>
      {actions && <div className="flex items-center">{actions}</div>}
    </header>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return <span className={cx('font-[family-name:var(--font-wordmark)] text-wordmark leading-none', className)}>SkySwap</span>
}

export type RingState = 'new' | 'seen' | 'none'

export function ObjectAvatar({ src, alt, size, ring = 'none', className }: { src: string; alt: string; size: number; ring?: RingState; className?: string }) {
  const stroke = size >= 80 ? 3.5 : size >= 50 ? 2.5 : 1.5
  const gap = size >= 80 ? 4 : size >= 50 ? 3 : 2
  const inner = ring === 'none' ? size : size - (stroke + gap) * 2
  return (
    <span className={cx('relative inline-flex shrink-0 items-center justify-center rounded-full', className)} style={{ width: size, height: size }}>
      {ring !== 'none' && (
        <span
          aria-hidden="true"
          className={cx('absolute inset-0 rounded-full', ring === 'new' ? 'story-ring' : 'bg-ring-seen')}
          style={{ WebkitMask: `radial-gradient(farthest-side, transparent calc(100% - ${stroke}px), #000 calc(100% - ${stroke}px))`, mask: `radial-gradient(farthest-side, transparent calc(100% - ${stroke}px), #000 calc(100% - ${stroke}px))` }}
        />
      )}
      <span className="flex items-center justify-center overflow-hidden rounded-full bg-media-bg ring-[0.5px] ring-divider" style={{ width: inner, height: inner }}>
        <Image src={src} alt={alt} width={Math.round(inner / Math.SQRT2)} height={Math.round(inner / Math.SQRT2)} className="pixelated object-contain" style={{ width: inner / Math.SQRT2, height: inner / Math.SQRT2 }} />
      </span>
    </span>
  )
}

export function ObjectBadges({ verified, saturated, size = 14 }: { verified: boolean; saturated: boolean; size?: number }) {
  const t = useTranslations('object.badges')
  return (
    <>
      {verified && (
        <span title={t('verified')} className="inline-flex">
          <IconVerified size={size} />
          <span className="sr-only">{t('verified')}</span>
        </span>
      )}
      {saturated && (
        <span title={t('saturated')} className="inline-flex">
          <IconSaturated size={size} />
          <span className="sr-only">{t('saturated')}</span>
        </span>
      )}
    </>
  )
}

export const isVerified = (verdict: string) => verdict === 'clear'
export const isSaturated = (saturation: string) => saturation === 'heavy'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Sheet({
  open,
  onClose,
  title,
  children,
  className,
  labelledBy,
  dim = true,
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  className?: string
  labelledBy?: string
  dim?: boolean
}) {
  const id = useId()
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  const dragStart = useRef<number | null>(null)
  const [drag, setDrag] = useState(0)
  const t = useTranslations('common')
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeRef.current()
        return
      }
      if (e.key !== 'Tab' || !ref.current) return
      const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (!items.length) return
      const first = items[0] as HTMLElement
      const last = items[items.length - 1] as HTMLElement
      if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      setDrag(0)
      prev?.focus()
    }
  }, [open])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="presentation">
      <button type="button" aria-label={t('close')} tabIndex={-1} className={cx('absolute inset-0', dim ? 'bg-overlay' : 'bg-transparent')} onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy ?? (title ? id : undefined)}
        tabIndex={-1}
        style={{ transform: drag ? `translateY(${drag}px)` : undefined }}
        className={cx(
          'sheet-in relative max-h-[88dvh] w-full max-w-[var(--width-app)] overflow-y-auto rounded-t-[var(--radius-sheet)] bg-sheet pb-[max(var(--space-gutter),env(safe-area-inset-bottom))] shadow-[var(--shadow-sheet)] outline-none',
          className,
        )}
      >
        <div
          className="sticky top-0 z-10 cursor-grab touch-none bg-sheet pt-2"
          onPointerDown={(e) => {
            dragStart.current = e.clientY
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => dragStart.current !== null && setDrag(Math.max(0, e.clientY - dragStart.current))}
          onPointerUp={() => {
            if (drag > 90) onClose()
            else setDrag(0)
            dragStart.current = null
          }}
        >
          <div className="mx-auto h-1 w-10 rounded-full bg-ring-seen" aria-hidden="true" />
          {title ? (
            <h2 id={id} className="border-b-[0.5px] border-divider px-4 py-3 text-center text-title-sm font-semibold">
              {title}
            </h2>
          ) : (
            <div className="h-2" />
          )}
        </div>
        {children}
      </div>
    </div>
  )
}

export function SheetRow({ icon, label, hint, onClick, href, danger }: { icon?: ReactNode; label: ReactNode; hint?: ReactNode; onClick?: () => void; href?: string; danger?: boolean }) {
  const cls = cx('flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left text-ui active:bg-surface', danger && 'text-danger')
  const body = (
    <>
      {icon && <span className="text-text">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block">{label}</span>
        {hint && <span className="block text-meta text-text-secondary">{hint}</span>}
      </span>
    </>
  )
  return href ? (
    <Link href={href} className={cls} onClick={onClick}>
      {body}
    </Link>
  ) : (
    <button type="button" className={cls} onClick={onClick}>
      {body}
    </button>
  )
}

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <span aria-hidden="true" className={cx('skeleton block', !className?.includes('rounded') && 'rounded-md', className)} style={style} />
}

export function EmptyState({ art, title, body, action }: { art?: ReactNode; title: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-8 py-12 text-center">
      {art && <div className="mb-4">{art}</div>}
      <p className="text-title-md font-semibold">{title}</p>
      {body && <p className="mt-2 max-w-[300px] text-text-secondary">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function IconTabs<T extends string>({ tabs, value, onChange, label }: { tabs: { key: T; icon: ReactNode; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex border-b-[0.5px] border-divider">
      {tabs.map((tab) => {
        const active = tab.key === value
        return (
          <button
            key={tab.key}
            role="tab"
            type="button"
            aria-selected={active}
            aria-label={tab.label}
            title={tab.label}
            onClick={() => onChange(tab.key)}
            className={cx('relative flex h-14 min-w-0 flex-1 flex-col items-center justify-center', active ? 'text-text' : 'text-text-secondary')}
          >
            <span className="flex h-7 items-center justify-center" aria-hidden="true">
              {tab.icon}
            </span>
            <span className="max-w-full truncate px-1 text-micro font-medium">{tab.label}</span>
            {active && <span className="absolute bottom-0 h-[2px] w-[41px] rounded-full bg-text" />}
          </button>
        )
      })}
    </div>
  )
}

export function Chip({ active, children, onClick, className }: { active?: boolean; children: ReactNode; onClick?: () => void; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx('inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-[var(--radius-button)] border-[0.5px] px-3 text-body font-medium', active ? 'border-text bg-text text-bg' : 'border-divider bg-surface text-text', className)}
    >
      {children}
    </button>
  )
}

export function Notice({ tone = 'info', icon, children }: { tone?: 'info' | 'warning'; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex gap-3 rounded-xl bg-surface px-3 py-3 text-note leading-snug text-text">
      {icon && <span className={cx('shrink-0', tone === 'warning' ? 'text-warning' : 'text-text')}>{icon}</span>}
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-start leading-tight">
      <span className="text-title-sm font-semibold">{value}</span>
      <span className="text-body">{label}</span>
    </div>
  )
}

export function Segmented<T extends string>({ label, value, options, onChange, className }: { label: string; value: T; options: { value: T; label: ReactNode; disabled?: boolean }[]; onChange: (v: T) => void; className?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cx('flex rounded-[var(--radius-button)] bg-surface p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={cx('min-h-9 flex-1 whitespace-nowrap rounded-[6px] px-3 text-meta font-semibold disabled:opacity-40', value === o.value ? 'bg-bg text-text shadow-sm' : 'text-text-secondary')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function useLoopRestart(index: number, playing: boolean, ms = 450): boolean {
  const [on, setOn] = useState(false)
  const last = useRef(index)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const wrapped = playing && index === 0 && last.current > 0
    last.current = index
    if (!wrapped) return
    setOn(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setOn(false), ms)
  }, [index, playing, ms])
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])
  return on
}
