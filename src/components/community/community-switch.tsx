'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { cx } from '@/lib/format'

export function CommunitySwitch() {
  const t = useTranslations('community')
  const path = usePathname()
  const onCommunity = path.startsWith('/community')
  const items = [
    { href: '/', label: t('switchPosts'), on: !onCommunity },
    { href: '/community', label: t('switchCommunity'), on: onCommunity },
  ]
  return (
    <nav aria-label={t('switchLabel')} className="flex border-b-[0.5px] border-divider">
      {items.map((item) => (
        <Link key={item.href} href={item.href} aria-current={item.on ? 'page' : undefined} className={cx('relative flex h-11 flex-1 items-center justify-center text-ui font-semibold', item.on ? 'text-text' : 'text-icon-muted')}>
          {item.label}
          {item.on && <span className="absolute bottom-0 h-[2px] w-12 rounded-full bg-text" />}
        </Link>
      ))}
    </nav>
  )
}
