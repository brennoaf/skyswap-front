'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import { IconDownload, IconLock, IconUpload } from '@/components/icons'
import { allNotes, download, getNote, notesFromText, notesToText, saveNote } from '@/lib/notes'
import { useUi } from '@/lib/state/ui'

export function NotesPanel({ postId, objectId, title }: { postId: string; objectId: string; title: string }) {
  const t = useTranslations('viewer')
  const toast = useUi((s) => s.toast)
  const [text, setText] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const loaded = useRef(false)
  const file = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loaded.current = false
    void getNote(postId).then((n) => {
      setText(n?.text ?? '')
      loaded.current = true
    })
  }, [postId])

  useEffect(() => {
    if (!loaded.current) return
    setStatus('saving')
    const timer = setTimeout(() => {
      void saveNote({ postId, objectId, title, text, updatedAt: Date.now() }).then(() => setStatus('saved'))
    }, 500)
    return () => clearTimeout(timer)
  }, [text, postId, objectId, title])

  return (
    <section aria-labelledby="notes-title" className="rounded-2xl bg-surface p-3">
      <div className="flex items-center gap-2">
        <IconLock size={20} className="text-text-secondary" />
        <h3 id="notes-title" className="flex-1 text-[15px] font-semibold">
          {t('notes')}
        </h3>
        <span className="text-[12px] text-text-secondary" aria-live="polite">
          {status === 'saved' && text ? t('notesSaved') : ''}
        </span>
      </div>
      <p className="mt-1 text-[12px] text-text-secondary">{t('notesHint')}</p>
      <label htmlFor="private-note" className="sr-only">
        {t('notes')}
      </label>
      <textarea
        id="private-note"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder={t('notesPlaceholder')}
        className="mt-2 w-full resize-y rounded-[var(--radius-input)] border-[0.5px] border-divider bg-bg px-3 py-2 text-[14px] outline-none focus:border-text"
      />
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          className="inline-flex h-9 items-center gap-1 rounded-[var(--radius-button)] bg-bg px-3 text-[14px] font-medium"
          onClick={async () => download(`skyswap-notes-${new Date().toISOString().slice(0, 10)}.txt`, notesToText(await allNotes()))}
        >
          <IconDownload size={20} />
          {t('notesExport')}
        </button>
        <button type="button" className="inline-flex h-9 items-center gap-1 rounded-[var(--radius-button)] bg-bg px-3 text-[14px] font-medium" onClick={() => file.current?.click()}>
          <IconUpload size={20} />
          {t('notesImport')}
        </button>
        <input
          ref={file}
          type="file"
          accept=".txt,text/plain"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            if (!f) return
            const notes = notesFromText(await f.text())
            for (const n of notes) await saveNote(n)
            const mine = notes.find((n) => n.postId === postId)
            if (mine) setText(mine.text)
            toast({ kind: 'info', key: 'viewer.notesImported', values: { n: notes.length } })
            e.target.value = ''
          }}
        />
      </div>
    </section>
  )
}
