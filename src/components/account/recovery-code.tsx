'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { IconCheck, IconCopy, IconWarning } from '@/components/icons'
import { Button, Notice } from '@/components/ui/primitives'

export function RecoveryCodeView({ code, fresh = false, onDone }: { code: string; fresh?: boolean; onDone: () => void }) {
  const t = useTranslations('account.code')
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    const ok = await navigator.clipboard?.writeText(code).then(
      () => true,
      () => false,
    )
    setCopied(!!ok)
  }
  return (
    <div className="flex flex-col gap-4 px-6 pb-4 pt-2">
      <div className="text-center">
        <h2 id="recovery-title" className="font-[family-name:var(--font-display)] text-title-md font-bold">
          {fresh ? t('newTitle') : t('title')}
        </h2>
        <p className="mt-1 text-body text-text-secondary">{t('body')}</p>
      </div>
      <div className="flex flex-col items-center gap-2 rounded-2xl bg-surface px-4 py-5">
        <output aria-label={t('label', { code })} data-testid="recovery-code" className="select-all font-mono text-[26px] font-semibold tabular-nums tracking-[0.12em]">
          {code}
        </output>
        <Button variant="ghost" onClick={() => void copy()} aria-live="polite" className="h-9">
          {copied ? <IconCheck size={20} /> : <IconCopy size={20} />}
          {copied ? t('copied') : t('copy')}
        </Button>
      </div>
      {fresh && <p className="text-center text-note text-text-secondary">{t('used')}</p>}
      <Notice tone="warning" icon={<IconWarning size={20} />}>
        {t('warning')}
      </Notice>
      <Button variant="primary" full onClick={onDone} className="h-12 rounded-full font-semibold">
        {t('done')}
      </Button>
    </div>
  )
}
