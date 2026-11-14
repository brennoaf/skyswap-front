import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('sky')
  return { title: t('embedTitle'), robots: { index: false } }
}

export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto min-h-dvh w-full max-w-[var(--width-app)] bg-bg text-text">{children}</div>
}
