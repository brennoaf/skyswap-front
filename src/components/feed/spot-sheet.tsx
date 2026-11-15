'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Button, Notice, Sheet } from '@/components/ui/primitives'
import { IconWarning } from '@/components/icons'
import { api, unwrap } from '@/lib/api/client'
import { formatDec, formatRa } from '@/lib/format'
import { spotName, spotObject } from '@/lib/search-direct'

export function skyHref(p: { ra: number; dec: number; fov?: number; band?: string | null; name?: string | null; obj?: string | null }) {
  const q = new URLSearchParams({ ra: p.ra.toFixed(5), dec: p.dec.toFixed(5), fov: String(p.fov ?? 0.1) })
  if (p.band) q.set('band', p.band)
  if (p.name) q.set('name', p.name)
  if (p.obj) q.set('obj', p.obj)
  return `/sky?${q}`
}

export function SpotSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('spot')
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stale, setStale] = useState<{ href: string; name: string | null; moved: number | null; ra: number; dec: number } | null>(null)

  const submit = async () => {
    setBusy(true)
    setError(null)
    setStale(null)
    try {
      const r = unwrap(await api.GET('/api/search', { params: { query: { q: query } } }))
      if (!r.spot) {
        setError(t('notFound'))
        return
      }
      const href = skyHref({ ra: r.spot.ra, dec: r.spot.dec, name: spotName(r), obj: spotObject(r) })
      if (r.spot.stale) {
        setStale({ href, name: spotName(r), moved: r.spot.moved_arcsec, ra: r.spot.ra, dec: r.spot.dec })
        return
      }
      onClose()
      router.push(href)
    } catch {
      setError(t('failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('title')}>
      <form
        className="flex flex-col gap-3 px-4 py-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (query.trim()) void submit()
        }}
      >
        <p className="text-body text-text-secondary">{t('intro')}</p>
        <label className="sr-only" htmlFor="spot-query">
          {t('label')}
        </label>
        <input
          id="spot-query"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('placeholder')}
          className="h-11 rounded-[var(--radius-input)] border-[0.5px] border-divider bg-surface px-3 text-ui outline-none focus:border-text"
        />
        <div className="flex flex-wrap gap-2 text-note">
          {['WISE 0855-0714', '269.4485 4.7395', '17 57 48.5 +04 41 36'].map((ex) => (
            <button key={ex} type="button" onClick={() => setQuery(ex)} className="rounded-full bg-surface px-3 py-1.5 text-text-secondary">
              {ex}
            </button>
          ))}
        </div>
        {error && <p className="text-note text-danger">{error}</p>}
        {stale && (
          <Notice tone="warning" icon={<IconWarning size={20} />}>
            <p>{stale.moved !== null ? t('stale', { moved: stale.moved.toFixed(1) }) : t('staleUnknown')}</p>
            <p className="mt-1 text-text-secondary">
              {formatRa(stale.ra)} {formatDec(stale.dec)}
            </p>
            <Button
              variant="primary"
              className="mt-2"
              onClick={() => {
                onClose()
                router.push(stale.href)
              }}
            >
              {t('watchAnyway')}
            </Button>
          </Notice>
        )}
        <Button type="submit" variant="primary" full className="h-11" disabled={!query.trim() || busy}>
          {busy ? t('resolving') : t('watch')}
        </Button>
      </form>
    </Sheet>
  )
}
