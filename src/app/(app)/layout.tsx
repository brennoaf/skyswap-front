import { BottomNav } from '@/components/shell/bottom-nav'
import { LanguageSetup, type LanguageOption } from '@/components/shell/language-setup'
import { LoginSheet } from '@/components/shell/login-sheet'
import { Onboarding } from '@/components/shell/onboarding'
import { StoryViewer } from '@/components/shell/story-viewer'
import { Toaster } from '@/components/shell/toaster'
import { locales } from '@/i18n/locales'

async function languageOptions(): Promise<LanguageOption[]> {
  return Promise.all(locales.map(async (locale) => ({ locale, ...(await import(`../../../messages/${locale}.json`)).default.languageSetup })))
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const options = await languageOptions()
  return (
    <div className="mx-auto min-h-dvh w-full max-w-[var(--width-app)] bg-bg pb-[calc(var(--height-bottomnav)+env(safe-area-inset-bottom))] lg:border-x-[0.5px] lg:border-border">
      {children}
      <BottomNav />
      <StoryViewer />
      <LoginSheet />
      <LanguageSetup options={options} />
      <Onboarding />
      <Toaster />
    </div>
  )
}
