import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Receipt, Share2, Zap, ArrowRight, Check, Loader2, Clock, X, Users, Camera, Mic } from 'lucide-react'
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
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [audioError, setAudioError] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordStartRef = useRef<number>(0)
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const MAX_RECORDING_SECONDS = 30

  async function startRecording() {
    setAudioError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      mediaRecorderRef.current = mr
      audioChunksRef.current = []
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(audioChunksRef.current, { type: mr.mimeType || 'audio/webm' })
        transcribeTab(blob)
      }
      mr.start()
      recordStartRef.current = Date.now()
      setRecordingDuration(0)
      recordTimerRef.current = setInterval(() => {
        const elapsed = (Date.now() - recordStartRef.current) / 1000
        setRecordingDuration(elapsed)
        if (elapsed >= MAX_RECORDING_SECONDS) stopRecording()
      }, 100)
      setRecording(true)
    } catch {
      setAudioError('Microphone access denied')
    }
  }

  function stopRecording() {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current)
      recordTimerRef.current = null
    }
    mediaRecorderRef.current?.stop()
    setRecording(false)
  }

  async function transcribeTab(blob: Blob) {
    setTranscribing(true)
    setAudioError(null)
    try {
      const reader = new FileReader()
      const dataUrl: string = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
      const base64 = dataUrl.split(',')[1]
      const mimeType = blob.type || 'audio/webm'

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe-tab`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ audioBase64: base64, mimeType }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => null)
        throw new Error(errData?.error ?? `Transcription failed (${res.status})`)
      }
      const data = await res.json()
      if (data.error) throw new Error(data.error)

      if (data.tripName) setTripName(data.tripName)
      if (Array.isArray(data.names) && data.names.length > 0) {
        setNamesInput(data.names.join(', '))
      }
      track('tab_transcribed', {})
    } catch (err) {
      setAudioError(err instanceof Error ? err.message : 'Could not transcribe audio')
    } finally {
      setTranscribing(false)
    }
  }

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
              { icon: Camera, text: 'Snap a receipt — we read it for you' },
              { icon: Mic, text: 'Say it out loud — we transcribe it' },
              { icon: Zap, text: 'Smart algorithm finds the fewest payments' },
              { icon: Share2, text: 'Share one link — everyone joins instantly' },
              { icon: Check, text: 'No accounts, no friction, no awkward math' },
              { icon: Receipt, text: 'Track every expense, split any way' },
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
              { step: '02', title: 'Add expenses', text: "Snap a photo of a receipt and we'll pull the details automatically. Or tap the mic and just say what you spent — we'll transcribe and fill it in for you. No typing, no math.", Icon: Camera, MicIcon: Mic },
              { step: '03', title: 'Settle smart', text: 'We calculate the fewest payments to make everyone whole. Tap to pay via Venmo, Cash App, or Interac.', Icon: Zap },
            ].map((s, i) => (
              <div key={i} className="text-center">
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary-50 text-primary-600 mb-4">
                  <s.Icon className="h-6 w-6" />
                </div>
                <div className="text-xs font-semibold text-primary-600 mb-1">{s.step}</div>
                <h3 className="font-semibold mb-2">{s.title}</h3>
                <p className="text-sm text-neutral-600 leading-relaxed">{s.text}</p>
                {s.MicIcon && (
                  <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-accent-600">
                    <s.MicIcon className="h-3.5 w-3.5" />
                    <span className="font-medium">Voice input included</span>
                  </div>
                )}
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
              {/* Voice input */}
              <div>
                <button
                  type="button"
                  onClick={recording ? stopRecording : startRecording}
                  disabled={transcribing}
                  className={`w-full rounded-xl border-2 transition-colors px-4 py-3.5 flex items-center justify-center gap-2 disabled:opacity-60 ${
                    recording
                      ? 'border-red-300 bg-red-50 text-red-700'
                      : 'border-accent-200 bg-accent-50/50 hover:bg-accent-50 text-accent-700'
                  }`}
                >
                  {transcribing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm font-medium">Listening...</span>
                    </>
                  ) : recording ? (
                    <>
                      <div className="flex items-end gap-1 h-5">
                        <span className="wave-bar w-1 h-2.5 bg-red-500 rounded-full" style={{ animationDelay: '0ms' }} />
                        <span className="wave-bar w-1 h-4 bg-red-500 rounded-full" style={{ animationDelay: '120ms' }} />
                        <span className="wave-bar w-1 h-5 bg-red-500 rounded-full" style={{ animationDelay: '240ms' }} />
                        <span className="wave-bar w-1 h-3 bg-red-500 rounded-full" style={{ animationDelay: '360ms' }} />
                        <span className="wave-bar w-1 h-4 bg-red-500 rounded-full" style={{ animationDelay: '480ms' }} />
                      </div>
                      <span className="text-sm font-medium">Stop</span>
                      <span className="text-xs text-red-500 tabular-nums">
                        {String(Math.floor(recordingDuration / 60)).padStart(2, '0')}:{String(Math.floor(recordingDuration) % 60).padStart(2, '0')}
                      </span>
                    </>
                  ) : (
                    <>
                      <Mic className="h-4 w-4" />
                      <span className="text-sm font-medium">Say it instead</span>
                    </>
                  )}
                </button>
                <p className="mt-1.5 text-xs text-neutral-400 text-center">
                  e.g. "Vegas trip with Dave, Priya, and that guy who still owes me $40"
                </p>
                {audioError && (
                  <p className="mt-1 text-xs text-red-600 text-center">{audioError}</p>
                )}
              </div>

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
