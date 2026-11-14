'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useUi } from '@/lib/state/ui'
import { ApiError } from '@/lib/api/client'

function ThemeSync() {
  const theme = useUi((s) => s.theme)
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: light)')
    const apply = () => {
      document.documentElement.dataset.theme = theme === 'system' ? (media.matches ? 'light' : 'dark') : theme
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])
  return null
}

function ServiceWorker() {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  }, [])
  return null
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2 },
        },
      }),
  )
  return (
    <QueryClientProvider client={client}>
      <ThemeSync />
      <ServiceWorker />
      {children}
    </QueryClientProvider>
  )
}
