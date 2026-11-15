'use client'

import { browserSupportsWebAuthn, startAuthentication, startRegistration, type PublicKeyCredentialCreationOptionsJSON, type PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ApiError, api, unwrap } from './client'
import type { paths } from './schema'
import { keys } from './hooks'

export type Account = paths['/api/auth/account']['get']['responses'][200]['content']['application/json']
export type Device = Account['devices'][number]

export const accountKey = ['account'] as const
export const PROTECT_AFTER_ANSWERS = 3
const POLL_MS = 2000
const LINK_TTL_MS = 120_000

type Json = Record<string, unknown>

export function isProtected(account: Account | undefined): boolean {
  return !!account && (account.passkeys > 0 || account.recovery)
}

const noop = () => () => {}

export function usePasskeySupport(): boolean | null {
  return useSyncExternalStore(
    noop,
    () => browserSupportsWebAuthn(),
    () => null,
  )
}

export function useAccount(enabled = true) {
  return useQuery({ queryKey: accountKey, enabled, queryFn: async () => unwrap(await api.GET('/api/auth/account')), staleTime: 60_000 })
}

export function useRemoveDevice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => unwrap(await api.DELETE('/api/auth/devices/{id}', { params: { path: { id } } })),
    onSuccess: (r) => (r.current ? qc.invalidateQueries() : qc.invalidateQueries({ queryKey: accountKey })),
  })
}

export function useCreatePasskey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const start = unwrap(await api.POST('/api/auth/passkey/register/options'))
      const response = await startRegistration({ optionsJSON: start.options as unknown as PublicKeyCredentialCreationOptionsJSON })
      return unwrap(await api.POST('/api/auth/passkey/register/verify', { body: { flow: start.flow, response: response as unknown as Json } }))
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: accountKey }),
  })
}

export function useNewRecoveryCode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => unwrap(await api.POST('/api/auth/recovery-code')).code,
    onSuccess: () => qc.invalidateQueries({ queryKey: accountKey }),
  })
}

export function usePasskeyLogin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const start = unwrap(await api.POST('/api/auth/passkey/login/options'))
      const response = await startAuthentication({ optionsJSON: start.options as unknown as PublicKeyCredentialRequestOptionsJSON })
      return unwrap(await api.POST('/api/auth/passkey/login/verify', { body: { flow: start.flow, response: response as unknown as Json } })).user
    },
    onSuccess: () => qc.invalidateQueries(),
  })
}

export function useRecover() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: { nickname: string; code: string }) => unwrap(await api.POST('/api/auth/recover', { body })),
    onSuccess: (r) => {
      qc.setQueryData(keys.session, r.user)
      void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== keys.session[0] })
    },
  })
}

export function useInspectLink() {
  return useMutation({ mutationFn: async (code: string) => unwrap(await api.POST('/api/auth/link/inspect', { body: { code } })) })
}

export function useApproveLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (code: string) => unwrap(await api.POST('/api/auth/link/approve', { body: { code } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: accountKey }),
  })
}

export type LinkLogin = { state: 'loading' | 'waiting' | 'expired' | 'error'; code: string | null; deadline: number }

export function useLinkLogin(active: boolean, onApproved: (nickname: string) => void) {
  const qc = useQueryClient()
  const [link, setLink] = useState<LinkLogin>({ state: 'loading', code: null, deadline: 0 })
  const [round, setRound] = useState(0)
  const approved = useRef(onApproved)
  useEffect(() => {
    approved.current = onApproved
  })
  const refresh = useCallback(() => setRound((r) => r + 1), [])

  useEffect(() => {
    if (!active) return
    let stop = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async (secret: string) => {
      if (stop) return
      const r = await api.POST('/api/auth/link/claim', { body: { poll: secret } }).catch(() => null)
      if (stop) return
      if (r?.data?.status === 'approved' && r.data.user) {
        qc.setQueryData(keys.session, r.data.user)
        void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== keys.session[0] })
        approved.current(r.data.user.nickname)
        return
      }
      if (r && (r.response.status === 410 || r.response.status === 409 || r.response.status === 404)) {
        setLink((l) => ({ ...l, state: 'expired' }))
        return
      }
      timer = setTimeout(() => void poll(secret), POLL_MS)
    }
    setLink({ state: 'loading', code: null, deadline: 0 })
    void (async () => {
      try {
        const created = unwrap(await api.POST('/api/auth/link'))
        if (stop) return
        setLink({ state: 'waiting', code: created.code, deadline: Date.now() + LINK_TTL_MS })
        timer = setTimeout(() => void poll(created.poll), POLL_MS)
      } catch (err) {
        if (!stop) setLink({ state: err instanceof ApiError && err.status === 429 ? 'expired' : 'error', code: null, deadline: 0 })
      }
    })()
    return () => {
      stop = true
      clearTimeout(timer)
    }
  }, [active, round, qc])

  return { ...link, refresh }
}
