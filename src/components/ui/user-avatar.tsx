'use client'

import Image from 'next/image'
import { useId, useState } from 'react'
import { cx } from '@/lib/format'

function hash(s: string): number {
  let h = 2166136261
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0
  return h
}

function rng(seed: number) {
  let s = seed || 1
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

function SkyPatch({ nickname, id }: { nickname: string; id: string }) {
  const r = rng(hash(nickname))
  const band = `var(--color-band-d${1 + Math.floor(r() * 6)})`
  const glow = `var(--color-band-d${1 + Math.floor(r() * 6)})`
  const star = { x: 9 + r() * 14, y: 9 + r() * 14, s: 3.2 + r() * 2.2 }
  const field = Array.from({ length: 9 }, () => ({ x: r() * 32, y: r() * 32, s: 0.35 + r() * 0.75, o: 0.35 + r() * 0.6 }))
  const haze = { x: r() * 32, y: r() * 32 }
  return (
    <>
      <defs>
        <radialGradient id={`${id}-psf`}>
          <stop offset="0%" stopColor="var(--color-spot-star)" />
          <stop offset="22%" stopColor="var(--color-spot-star)" stopOpacity="0.9" />
          <stop offset="55%" stopColor={band} stopOpacity="0.45" />
          <stop offset="100%" stopColor={band} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-haze`}>
          <stop offset="0%" stopColor={glow} stopOpacity="0.35" />
          <stop offset="100%" stopColor={glow} stopOpacity="0" />
        </radialGradient>
        <filter id={`${id}-grain`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="2" seed={hash(nickname) % 997} />
          <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.22 0" />
        </filter>
      </defs>
      <rect width="32" height="32" fill="var(--color-reels-bg)" />
      <circle cx={haze.x} cy={haze.y} r="18" fill={`url(#${id}-haze)`} />
      <rect width="32" height="32" filter={`url(#${id}-grain)`} />
      {field.map((f, i) => (
        <circle key={i} cx={f.x} cy={f.y} r={f.s} fill="var(--color-spot-star)" opacity={f.o} />
      ))}
      <circle cx={star.x} cy={star.y} r={star.s * 2.4} fill={`url(#${id}-psf)`} />
    </>
  )
}

function Silhouette() {
  return (
    <>
      <rect width="32" height="32" fill="var(--color-surface-pressed)" />
      <circle cx="16" cy="12.5" r="5.5" fill="var(--color-text-secondary)" />
      <path d="M5 31c1.2-6.6 5.6-10 11-10s9.8 3.4 11 10z" fill="var(--color-text-secondary)" />
    </>
  )
}

export function UserAvatar({ nickname, src, size = 32, active = false, className }: { nickname: string | null; src?: string | null; size?: number; active?: boolean; className?: string }) {
  const id = useId().replace(/:/g, '')
  const [failed, setFailed] = useState<string | null>(null)
  return (
    <span
      className={cx('inline-flex shrink-0 overflow-hidden rounded-full', active && 'ring-[1.5px] ring-text ring-offset-[1.5px] ring-offset-bg', className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {src && failed !== src ? (
        <Image src={src} alt="" width={size} height={size} unoptimized onError={() => setFailed(src)} className="size-full object-cover" />
      ) : (
        <svg viewBox="0 0 32 32" width={size} height={size}>
          {nickname ? <SkyPatch nickname={nickname} id={id} /> : <Silhouette />}
        </svg>
      )}
    </span>
  )
}
