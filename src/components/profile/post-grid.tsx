'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { IconCarousel, IconReel } from '@/components/icons'
import type { Post } from '@/lib/api/client'
import { yearsSpanned } from '@/lib/long-baseline'
import { formatShortDate } from '@/lib/format'

export interface GridTile {
  key: string
  href: string
  src: string
  alt: string
  badge?: 'reel' | 'carousel' | null
  years?: number | null
  label?: string
  pixelated?: boolean
}

export function tilesFromPosts(posts: Post[]): GridTile[] {
  return posts.map((p) => ({
    key: p.id,
    href: `/p/${p.id}`,
    src: p.cover,
    alt: p.title,
    badge: p.type === 'long_baseline' ? null : p.type === 'timelapse' ? 'reel' : p.frames.length > 1 ? 'carousel' : null,
    years: p.type === 'long_baseline' ? yearsSpanned(p) : null,
    pixelated: p.frames.length > 0,
  }))
}

export function PostGrid({ tiles }: { tiles: GridTile[] }) {
  const t = useTranslations('profile')
  const tp = useTranslations('post')
  if (!tiles.length) return <p className="px-6 py-12 text-center text-text-secondary">{t('noPosts')}</p>
  return (
    <ul className="grid grid-cols-3 gap-px">
      {tiles.map((tile) => (
        <li key={tile.key}>
          <Link href={tile.href} className="relative block aspect-[3/4] overflow-hidden bg-media-bg" aria-label={tile.alt}>
            <Image src={tile.src} alt="" fill sizes="157px" className={tile.pixelated ? 'pixelated object-contain' : 'object-contain'} />
            {tile.years ? <span className="absolute right-1 top-1 rounded-full bg-media-scrim px-1.5 py-0.5 text-micro font-semibold text-on-media">{tp('yearsBadge', { n: tile.years })}</span> : null}
            {tile.badge && (
              <span className="absolute right-1 top-1 rounded-full bg-media-scrim p-0.5 text-on-media">{tile.badge === 'reel' ? <IconReel size={24} /> : <IconCarousel size={24} />}</span>
            )}
            {tile.label && <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-micro text-white">{tile.label}</span>}
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function frameTiles(posts: Post[], band: string, locale: string): GridTile[] {
  const seen = new Set<string>()
  const out: (GridTile & { mjd: number })[] = []
  for (const p of posts) {
    for (const f of p.frames) {
      if (f.band !== band || seen.has(f.src)) continue
      seen.add(f.src)
      out.push({ key: f.src, href: `/p/${p.id}`, src: f.src, alt: `${p.title}, ${f.band}, ${formatShortDate(f.t, locale)}`, label: formatShortDate(f.t, locale), pixelated: true, mjd: f.mjd })
    }
  }
  return out.sort((a, b) => a.mjd - b.mjd)
}
