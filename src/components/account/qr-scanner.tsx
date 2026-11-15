'use client'

import { useEffect, useRef, useState } from 'react'
import { linkCodeFrom } from '@/lib/link-code'

type Detected = { rawValue: string }
type Detector = { detect: (source: HTMLVideoElement) => Promise<Detected[]> }
type DetectorClass = { new (options: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> }
type Reader = (video: HTMLVideoElement) => Promise<string | null>

export type ScannerState = 'starting' | 'scanning' | 'denied' | 'unavailable'

const EVERY_MS = 250

async function makeReader(): Promise<Reader> {
  const Native = (window as unknown as { BarcodeDetector?: DetectorClass }).BarcodeDetector
  if (Native && (await Native.getSupportedFormats?.().catch((): string[] => []))?.includes('qr_code')) {
    const detector = new Native({ formats: ['qr_code'] })
    return async (video) => (await detector.detect(video).catch(() => []))[0]?.rawValue ?? null
  }
  const { default: jsQR } = await import('jsqr')
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  return async (video) => {
    if (!ctx || !video.videoWidth) return null
    const scale = Math.min(1, 640 / video.videoWidth)
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
    return jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' })?.data ?? null
  }
}

export function QrScanner({ label, onCode, onState }: { label: string; onCode: (code: string) => void; onState?: (state: ScannerState) => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [state, setState] = useState<ScannerState>('starting')
  const found = useRef(onCode)
  const report = useRef(onState)
  useEffect(() => {
    found.current = onCode
    report.current = onState
  })

  useEffect(() => {
    report.current?.(state)
  }, [state])

  useEffect(() => {
    let stream: MediaStream | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    let stop = false
    void (async () => {
      if (!navigator.mediaDevices?.getUserMedia) return setState('unavailable')
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      } catch (err) {
        return setState(err instanceof DOMException && err.name === 'NotAllowedError' ? 'denied' : 'unavailable')
      }
      const el = video.current
      if (stop || !el) return stream.getTracks().forEach((t) => t.stop())
      el.srcObject = stream
      await el.play().catch(() => undefined)
      const read = await makeReader()
      setState('scanning')
      const tick = async () => {
        if (stop) return
        const code = linkCodeFrom((await read(el)) ?? '')
        if (code && !stop) return found.current(code)
        timer = setTimeout(() => void tick(), EVERY_MS)
      }
      void tick()
    })()
    return () => {
      stop = true
      clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[340px] overflow-hidden rounded-2xl bg-media-bg">
      <video ref={video} aria-label={label} muted playsInline className="size-full object-cover" />
      {state === 'scanning' && <span aria-hidden="true" className="absolute inset-[18%] rounded-2xl border-2 border-on-media/90 shadow-[0_0_0_999px_var(--color-media-scrim)]" />}
    </div>
  )
}
