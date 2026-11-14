import { BottomNav } from '@/components/shell/bottom-nav'
import { LoginSheet } from '@/components/shell/login-sheet'
import { Onboarding } from '@/components/shell/onboarding'
import { StoryViewer } from '@/components/shell/story-viewer'
import { Toaster } from '@/components/shell/toaster'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh w-full max-w-[var(--width-app)] bg-bg pb-[calc(var(--height-bottomnav)+env(safe-area-inset-bottom))] lg:border-x-[0.5px] lg:border-border">
      {children}
      <BottomNav />
      <StoryViewer />
      <LoginSheet />
      <Onboarding />
      <Toaster />
    </div>
  )
}
