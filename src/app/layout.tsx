import type { Metadata, Viewport } from 'next'
import { Grand_Hotel, Inter } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages, getTranslations } from 'next-intl/server'
import { Providers } from '@/components/providers'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const wordmark = Grand_Hotel({ subsets: ['latin'], weight: '400', variable: '--font-wordmark-face', display: 'swap' })

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta')
  return { title: { default: t('title'), template: `%s · ${t('title')}` }, description: t('description'), icons: { icon: '/icon.svg' } }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0a1014' },
    { media: '(prefers-color-scheme: light)', color: '#f8f8f9' },
  ],
}

const themeScript = `(function(){try{var s=JSON.parse(localStorage.getItem('skyswap-ui')||'{}');var t=(s.state&&s.state.theme)||'system';if(t==='system'){t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='dark'}})()`

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  const messages = await getMessages()
  return (
    <html lang={locale} data-theme="dark" suppressHydrationWarning className={`${inter.variable} ${wordmark.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
