'use client'

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type ThemePref = 'system' | 'dark' | 'light'

export type Toast =
  | { kind: 'xp'; xp: number; streak: boolean }
  | { kind: 'badge'; badge: string }
  | { kind: 'info'; key: string; values?: Record<string, string | number> }

export type SkyChoice = { band: string | null; fov: number }

export const FINDS_STORY = 'finds'

export const storyFresh = (seen: Record<string, string>, id: string, lastSeen: string) => !(id in seen) || (seen[id] ?? '') < lastSeen

interface PersistedUi {
  theme: ThemePref
  storySeen: Record<string, string>
  seenFinds: string[]
  languageChosen: boolean
  onboardingDone: boolean
  labIntroDone: boolean
  classifyGuideDone: boolean
  tipsSeen: string[]
  homeHintDismissed: boolean
  saved: string[]
  recentSearches: string[]
  crosshair: boolean
  speed: number
  skyChoice: SkyChoice | null
}

interface UiState extends PersistedUi {
  toasts: (Toast & { id: number })[]
  authReason: string | null
  storyStart: string | null
  setTheme: (t: ThemePref) => void
  markStorySeen: (id: string, lastSeen: string) => void
  markFindSeen: (id: string) => void
  chooseLanguage: () => void
  finishOnboarding: () => void
  resetOnboarding: () => void
  finishLabIntro: () => void
  finishClassifyGuide: () => void
  markTip: (key: string) => void
  dismissHomeHint: () => void
  toggleSaved: (postId: string) => void
  addRecentSearch: (q: string) => void
  clearRecentSearches: () => void
  setCrosshair: (on: boolean) => void
  setSpeed: (s: number) => void
  setSkyChoice: (c: SkyChoice) => void
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
      storySeen: {},
      seenFinds: [],
      languageChosen: false,
      onboardingDone: false,
      labIntroDone: false,
      classifyGuideDone: false,
      tipsSeen: [],
      homeHintDismissed: false,
      saved: [],
      recentSearches: [],
      crosshair: true,
      speed: 1,
      skyChoice: null,
      toasts: [],
      authReason: null,
      storyStart: null,
      setTheme: (theme) => set({ theme }),
      markStorySeen: (id, lastSeen) => set((s) => (s.storySeen[id] === lastSeen ? s : { storySeen: { ...s.storySeen, [id]: lastSeen } })),
      markFindSeen: (id) => set((s) => (s.seenFinds.includes(id) ? s : { seenFinds: [...s.seenFinds, id].slice(-50) })),
      chooseLanguage: () => set({ languageChosen: true }),
      finishOnboarding: () => set({ onboardingDone: true }),
      resetOnboarding: () => set({ onboardingDone: false, labIntroDone: false, classifyGuideDone: false, tipsSeen: [], homeHintDismissed: false }),
      finishLabIntro: () => set({ labIntroDone: true }),
      finishClassifyGuide: () => set({ classifyGuideDone: true }),
      markTip: (key) => set((s) => (s.tipsSeen.includes(key) ? s : { tipsSeen: [...s.tipsSeen, key] })),
      dismissHomeHint: () => set({ homeHintDismissed: true }),
      toggleSaved: (postId) => set((s) => ({ saved: s.saved.includes(postId) ? s.saved.filter((p) => p !== postId) : [postId, ...s.saved] })),
      addRecentSearch: (q) => set((s) => ({ recentSearches: [q, ...s.recentSearches.filter((x) => x !== q)].slice(0, 8) })),
      clearRecentSearches: () => set({ recentSearches: [] }),
      setCrosshair: (crosshair) => set({ crosshair }),
      setSpeed: (speed) => set({ speed }),
      setSkyChoice: (skyChoice) => set({ skyChoice }),
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
        storySeen: s.storySeen,
        seenFinds: s.seenFinds,
        languageChosen: s.languageChosen,
        onboardingDone: s.onboardingDone,
        labIntroDone: s.labIntroDone,
        classifyGuideDone: s.classifyGuideDone,
        tipsSeen: s.tipsSeen,
        homeHintDismissed: s.homeHintDismissed,
        saved: s.saved,
        recentSearches: s.recentSearches,
        crosshair: s.crosshair,
        speed: s.speed,
        skyChoice: s.skyChoice,
      }),
    },
  ),
)
