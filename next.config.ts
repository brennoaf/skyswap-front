import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const apiUrl = process.env.SKYSWAP_API_URL ?? 'http://127.0.0.1:4000'

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  images: { unoptimized: true },
  devIndicators: false,
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${apiUrl}/api/:path*` },
      { source: '/kit/:path*', destination: `${apiUrl}/kit/:path*` },
    ]
  },
  async headers() {
    return [{ source: '/embed', headers: [{ key: 'Content-Security-Policy', value: 'frame-ancestors *' }] }]
  },
}

export default createNextIntlPlugin('./src/i18n/request.ts')(nextConfig)
