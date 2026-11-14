'use client'

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type ThemePref = 'system' | 'dark' | 'light'

export type Toast =
  | { kind: 'xp'; xp: number; streak: boolean }
  | { kind: 'badge'; badge: string }
  | { kind: 'info'; key: string; values?: Record<string, string | number> }

interface PersistedUi {
  theme: ThemePref
  seenStories: string[]
  onboardingDone: boolean
  classifyGuideDone: boolean
  saved: string[]
  recentSearches: string[]
  crosshair: boolean
  speed: number
}

interface UiState extends PersistedUi {
  toasts: (Toast & { id: number })[]
  authReason: string | null
  storyStart: string | null
  setTheme: (t: ThemePref) => void
  markStorySeen: (id: string) => void
  finishOnboarding: () => void
  resetOnboarding: () => void
  finishClassifyGuide: () => void
  toggleSaved: (postId: string) => void
  addRecentSearch: (q: string) => void
  clearRecentSearches: () => void
  setCrosshair: (on: boolean) => void
  setSpeed: (s: number) => void
  toast: (t: Toast) => void
  dismissToast: (id: number) => void
  askLogin: (reason: string) => void
  closeLogin: () => void
  openStory: (objectId: string | null) => void
}

let toastId = 0

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      theme: 'system',
      seenStories: [],
      onboardingDone: false,
      classifyGuideDone: false,
      saved: [],
      recentSearches: [],
      crosshair: true,
      speed: 1,
      toasts: [],
      authReason: null,
      storyStart: null,
      setTheme: (theme) => set({ theme }),
      markStorySeen: (id) => set((s) => (s.seenStories.includes(id) ? s : { seenStories: [...s.seenStories, id] })),
      finishOnboarding: () => set({ onboardingDone: true }),
      resetOnboarding: () => set({ onboardingDone: false, classifyGuideDone: false }),
      finishClassifyGuide: () => set({ classifyGuideDone: true }),
      toggleSaved: (postId) => set((s) => ({ saved: s.saved.includes(postId) ? s.saved.filter((p) => p !== postId) : [postId, ...s.saved] })),
      addRecentSearch: (q) => set((s) => ({ recentSearches: [q, ...s.recentSearches.filter((x) => x !== q)].slice(0, 8) })),
      clearRecentSearches: () => set({ recentSearches: [] }),
      setCrosshair: (crosshair) => set({ crosshair }),
      setSpeed: (speed) => set({ speed }),
      toast: (t) => set((s) => ({ toasts: [...s.toasts, { ...t, id: ++toastId }].slice(-3) })),
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
      askLogin: (authReason) => set({ authReason }),
      closeLogin: () => set({ authReason: null }),
      openStory: (storyStart) => set({ storyStart }),
    }),
    {
      name: 'skyswap-ui',
      storage: createJSONStorage(() => localStorage),
      partialize: (s): PersistedUi => ({
        theme: s.theme,
        seenStories: s.seenStories,
        onboardingDone: s.onboardingDone,
        classifyGuideDone: s.classifyGuideDone,
        saved: s.saved,
        recentSearches: s.recentSearches,
        crosshair: s.crosshair,
        speed: s.speed,
      }),
    },
  ),
)
