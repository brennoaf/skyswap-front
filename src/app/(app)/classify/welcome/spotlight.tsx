'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { useId } from 'react'

export function Spotlight({ u, v, r }: { u: number; v: number; r: number }) {
  const id = useId().replace(/\W/g, '')
  const reduce = useReducedMotion()
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="pointer-events-none absolute inset-0 size-full" data-testid="spotlight">
      <defs>
        <mask id={id}>
          <rect width="100" height="100" fill="white" />
          <motion.circle initial={false} animate={{ cx: u * 100, cy: v * 100, r }} transition={{ duration: reduce ? 0 : 0.3, ease: 'easeInOut' }} fill="black" data-testid="spotlight-hole" />
        </mask>
      </defs>
      <rect width="100" height="100" fill="var(--color-media-scrim)" mask={`url(#${id})`} />
    </svg>
  )
}
