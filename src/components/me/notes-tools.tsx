'use client'

import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { IconDownload, IconUpload } from '@/components/icons'
import { Button } from '@/components/ui/primitives'
import { allNotes, download, notesFromText, notesToText, saveNote, type PrivateNote } from '@/lib/notes'
import { useUi } from '@/lib/state/ui'

export function usePrivateNotes() {
  const [notes, setNotes] = useState<PrivateNote[] | null>(null)
  const reload = useCallback(async () => {
    try {
      setNotes(await allNotes())
    } catch {
      setNotes([])
    }
  }, [])
  useEffect(() => {
    void reload()
  }, [reload])
  return { notes, reload }
}

export function NotesActions({ notes, onImported, className }: { notes: PrivateNote[] | null; onImported: () => void; className?: string }) {
  const t = useTranslations('viewer')
  const toast = useUi((s) => s.toast)
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    try {
      const imported = notesFromText(await file.text())
      for (const note of imported) await saveNote(note)
      toast({ kind: 'info', key: 'viewer.notesImported', values: { n: imported.length } })
      onImported()
    } catch {
      toast({ kind: 'info', key: 'auth.errors.generic' })
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div className={className ?? 'flex gap-2'}>
      <Button className="flex-1" disabled={!notes?.length} onClick={() => notes && download(`skyswap-notes-${new Date().toISOString().slice(0, 10)}.txt`, notesToText(notes))}>
        <IconDownload size={20} />
        {t('notesExport')}
      </Button>
      <Button className="flex-1" disabled={busy} onClick={() => input.current?.click()}>
        <IconUpload size={20} />
        {t('notesImport')}
      </Button>
      <input ref={input} type="file" accept=".txt,text/plain" className="hidden" tabIndex={-1} aria-hidden="true" onChange={(e) => void onFile(e.target.files?.[0])} />
    </div>
  )
}
