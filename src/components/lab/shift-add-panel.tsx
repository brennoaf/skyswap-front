'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { Button } from '@/components/ui/primitives'
import { peakSnr, type StackResult } from '@/lib/lab/shift-add'
import { runShiftAdd } from '@/lib/lab/stack'
import type { PackEpoch } from '@/lib/sky/lab'
import { useFmt } from '@/lib/use-fmt'

type Motion = { pmra: number; pmdec: number }
type Run = { status: 'idle' | 'running' | 'error' } | { status: 'done'; along: StackResult; still: StackResult; motion: Motion; ref: PackEpoch }

const PAD_REACH = 0.42

function finite(values: Float32Array): number[] {
  const out: number[] = []
  for (const v of values) if (Number.isFinite(v)) out.push(v)
  return out
}

function pct(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))))] ?? 0
}

function StackCanvas({ r, lo, hi, target, label }: { r: StackResult; lo: number; hi: number; target: [number, number]; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    c.width = r.nx
    c.height = r.ny
    const img = ctx.createImageData(r.nx, r.ny)
    for (let k = 0; k < r.nx * r.ny; k++) {
      const v = r.image[k] as number
      const g = Number.isFinite(v) ? Math.round(Math.sqrt(Math.max(0, Math.min(1, (v - lo) / (hi - lo || 1)))) * 255) : 0
      img.data[k * 4] = g
      img.data[k * 4 + 1] = g
      img.data[k * 4 + 2] = g
      img.data[k * 4 + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
  }, [r, lo, hi])
  return (
    <div className="relative w-full bg-media-bg" style={{ aspectRatio: `${r.nx} / ${r.ny}` }}>
      <canvas ref={ref} role="img" aria-label={label} className="pixelated absolute inset-0 size-full" />
      <svg className="pointer-events-none absolute inset-0 size-full" viewBox={`0 0 ${r.nx} ${r.ny}`} preserveAspectRatio="none" aria-hidden="true">
        <circle cx={target[0] + 0.5} cy={target[1] + 0.5} r={2.5} fill="none" stroke="var(--color-crosshair)" strokeWidth={0.25} />
      </svg>
    </div>
  )
}

function MotionPad({ motion, reach, north, east, onChange }: { motion: Motion; reach: number; north: string; east: string; onChange: (m: Motion) => void }) {
  const drag = useRef(false)
  const x = 50 - (motion.pmra / reach) * 100 * PAD_REACH
  const y = 50 - (motion.pmdec / reach) * 100 * PAD_REACH
  const set = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const u = ((e.clientX - r.left) / r.width - 0.5) / PAD_REACH
    const v = ((e.clientY - r.top) / r.height - 0.5) / PAD_REACH
    onChange({ pmra: Math.round(-u * reach), pmdec: Math.round(-v * reach) })
  }
  return (
    <svg
      viewBox="0 0 100 100"
      className="size-32 shrink-0 touch-none rounded-xl bg-bg"
      aria-hidden="true"
      onPointerDown={(e) => {
        drag.current = true
        e.currentTarget.setPointerCapture(e.pointerId)
        set(e)
      }}
      onPointerMove={(e) => drag.current && set(e)}
      onPointerUp={() => {
        drag.current = false
      }}
      onPointerCancel={() => {
        drag.current = false
      }}
    >
      <defs>
        <marker id="pad-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10Z" fill="var(--color-accent)" />
        </marker>
      </defs>
      <circle cx="50" cy="50" r={100 * PAD_REACH} fill="none" stroke="var(--color-divider)" strokeWidth="0.8" />
      <path d="M50 6V94M6 50H94" stroke="var(--color-divider)" strokeWidth="0.8" />
      <text x="50" y="5" textAnchor="middle" dominantBaseline="hanging" fontSize="9" fill="var(--color-text-secondary)">{north}</text>
      <text x="5" y="50" dominantBaseline="middle" fontSize="9" fill="var(--color-text-secondary)">{east}</text>
      {(motion.pmra !== 0 || motion.pmdec !== 0) && <line x1="50" y1="50" x2={x} y2={y} stroke="var(--color-accent)" strokeWidth="2.4" strokeLinecap="round" markerEnd="url(#pad-head)" />}
      <circle cx={x} cy={y} r="5" fill="var(--color-accent)" />
    </svg>
  )
}

