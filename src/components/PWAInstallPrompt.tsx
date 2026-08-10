import { useEffect, useState } from 'react'
import { X, Download } from 'lucide-react'
import { track } from '../lib/analytics'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'tabmate-pwa-dismissed'

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showBanner, setShowBanner] = useState(false)
  const [isIOS, setIsIOS] = useState(false)

  useEffect(() => {
    if (sessionStorage.getItem(DISMISS_KEY)) return

    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    if (isStandalone) return

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
    setIsIOS(ios)

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setShowBanner(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  useEffect(() => {
    if (isIOS && !sessionStorage.getItem(DISMISS_KEY)) {
      const t = setTimeout(() => setShowBanner(true), 4000)
      return () => clearTimeout(t)
    }
  }, [isIOS])

  if (!showBanner) return null

  const dismiss = () => {
    setShowBanner(false)
    sessionStorage.setItem(DISMISS_KEY, '1')
    track('pwa_prompt_clicked', { action: 'dismissed' })
  }

  const install = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt()
      const choice = await deferredPrompt.userChoice
      track('pwa_prompt_clicked', { action: choice.outcome === 'accepted' ? 'installed' : 'dismissed' })
      dismiss()
      setDeferredPrompt(null)
    } else {
      dismiss()
    }
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 animate-fade-in">
      <div className="mx-auto max-w-md m-3 mb-[env(safe-area-inset-bottom)] rounded-2xl bg-neutral-900 text-white shadow-2xl p-4 flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-600">
          <Download className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Save Tabmate to your home screen</p>
          <p className="text-xs text-neutral-400 mt-0.5">
            {isIOS
              ? 'Tap Share → Add to Home Screen'
              : 'Install in 1 tap — works like an app'}
          </p>
        </div>
        {!isIOS && (
          <button
            onClick={install}
            className="rounded-lg bg-primary-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-primary-700 transition-colors active:scale-[0.97] shrink-0"
          >
            Install
          </button>
        )}
        <button
          onClick={dismiss}
          className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors shrink-0"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}