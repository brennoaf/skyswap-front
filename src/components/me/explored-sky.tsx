'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import { Skeleton } from '@/components/ui/primitives'
import { useExploreCells, useExploreMap } from '@/lib/api/hooks'
import { hammer, pix2angNest } from '@/lib/explore/healpix'
import { cssColor, formatNumber } from '@/lib/format'

function useThemeKey() {
  const [key, setKey] = useState('')
  useEffect(() => {
    const el = document.documentElement
    const update = () => setKey(el.dataset.theme ?? '')
    update()
    const obs = new MutationObserver(update)
    obs.observe(el, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])
  return key
}

function SkyMap({ order, indexed, looks, label }: { order: number; indexed: number[]; looks: Map<number, number>; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const theme = useThemeKey()
  useEffect(() => {
    const c = ref.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = c.clientWidth
    const h = w / 2
    c.width = Math.round(w * dpr)
    c.height = Math.round(h * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    const cx = w / 2
    const cy = h / 2
    const rx = w / 2 - 2
    const ry = h / 2 - 2
    ctx.beginPath()
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
    ctx.fillStyle = cssColor('--color-bg', '#000')
    ctx.fill()
    ctx.strokeStyle = cssColor('--color-divider', '#444')
    ctx.lineWidth = 1
    ctx.stroke()
    const dot = Math.max(1.2, w / 260)
    const at = (cell: number) => {
      const [ra, dec] = pix2angNest(order, cell)
      const [x, y] = hammer(ra, dec)
      return [cx + x * rx, cy - y * ry] as const
    }
    ctx.fillStyle = cssColor('--color-ring-seen', '#888')
    ctx.globalAlpha = 0.55
    for (const cell of indexed) {
      if (looks.has(cell)) continue
      const [x, y] = at(cell)
      ctx.fillRect(x - dot / 2, y - dot / 2, dot, dot)
    }
    ctx.globalAlpha = 1
    ctx.fillStyle = cssColor('--color-accent', '#0095f6')
    const max = Math.max(1, ...looks.values())
    for (const [cell, n] of looks) {
      const [x, y] = at(cell)
      const r = dot * (1 + 1.6 * Math.sqrt(n / max))
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }
  }, [order, indexed, looks, theme])
  return <canvas ref={ref} role="img" aria-label={label} className="block aspect-[2/1] w-full" />
}

export function ExploredSkyCard() {
  const t = useTranslations('me.explored')
  const locale = useLocale()
  const map = useExploreMap()
  const cells = useExploreCells()
  const [looks, setLooks] = useState<Map<number, number>>(new Map())
  useEffect(() => {
    if (map.data) setLooks(new Map(map.data.cells.map((c) => [c.cell, c.looks])))
  }, [map.data])
  const d = map.data
  return (
    <section id="explored" aria-labelledby="me-explored" className="mx-4 mt-5 scroll-mt-[calc(var(--height-topbar)+12px)] rounded-2xl bg-surface p-4">
      <h2 id="me-explored" className="text-body font-semibold">
        {t('title')}
      </h2>
      <div className="mt-3">
        {d && cells.data ? (
          <SkyMap order={d.order} indexed={cells.data} looks={looks} label={t('alt', { cells: formatNumber(d.cells.length, locale), indexed: formatNumber(d.indexed, locale) })} />
        ) : (
          <Skeleton className="aspect-[2/1] w-full rounded-full" />
        )}
      </div>
      {d && (
        <>
          <p className="mt-3 text-note">
            {d.looks ? t('summary', { looks: d.looks, people: d.people, cells: d.cells.length, indexed: formatNumber(d.indexed, locale) }) : t('empty')}
          </p>
          {d.mine.looks > 0 && <p className="mt-1 text-note text-text-secondary">{t('mine', { looks: d.mine.looks, cells: d.mine.cells })}</p>}
        </>
      )}
      <p className="mt-2 text-meta text-text-secondary">{t('body')}</p>
    </section>
  )
}
