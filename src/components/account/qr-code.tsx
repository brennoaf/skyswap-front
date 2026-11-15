'use client'

import { useMemo } from 'react'
import { encode } from 'uqr'
import { cx } from '@/lib/format'

export function QrCode({ value, label, size = 216, className }: { value: string; label: string; size?: number; className?: string }) {
  const { path, n } = useMemo(() => {
    const qr = encode(value, { ecc: 'M', border: 2 })
    const cells: string[] = []
    qr.data.forEach((row, y) => row.forEach((dark, x) => dark && cells.push(`M${x} ${y}h1v1h-1z`)))
    return { path: cells.join(''), n: qr.size }
  }, [value])
  return (
    <svg role="img" aria-label={label} width={size} height={size} viewBox={`0 0 ${n} ${n}`} shapeRendering="crispEdges" className={cx('rounded-xl bg-white', className)} data-qr={value}>
      <path d={path} fill="#000" />
    </svg>
  )
}
