'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { IconChevronRight, IconFlask } from '@/components/icons'
import { Button, EmptyState, ObjectAvatar, Skeleton, TopBar } from '@/components/ui/primitives'
import { useObjects } from '@/lib/api/hooks'
import { parseCoordinates, pointLabHref } from '@/lib/coords'

function CoordField() {
  const t = useTranslations('lab.coord')
  const router = useRouter()
  const [text, setText] = useState('')
  const [bad, setBad] = useState(false)
  return (
    <form
      className="px-4 pb-3 pt-2"
      onSubmit={(e) => {
        e.preventDefault()
        const at = parseCoordinates(text)
        if (!at) return setBad(true)
        router.push(pointLabHref(at.ra, at.dec))
      }}
      data-testid="lab-coord"
    >
      <label htmlFor="lab-coord" className="text-note font-semibold">
        {t('label')}
      </label>
      <div className="mt-1.5 flex gap-2">
        <input
          id="lab-coord"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setBad(false)
          }}
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          placeholder={t('placeholder')}
          aria-invalid={bad}
          aria-describedby={bad ? 'lab-coord-error' : undefined}
          className="h-11 min-w-0 flex-1 rounded-[var(--radius-input)] border-[0.5px] border-divider bg-surface px-3 text-body tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        <Button type="submit" variant="primary" className="h-11 shrink-0 px-4" disabled={!text.trim()}>
          {t('open')}
        </Button>
      </div>
      {bad && (
        <p id="lab-coord-error" role="alert" className="pt-1.5 text-note text-danger">
          {t('invalid')}
        </p>
      )}
    </form>
  )
}

export default function LabPickerPage() {
  const t = useTranslations('lab')
  const tp = useTranslations('post')
  const th = useTranslations('home')
  const objects = useObjects()
  return (
    <main className="pb-6">
      <TopBar title={t('title')} />
      <CoordField />
      <h2 className="px-4 pt-1 text-ui font-semibold">{t('picker.title')}</h2>
      <p className="flex items-center gap-2 px-4 pb-2 pt-0.5 text-note leading-snug text-text-secondary">
        <IconFlask size={18} className="shrink-0" />
        {t('picker.intro')}
      </p>
      {objects.isLoading && (
        <div aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2">
              <Skeleton className="size-11 rounded-full" />
              <Skeleton className="h-3 w-40" />
            </div>
          ))}
        </div>
      )}
      {objects.isError && <EmptyState title={th('errorTitle')} body={th('errorBody')} action={<Button onClick={() => objects.refetch()}>{th('retry')}</Button>} />}
      <ul>
        {objects.data?.map((o) => {
          const kindKey = `kinds.${o.kind}`
          return (
            <li key={o.id}>
              <Link href={`/lab/${o.id}`} className="flex min-h-[60px] items-center gap-3 px-4 py-2 active:bg-surface">
                <ObjectAvatar src={o.avatar} alt="" size={44} />
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-body font-semibold">{o.name}</span>
                  <span className="block truncate text-body text-text-secondary">{tp.has(kindKey) ? tp(kindKey) : o.kind}</span>
                </span>
                <IconChevronRight size={20} className="shrink-0 text-text-secondary" />
              </Link>
            </li>
          )
        })}
      </ul>
    </main>
  )
}
