'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { IconBack, IconSaturated, IconVerified } from '@/components/icons'
import { cx } from '@/lib/format'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

export function Button({ variant = 'secondary', className, full, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; full?: boolean }) {
  return (
    <button
      {...rest}
      className={cx(
        'inline-flex min-h-8 items-center justify-center gap-1 rounded-[var(--radius-button)] px-3 text-[length:var(--text-button)] font-medium leading-none transition-colors disabled:opacity-50',
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

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" aria-label={label} title={label} {...rest} className={cx('inline-flex size-11 shrink-0 items-center justify-center rounded-full text-text transition-transform active:scale-90 disabled:opacity-40', className)}>
      {children}
    </button>
  )
}

export function TopBar({ title, back = true, actions, className, titleClassName }: { title?: ReactNode; back?: boolean; actions?: ReactNode; className?: string; titleClassName?: string }) {
  const router = useRouter()
  const t = useTranslations('common')
  return (
    <header className={cx('sticky top-0 z-30 flex h-[var(--height-topbar)] items-center gap-1 bg-bg px-1', className)}>
      {back && (
        <IconButton label={t('back')} onClick={() => (history.length > 1 ? router.back() : router.push('/'))}>
          <IconBack />
        </IconButton>
      )}
      <h1 className={cx('min-w-0 flex-1 truncate font-[family-name:var(--font-display)] text-[length:var(--text-handle)] font-bold', !back && 'pl-3', titleClassName)}>{title}</h1>
      {actions && <div className="flex items-center">{actions}</div>}
    </header>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return <span className={cx('font-[family-name:var(--font-wordmark)] text-[32px] leading-none', className)}>SkySwap</span>
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
      <Image src={src} alt={alt} width={inner} height={inner} className="rounded-full bg-media-bg object-cover" style={{ width: inner, height: inner }} />
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

export const isVerified = (verdict: string) => verdict === 'clear' || verdict === 'with_help'
export const isSaturated = (saturation: string) => saturation === 'heavy'

export function Sheet({ open, onClose, title, children, className, labelledBy }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; className?: string; labelledBy?: string }) {
  const id = useId()
  const ref = useRef<HTMLDivElement>(null)
  const t = useTranslations('common')
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      prev?.focus()
    }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="presentation">
      <button type="button" aria-label={t('close')} className="absolute inset-0 bg-overlay" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy ?? (title ? id : undefined)}
        tabIndex={-1}
        className={cx('relative max-h-[88dvh] w-full max-w-[var(--width-app)] overflow-y-auto rounded-t-[var(--radius-sheet)] bg-sheet pb-[max(16px,env(safe-area-inset-bottom))] outline-none', className)}
      >
        <div className="sticky top-0 z-10 bg-sheet pt-2">
          <div className="mx-auto h-1 w-10 rounded-full bg-ring-seen" aria-hidden="true" />
          {title && (
            <h2 id={id} className="border-b-[0.5px] border-divider px-4 py-3 text-center text-[16px] font-semibold">
              {title}
            </h2>
          )}
        </div>
        {children}
      </div>
    </div>
  )
}

export function SheetRow({ icon, label, hint, onClick, href, danger }: { icon?: ReactNode; label: ReactNode; hint?: ReactNode; onClick?: () => void; href?: string; danger?: boolean }) {
  const cls = cx('flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left text-[15px] active:bg-surface', danger && 'text-danger')
  const body = (
    <>
      {icon && <span className="text-text">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block">{label}</span>
        {hint && <span className="block text-[12px] text-text-secondary">{hint}</span>}
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
      <p className="text-[18px] font-semibold">{title}</p>
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
            className={cx('relative flex h-12 flex-1 items-center justify-center', active ? 'text-text' : 'text-icon-muted')}
          >
            {tab.icon}
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
      className={cx('inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-[var(--radius-button)] border-[0.5px] px-3 text-[14px] font-medium', active ? 'border-text bg-text text-bg' : 'border-divider bg-surface text-text', className)}
    >
      {children}
    </button>
  )
}

export function Notice({ tone = 'info', icon, children }: { tone?: 'info' | 'warning'; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className={cx('flex gap-2 rounded-xl px-3 py-2.5 text-[13px] leading-snug', tone === 'warning' ? 'bg-warning/15 text-text' : 'bg-surface text-text')}>
      {icon && <span className={cx('mt-[1px] shrink-0', tone === 'warning' ? 'text-warning' : 'text-text-secondary')}>{icon}</span>}
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-start leading-tight">
      <span className="text-[length:var(--text-stat)] font-semibold">{value}</span>
      <span className="text-[14px]">{label}</span>
    </div>
  )
}
