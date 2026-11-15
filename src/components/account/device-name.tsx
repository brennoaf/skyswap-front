'use client'

import { useTranslations } from 'next-intl'
import { IconComputer, IconPhone } from '@/components/icons'

const SYSTEMS: Record<string, string> = { iphone: 'iPhone', ipad: 'iPad', android: 'Android', chromeos: 'Chromebook', windows: 'Windows', mac: 'Mac', linux: 'Linux' }
const BROWSERS: Record<string, string> = { samsung: 'Samsung Internet', edge: 'Edge', opera: 'Opera', firefox: 'Firefox', chrome: 'Chrome', safari: 'Safari' }
const COMPUTERS = new Set(['windows', 'mac', 'linux', 'chromeos'])

export function useDeviceName() {
  const t = useTranslations('account.device')
  return (device: string) => {
    const [system = 'other', browser = 'other'] = device.split(':')
    const name = SYSTEMS[system]
    if (!name) return t('other')
    const app = BROWSERS[browser]
    return app ? t('named', { browser: app, system: name }) : name
  }
}

export function DeviceIcon({ device, size = 26 }: { device: string; size?: number }) {
  return COMPUTERS.has(device.split(':')[0] ?? '') ? <IconComputer size={size} /> : <IconPhone size={size} />
}
