import { useEffect, useState } from 'react'
import { Share2, Copy, Check, X, MessageCircle, Mail } from 'lucide-react'
import { track } from '../lib/analytics'

interface ShareSheetProps {
  url: string
  title: string
  onClose: () => void
}

interface ShareTarget {
  icon: React.ReactNode
  label: string
  color: string
  onClick: () => void
}

export default function ShareSheet({ url, title, onClose }: ShareSheetProps) {
  const [copied, setCopied] = useState(false)
  const shareText = `Settle up on Tabmate: ${title}`
  const encodedUrl = encodeURIComponent(url)
  const encodedText = encodeURIComponent(shareText)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  function copyLink() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      track('share_link_copied', { source: 'share_sheet' })
    })
  }

  const targets: ShareTarget[] = [
    {
      icon: <WhatsAppIcon />,
      label: 'WhatsApp',
      color: 'bg-[#25D366] text-white',
      onClick: () => {
        window.open(`https://wa.me/?text=${encodedText}%20${encodedUrl}`, '_blank', 'noopener,noreferrer')
        track('share_target_clicked', { target: 'whatsapp' })
      },
    },
    {
      icon: <MessageCircle className="h-6 w-6" />,
      label: 'Messages',
      color: 'bg-[#34C759] text-white',
      onClick: () => {
        window.open(`sms:?&body=${encodedText}%20${encodedUrl}`, '_blank', 'noopener,noreferrer')
        track('share_target_clicked', { target: 'messages' })
      },
    },
    {
      icon: <Mail className="h-6 w-6" />,
      label: 'Mail',
      color: 'bg-[#007AFF] text-white',
      onClick: () => {
        window.location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodedText}%20${encodedUrl}`
        track('share_target_clicked', { target: 'mail' })
      },
    },
    {
      icon: <XIcon />,
      label: 'X',
      color: 'bg-neutral-900 text-white',
      onClick: () => {
        window.open(`https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`, '_blank', 'noopener,noreferrer')
        track('share_target_clicked', { target: 'x' })
      },
    },
    {
      icon: <Share2 className="h-6 w-6" />,
      label: 'More',
      color: 'bg-neutral-200 text-neutral-700',
      onClick: async () => {
        if (navigator.share) {
          try {
            await navigator.share({ title, text: shareText, url })
            track('share_target_clicked', { target: 'native_more' })
          } catch {
            // user cancelled
          }
        } else {
          copyLink()
        }
      },
    },
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-neutral-900/40 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl animate-slide-up overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Grab handle */}
        <div className="pt-3 pb-1 flex justify-center sm:hidden">
          <div className="h-1.5 w-10 rounded-full bg-neutral-200" />
        </div>

        <div className="px-5 pt-3 pb-2 flex items-center justify-between">
          <h2 className="text-base font-semibold">Share this tab</h2>
          <button onClick={onClose} className="btn-ghost -mr-2">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="px-5 pb-4 text-sm text-neutral-500">
          Anyone with the link can view and add expenses — no account needed.
        </p>

        {/* Share targets */}
        <div className="px-5 pb-5 grid grid-cols-5 gap-3">
          {targets.map((t) => (
            <button
              key={t.label}
              onClick={t.onClick}
              className="flex flex-col items-center gap-2 group"
            >
              <div
                className={`flex h-14 w-14 items-center justify-center rounded-2xl ${t.color} transition-transform group-active:scale-90 shadow-sm`}
              >
                {t.icon}
              </div>
              <span className="text-xs font-medium text-neutral-600">{t.label}</span>
            </button>
          ))}
        </div>

        {/* Link row */}
        <div className="px-5 pb-5">
          <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 pl-4 pr-2 py-2">
            <span className="flex-1 truncate text-sm text-neutral-600 select-all">{url}</span>
            <button
              onClick={copyLink}
              className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-2 text-xs font-semibold text-white transition-all hover:bg-neutral-800 active:scale-95"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Cancel (mobile) */}
        <div className="px-5 pb-5 sm:hidden">
          <button
            onClick={onClose}
            className="w-full rounded-xl border border-neutral-200 py-3 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

function WhatsAppIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}
