'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import { IconLock } from '@/components/icons'
import { NotesActions, usePrivateNotes } from '@/components/me/notes-tools'
import { getNote, saveNote } from '@/lib/notes'

export function NotesPanel({ postId, objectId, title }: { postId: string; objectId: string; title: string }) {
  const t = useTranslations('viewer')
  const [text, setText] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const loaded = useRef(false)
  const pending = useRef<string | null>(null)
  const { notes, reload } = usePrivateNotes()

  useEffect(() => {
    loaded.current = false
    void getNote(postId).then((n) => {
      setText(n?.text ?? '')
      loaded.current = true
    })
  }, [postId])

  useEffect(() => {
    if (!loaded.current) return
    pending.current = text
    setStatus('saving')
    const timer = setTimeout(() => {
      pending.current = null
      void saveNote({ postId, objectId, title, text, updatedAt: Date.now() }).then(() => {
        setStatus('saved')
        void reload()
      })
    }, 400)
    return () => clearTimeout(timer)
  }, [text, postId, objectId, title, reload])

  useEffect(
    () => () => {
      if (pending.current !== null) void saveNote({ postId, objectId, title, text: pending.current, updatedAt: Date.now() })
    },
    [postId, objectId, title],
  )

  return (
    <section aria-labelledby="notes-title" className="px-4 pb-2 pt-3">
      <div className="flex items-center gap-2">
        <IconLock size={20} className="text-text-secondary" />
        <h3 id="notes-title" className="flex-1 text-ui font-semibold">
          {t('notes')}
        </h3>
        <span className="text-meta text-text-secondary" aria-live="polite">
          {status === 'saved' && text.trim() ? t('notesSaved') : ''}
        </span>
      </div>
      <p className="mt-1 text-meta text-text-secondary">{t('notesHint')}</p>
      <label htmlFor="private-note" className="sr-only">
        {t('notes')}
      </label>
      <textarea
        id="private-note"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder={t('notesPlaceholder')}
        className="mt-3 w-full resize-y rounded-[var(--radius-input)] border-[0.5px] border-divider bg-surface px-3 py-2 text-body outline-none focus:border-text"
      />
      <NotesActions
        notes={notes}
        className="mt-3 flex gap-2"
        onImported={async () => {
          await reload()
          const mine = await getNote(postId)
          if (mine) setText(mine.text)
        }}
      />
    </section>
  )
}
