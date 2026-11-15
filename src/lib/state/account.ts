'use client'

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

interface AccountUi {
  nudgeDismissed: boolean
  dismissNudge: () => void
}

export const useAccountUi = create<AccountUi>()(
  persist((set) => ({ nudgeDismissed: false, dismissNudge: () => set({ nudgeDismissed: true }) }), {
    name: 'skyswap-account',
    storage: createJSONStorage(() => localStorage),
    partialize: (s) => ({ nudgeDismissed: s.nudgeDismissed }),
  }),
)
