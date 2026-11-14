'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { IconCarousel, IconReel } from '@/components/icons'
import type { Post } from '@/lib/api/client'
import { formatShortDate } from '@/lib/format'

export interface GridTile {
  key: string
  href: string
  src: string
  alt: string
  badge?: 'reel' | 'carousel' | null
  label?: string
  pixelated?: boolean
}

export function tilesFromPosts(posts: Post[]): GridTile[] {
  return posts.map((p) => ({
    key: p.id,
    href: `/p/${p.id}`,
    src: p.cover,
    alt: p.title,
    badge: p.type === 'timelapse' ? 'reel' : p.frames.length > 1 ? 'carousel' : null,
    pixelated: p.frames.length > 0,
  }))
}

export function PostGrid({ tiles }: { tiles: GridTile[] }) {
  const t = useTranslations('profile')
  if (!tiles.length) return <p className="px-6 py-12 text-center text-text-secondary">{t('noPosts')}</p>
  return (
    <ul className="grid grid-cols-3 gap-px">
      {tiles.map((tile) => (
        <li key={tile.key}>
          <Link href={tile.href} className="relative block aspect-[3/4] overflow-hidden bg-media-bg" aria-label={tile.alt}>
            <Image src={tile.src} alt="" fill sizes="157px" className={tile.pixelated ? 'pixelated object-contain' : 'object-contain'} />
            {tile.badge && (
              <span className="absolute right-1 top-1 text-white drop-shadow">{tile.badge === 'reel' ? <IconReel size={24} /> : <IconCarousel size={24} />}</span>
            )}
            {tile.label && <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] text-white">{tile.label}</span>}
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function frameTiles(posts: Post[], band: string): GridTile[] {
  const seen = new Set<string>()
  const out: (GridTile & { mjd: number })[] = []
  for (const p of posts) {
    for (const f of p.frames) {
      if (f.band !== band || seen.has(f.src)) continue
      seen.add(f.src)
      out.push({ key: f.src, href: `/p/${p.id}`, src: f.src, alt: `${p.title} · ${f.band} · ${formatShortDate(f.t)}`, label: formatShortDate(f.t), pixelated: true, mjd: f.mjd })
    }
  }
  return out.sort((a, b) => a.mjd - b.mjd)
}
