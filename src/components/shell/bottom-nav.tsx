'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { IconCards, IconHome, IconReel, IconSearch } from '@/components/icons'
import { UserAvatar } from '@/components/ui/user-avatar'
import { useAlerts, useSession } from '@/lib/api/hooks'
import { cx } from '@/lib/format'

export function BottomNav() {
  const t = useTranslations('nav')
  const path = usePathname()
  const overlay = path.startsWith('/reels')
  const hidden = /^\/lab\/[^/]+/.test(path)
  const { data: user } = useSession()
  const { data: alerts } = useAlerts(!!user)
  const personal = alerts?.alerts.some((a) => !a.read && (a.type === 'badge' || a.type === 'level')) ?? false
  const is = (p: string) => (p === '/' ? path === '/' : path.startsWith(p))
  const item = 'flex size-11 items-center justify-center rounded-full text-text transition-transform active:scale-90'
  if (hidden) return null
  return (
    <nav
      aria-label={t('label')}
      className={cx(
        'fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[var(--width-app)] border-t-[0.5px] safe-bottom',
        overlay ? 'border-white/15 bg-reels-bg text-on-media [--color-text:var(--color-on-media)]' : 'border-border bg-bg',
      )}
    >
      <ul className="flex h-[var(--height-bottomnav)] items-center justify-around px-3">
        <li>
          <Link href="/" aria-label={t('home')} aria-current={is('/') ? 'page' : undefined} className={item}>
            <IconHome filled={is('/')} />
          </Link>
        </li>
        <li>
          <Link href="/search" aria-label={t('search')} aria-current={is('/search') ? 'page' : undefined} className={item}>
            <IconSearch filled={is('/search')} />
          </Link>
        </li>
        <li>
          <Link href="/classify" data-tour="nav-classify" aria-label={t('classify')} aria-current={is('/classify') ? 'page' : undefined} className={item}>
            <IconCards filled={is('/classify')} />
          </Link>
        </li>
        <li>
          <Link href="/reels" aria-label={t('reels')} aria-current={is('/reels') ? 'page' : undefined} className={item}>
            <IconReel filled={is('/reels')} />
          </Link>
        </li>
        <li>
          <Link href="/me" aria-label={t('me')} aria-current={is('/me') ? 'page' : undefined} className={cx(item, 'flex-col gap-[5px] pt-[9px]')}>
            <UserAvatar nickname={user?.nickname ?? null} src={user?.avatar?.url} size={25} active={is('/me')} />
            <span className={cx('size-[4px] rounded-full', personal ? 'bg-danger' : 'bg-transparent')} />
          </Link>
        </li>
      </ul>
    </nav>
  )
}
