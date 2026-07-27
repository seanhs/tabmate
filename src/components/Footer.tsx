import { Coffee } from 'lucide-react'

export default function Footer() {
  return (
    <footer className="border-t border-neutral-200 bg-white">
      <div className="max-w-4xl mx-auto px-6 py-8 flex flex-col items-center gap-3 text-center text-sm text-neutral-400">
        <p>Enjoying Tabmate? Support future development.</p>
        <a
          href="https://www.buymeacoffee.com/tabmate"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3.5 py-1.5 text-amber-700 font-medium hover:bg-amber-100 transition-colors"
        >
          <Coffee className="h-4 w-4" />
          Buy us a coffee
        </a>
      </div>
    </footer>
  )
}