export function ShiftAddPanel({ epochs, parts, refEpoch, catalog }: { epochs: PackEpoch[]; parts: Uint8Array[] | undefined; refEpoch: PackEpoch; catalog: Motion | null }) {
  const t = useTranslations('lab.stack')
  const fmt = useFmt()
  const [motion, setMotion] = useState<Motion>(catalog ?? { pmra: 0, pmdec: 0 })
  const [run, setRun] = useState<Run>({ status: 'idle' })
  const reach = Math.max(1000, 2 * Math.hypot(catalog?.pmra ?? 0, catalog?.pmdec ?? 0))
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const start = async () => {
    if (!parts) return
    const used = epochs.filter((e) => parts[e.index])
    setRun({ status: 'running' })
    const grid = { nx: refEpoch.nx, ny: refEpoch.ny, wcs: refEpoch.wcs, sip: refEpoch.sip }
    const res = await runShiftAdd(
      used.map((e) => parts[e.index] as Uint8Array),
      used.map((e) => ({ nx: e.nx, ny: e.ny, wcs: e.wcs, sip: e.sip, mjd: e.mjd })),
      grid,
      [
        { ...motion, refMjd: refEpoch.mjd },
        { pmra: 0, pmdec: 0, refMjd: refEpoch.mjd },
      ],
    ).catch(() => null)
    if (!alive.current) return
    const [along, still] = res ?? []
    setRun(along && still ? { status: 'done', along, still, motion, ref: refEpoch } : { status: 'error' })
  }

  const done = run.status === 'done' ? run : null
  const values = done ? [...finite(done.along.image), ...finite(done.still.image)].sort((a, b) => a - b) : []
  const lo = pct(values, 1)
  const hi = pct(values, 99.5)
  const field = (key: 'pmra' | 'pmdec') => (
    <label className="block text-note text-text-secondary">
      {t(key)}
      <input
        type="number"
        inputMode="decimal"
        step={10}
        value={motion[key]}
        onChange={(e) => setMotion((m) => ({ ...m, [key]: Number(e.target.value) || 0 }))}
        className="mt-1 h-11 w-full rounded-[var(--radius-input)] border-[0.5px] border-divider bg-bg px-3 text-body tabular-nums text-text"
      />
    </label>
  )

  return (
    <section className="rounded-2xl bg-surface p-3" aria-labelledby="stack-title">
      <h3 id="stack-title" className="text-ui font-semibold">
        {t('title')}
      </h3>
      <p className="mt-1 text-note leading-snug text-text-secondary">{t('body')}</p>
      <div className="mt-3 flex items-start gap-3">
        <MotionPad motion={motion} reach={reach} north={t('padNorth')} east={t('padEast')} onChange={setMotion} />
        <div className="min-w-0 flex-1 space-y-2">
          {field('pmra')}
          {field('pmdec')}
        </div>
      </div>
      <p className="mt-2 text-meta leading-snug text-text-secondary">{t('unit')}</p>
      <div className="mt-2 flex gap-2">
        {catalog && (
          <Button variant="ghost" className="h-11 flex-1 bg-bg px-2 text-body" onClick={() => setMotion(catalog)}>
            {t('useCatalog')}
          </Button>
        )}
        <Button variant="ghost" className="h-11 flex-1 bg-bg px-2 text-body" onClick={() => setMotion({ pmra: 0, pmdec: 0 })}>
          {t('zero')}
        </Button>
      </div>
      <Button variant="primary" className="mt-2 h-11 w-full" onClick={() => void start()} disabled={!parts || run.status === 'running'}>
        {run.status === 'running' ? t('running') : t('run')}
      </Button>
      <p className="mt-2 text-meta leading-snug text-text-secondary">{t('reference', { date: fmt.shortDate(refEpoch.iso), n: epochs.length })}</p>
      {run.status === 'error' && <p className="mt-2 text-note text-danger">{t('failed')}</p>}
      {done && (
        <div className="mt-3 grid grid-cols-2 gap-2" aria-live="polite">
          {[
            { r: done.along, name: t('along', { pmra: fmt.fixed(done.motion.pmra, 0), pmdec: fmt.fixed(done.motion.pmdec, 0) }) },
            { r: done.still, name: t('still') },
          ].map(({ r, name }) => (
            <figure key={name} className="min-w-0">
              <StackCanvas r={r} lo={lo} hi={hi} target={done.ref.target_xy} label={name} />
              <figcaption className="mt-1 text-meta leading-snug">
                <span className="block font-semibold">{name}</span>
                <span className="block text-text-secondary">{t('snr', { v: fmt.fixed(peakSnr(r, done.ref.target_xy[0], done.ref.target_xy[1]), 1), n: r.used })}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      {done && <p className="mt-2 text-meta text-text-secondary">{t('sameStretch')}</p>}
    </section>
  )
}
