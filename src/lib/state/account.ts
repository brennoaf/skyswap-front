'use client'

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

interface AccountUi {
  nudgeDismissed: boolean
  dismissNudge: () => void
  offer: boolean
  offerProtection: () => void
  clearOffer: () => void
}

export const useAccountUi = create<AccountUi>()(
  persist(
    (set) => ({
      nudgeDismissed: false,
      dismissNudge: () => set({ nudgeDismissed: true }),
      offer: false,
      offerProtection: () => set({ offer: true }),
      clearOffer: () => set({ offer: false }),
    }),
    {
      name: 'skyswap-account',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ nudgeDismissed: s.nudgeDismissed }),
    },
  ),
)
