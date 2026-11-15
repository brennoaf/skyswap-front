'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { IconLink } from '@/components/icons'
import { catalogLinks } from '@/lib/catalogs'

export function CatalogLinks({ ra, dec, skyLink = true, bare = false, className }: { ra: number; dec: number; skyLink?: boolean; bare?: boolean; className?: string }) {
  const t = useTranslations('catalogs')
  const links = catalogLinks(ra, dec).filter((l) => skyLink || l.external)
  if (!links.length) return null
  const row = 'flex min-h-11 items-center gap-3 text-body text-link'
  return (
    <section aria-labelledby="catalogs-title" className={className}>
      {!bare && (
        <h3 id="catalogs-title" className="text-ui font-semibold">
          {t('title')}
        </h3>
      )}
      <p className={bare ? 'text-note text-text-secondary' : 'mt-1 text-note text-text-secondary'}>{t('hint')}</p>
      <ul className="mt-1 divide-y-[0.5px] divide-divider">
        {links.map((l) => (
          <li key={l.id}>
            {l.external ? (
              <a href={l.url} target="_blank" rel="noopener noreferrer" className={row}>
                <span className="min-w-0 flex-1">
                  <span className="block">{t(`names.${l.id}`)}</span>
                  <span className="block text-meta text-text-secondary">{t(`what.${l.id}`)}</span>
                </span>
                <IconLink size={20} className="shrink-0 text-icon-muted" />
              </a>
            ) : (
              <Link href={l.url} className={row}>
                <span className="min-w-0 flex-1">
                  <span className="block">{t(`names.${l.id}`)}</span>
                  <span className="block text-meta text-text-secondary">{t(`what.${l.id}`)}</span>
                </span>
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
