import { useState, useEffect, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Receipt, Share2, Zap, ArrowRight, Check, Loader2, Clock, X, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Footer from '../components/Footer'
import { generateSlug, parseNames } from '../lib/utils'
import { track } from '../lib/analytics'
import { getLocalTrips, removeLocalTrip, addLocalTrip, type LocalTrip } from '../lib/localTrips'

export default function HomePage() {
  const navigate = useNavigate()
  const [tripName, setTripName] = useState('')
  const [namesInput, setNamesInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [localTrips, setLocalTrips] = useState<LocalTrip[]>([])

  useEffect(() => {
    setLocalTrips(getLocalTrips())
  }, [])

  const refreshLocalTrips = useCallback(() => setLocalTrips(getLocalTrips()), [])

  function handleRemoveTrip(slug: string, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    removeLocalTrip(slug)
    refreshLocalTrips()
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const names = parseNames(namesInput)
    if (!tripName.trim()) {
      setError('Give your tab a name.')
      return
    }
    if (names.length < 2) {
      setError('Add at least 2 people.')
      return
    }

    setLoading(true)
    try {
      const slug = generateSlug(tripName)
      const { data: trip, error: tripError } = await supabase
        .from('trips')
        .insert({ slug, name: tripName.trim() })
        .select()
        .single()

      if (tripError) throw tripError

      const { error: pError } = await supabase
        .from('participants')
        .insert(names.map((name) => ({ trip_id: trip.id, name })))

      if (pError) throw pError

      track('trip_created', {
        trip_id: trip.id,
        trip_slug: slug,
        participant_count: names.length,
      })
      addLocalTrip(trip)
      navigate(`/t/${slug}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-neutral-50 to-neutral-100">
      {/* Header */}
      <header className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-600 text-white">
            <Receipt className="h-5 w-5" />
          </div>
          <span className="text-lg font-bold tracking-tight lowercase">tabmate</span>
        </div>
      </header>

      {/* Intro */}
      <section className="max-w-6xl mx-auto px-6 pt-16 pb-20">
        <div className="max-w-2xl mx-auto text-center animate-fade-in">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700 mb-6">
            <Zap className="h-3.5 w-3.5" />
            No sign-up. No app to install. 100% free.
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-neutral-900 leading-[1.1]">
            Split group expenses<br />
            <span className="text-primary-600">in seconds.</span>
          </h1>
          <p className="mt-5 text-lg text-neutral-600 leading-relaxed">
            Create a tab, add what everyone spent, and instantly see the
            fewest payments to settle up. Share one link — that's it.
          </p>

          <div className="mt-8 grid sm:grid-cols-3 gap-3 text-left">
            {[
              { icon: Share2, text: 'Share one link — everyone joins instantly' },
              { icon: Zap, text: 'Smart algorithm finds the fewest payments' },
              { icon: Check, text: 'No accounts, no friction, no awkward math' },
            ].map((f, i) => (
              <div key={i} className="flex items-center gap-3 text-neutral-700">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                  <f.icon className="h-4 w-4" />
                </div>
                <span className="text-sm font-medium">{f.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-white border-y border-neutral-200">
        <div className="max-w-6xl mx-auto px-6 py-14">
          <h2 className="text-2xl font-bold text-center mb-8">How it works</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: '01', title: 'Create a tab', text: 'Name it, list the people involved, and you get a shareable link instantly.', Icon: Users },
              { step: '02', title: 'Add expenses', text: 'Anyone with the link logs what they paid and who it covers. No math required.', Icon: Receipt },
              { step: '03', title: 'Settle smart', text: 'We calculate the fewest payments to make everyone whole. Tap to pay via Venmo or Cash App.', Icon: Zap },
            ].map((s, i) => (
              <div key={i} className="text-center">
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary-50 text-primary-600 mb-4">
                  <s.Icon className="h-6 w-6" />
                </div>
                <div className="text-xs font-semibold text-primary-600 mb-1">{s.step}</div>
                <h3 className="font-semibold mb-2">{s.title}</h3>
                <p className="text-sm text-neutral-600 leading-relaxed">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Your tabs */}
      {localTrips.length > 0 && (
        <section className="max-w-6xl mx-auto px-6 pt-14 pb-10">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="h-4 w-4 text-neutral-400" />
              <h2 className="text-sm font-semibold text-neutral-700">Your tabs</h2>
              <span className="text-xs text-neutral-400">· saved on this device</span>
            </div>
            <div className="space-y-2">
              {localTrips.map((t) => (
                <Link
                  key={t.id}
                  to={`/t/${t.slug}`}
                  className="group flex items-center justify-between rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-sm transition-all hover:border-primary-300 hover:shadow"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-neutral-900">{t.name}</p>
                    <p className="text-xs text-neutral-400">
                      Opened {new Date(t.last_opened_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="btn-ghost opacity-0 transition-opacity group-hover:opacity-100">
                      Open
                      <ArrowRight className="h-4 w-4" />
                    </span>
                    <button
                      type="button"
                      onClick={(e) => handleRemoveTrip(t.slug, e)}
                      className="btn-ghost text-neutral-400 hover:text-red-600"
                      aria-label={`Remove ${t.name} from this list`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </Link>
              ))}
            </div>
            <p className="mt-3 text-xs text-neutral-400">
              Tabs are remembered in this browser. Share links still work on any device.
            </p>
            <p className="mt-1.5 text-xs text-neutral-400">
              This list is stored only in your browser's local storage — it never leaves your device and isn't tied to an account. Clearing your browser data removes it.
            </p>
          </div>
        </section>
      )}

      {/* Start a new tab */}
      <section className="max-w-6xl mx-auto px-6 pt-14 pb-20">
        <div className="max-w-md mx-auto animate-slide-up">
          <div className="card p-8">
            <h2 className="text-xl font-bold mb-1">Start a new tab</h2>
            <p className="text-sm text-neutral-500 mb-6">
              Takes 10 seconds. No account needed.
            </p>

            <form onSubmit={handleCreate} className="space-y-5">
              <div>
                <label className="label" htmlFor="tripName">Tab name</label>
                <input
                  id="tripName"
                  className="input"
                  placeholder="e.g. Vegas 2026, Cabin Weekend, Roommates"
                  value={tripName}
                  onChange={(e) => setTripName(e.target.value)}
                  maxLength={60}
                />
              </div>

              <div>
                <label className="label" htmlFor="names">Who's involved?</label>
                <textarea
                  id="names"
                  className="input min-h-[88px] resize-none"
                  placeholder="Comma or line separated&#10;e.g. Alex, Sam, Jordan, Riley"
                  value={namesInput}
                  onChange={(e) => setNamesInput(e.target.value)}
                />
                <p className="mt-1.5 text-xs text-neutral-400">
                  Separate names with commas or new lines.
                </p>
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    Create tab
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
