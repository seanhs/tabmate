import { useState, useRef } from 'react'
import { X, Loader2, HandCoins, Check, Mic } from 'lucide-react'
import { supabase, type Participant } from '../lib/supabase'
import { formatCurrency, type Balance } from '../lib/debts'
import { track } from '../lib/analytics'

interface RecordPaymentModalProps {
  tripId: string
  participants: Participant[]
  balances: Balance[]
  onClose: () => void
  onAdded: () => void
}

const EVERYONE = '__everyone__'
const MAX_RECORDING_SECONDS = 30

export default function RecordPaymentModal({
  tripId,
  participants,
  balances,
  onClose,
  onAdded,
}: RecordPaymentModalProps) {
  const balanceMap = new Map(balances.map((b) => [b.participantId, b.net]))
  const debtors = participants
    .filter((p) => (balanceMap.get(p.id) ?? 0) < -0.005)
    .sort((a, b) => (balanceMap.get(a.id) ?? 0) - (balanceMap.get(b.id) ?? 0))
  const creditors = participants
    .filter((p) => (balanceMap.get(p.id) ?? 0) > 0.005)
    .sort((a, b) => (balanceMap.get(b.id) ?? 0) - (balanceMap.get(a.id) ?? 0))

  const [fromId, setFromId] = useState(debtors[0]?.id ?? participants[0]?.id ?? '')
  const [toId, setToId] = useState(creditors[0]?.id ?? participants.find((p) => p.id !== fromId)?.id ?? '')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [audioError, setAudioError] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordStartRef = useRef<number>(0)
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [recordingDuration, setRecordingDuration] = useState(0)

  const fromBalance = fromId === EVERYONE ? 0 : (balanceMap.get(fromId) ?? 0)
  const toBalance = balanceMap.get(toId) ?? 0
  const suggestedAmount = Math.min(Math.abs(fromBalance), Math.abs(toBalance))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!toId) return setError('Pick who received the payment.')
    if (fromId === toId) return setError('Payer and recipient must be different.')

    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) return setError('Enter a valid amount.')

    setSaving(true)

    if (fromId === EVERYONE) {
      const payers = participants.filter((p) => p.id !== toId)
      if (payers.length === 0) {
        setError('Need at least one other person to pay.')
        setSaving(false)
        return
      }
      const perPerson = Math.round(amt * 100) / payers.length
      const remainder = Math.round(amt * 100) - perPerson * payers.length
      const rows = payers.map((p, i) => ({
        trip_id: tripId,
        from_participant_id: p.id,
        to_participant_id: toId,
        amount: perPerson + (i < remainder ? 0.01 : 0),
        status: 'confirmed' as const,
        confirmed_at: new Date().toISOString(),
        note: note.trim() || null,
      }))
      const { error: pError } = await supabase.from('payments').insert(rows)
      setSaving(false)
      if (pError) {
        setError(pError.message)
        return
      }
      track('payment_recorded_voice_everyone', {
        trip_id: tripId,
        to: toId,
        total_amount: amt,
        payer_count: payers.length,
        has_note: Boolean(note.trim()),
      })
      onAdded()
      return
    }

    if (!fromId) return setError('Pick who paid.')

    const { error: pError } = await supabase.from('payments').insert({
      trip_id: tripId,
      from_participant_id: fromId,
      to_participant_id: toId,
      amount: amt,
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
      note: note.trim() || null,
    })
    setSaving(false)

    if (pError) {
      setError(pError.message)
      return
    }

    track('payment_recorded', {
      trip_id: tripId,
      from: fromId,
      to: toId,
      amount: amt,
      has_note: Boolean(note.trim()),
    })
    onAdded()
  }

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
        transcribePayment(blob)
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

  async function transcribePayment(blob: Blob) {
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

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ audioBase64: base64, mimeType, participantNames: participants.map((p) => p.name) }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => null)
        throw new Error(errData?.error ?? `Transcription failed (${res.status})`)
      }
      const data = await res.json()
      if (data.error) throw new Error(data.error)

      if (data.amount) setAmount(String(data.amount))
      if (data.note) setNote(String(data.note))

      if (data.fromName === 'EVERYONE') {
        setFromId(EVERYONE)
      } else if (data.fromName) {
        const payer = participants.find((p) => p.name.toLowerCase() === String(data.fromName).toLowerCase())
        if (payer) setFromId(payer.id)
      }

      if (data.toName) {
        const recipient = participants.find((p) => p.name.toLowerCase() === String(data.toName).toLowerCase())
        if (recipient) setToId(recipient.id)
      }

      track('payment_transcribed', { trip_id: tripId })
    } catch (err) {
      setAudioError(err instanceof Error ? err.message : 'Could not transcribe audio')
    } finally {
      setTranscribing(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-neutral-900/40 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="card w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100 sticky top-0 bg-white">
          <h2 className="font-semibold flex items-center gap-2">
            <HandCoins className="h-4 w-4 text-primary-600" />
            Record a payment
          </h2>
          <button onClick={onClose} className="btn-ghost -mr-2">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          <p className="text-sm text-neutral-500">
            Log a payment that happened outside Tabmate — a cash transfer, a deposit,
            a partial payment, or anything else. It will be applied to everyone's balances
            immediately.
          </p>

          {/* Voice note */}
          <button
            type="button"
            onClick={recording ? stopRecording : startRecording}
            disabled={transcribing}
            className={`w-full rounded-xl border-2 transition-colors px-4 py-4 flex flex-col items-center gap-1.5 disabled:opacity-60 ${
              recording
                ? 'border-red-300 bg-red-50 text-red-700'
                : 'border-accent-200 bg-accent-50/50 hover:bg-accent-50 text-accent-700'
            }`}
          >
            {transcribing ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm font-medium">Processing...</span>
              </>
            ) : recording ? (
              <>
                <div className="flex items-end gap-1 h-6">
                  <span className="wave-bar w-1 h-3 bg-red-500 rounded-full" style={{ animationDelay: '0ms' }} />
                  <span className="wave-bar w-1 h-5 bg-red-500 rounded-full" style={{ animationDelay: '120ms' }} />
                  <span className="wave-bar w-1 h-6 bg-red-500 rounded-full" style={{ animationDelay: '240ms' }} />
                  <span className="wave-bar w-1 h-4 bg-red-500 rounded-full" style={{ animationDelay: '360ms' }} />
                  <span className="wave-bar w-1 h-5 bg-red-500 rounded-full" style={{ animationDelay: '480ms' }} />
                </div>
                <span className="text-sm font-medium">Stop recording</span>
                <span className="text-xs text-red-500 tabular-nums">
                  {String(Math.floor(recordingDuration / 60)).padStart(2, '0')}:{String(Math.floor(recordingDuration) % 60).padStart(2, '0')} · tap when done
                </span>
                <div className="w-full max-w-[180px] h-1.5 rounded-full bg-red-200 overflow-hidden mt-1">
                  <div
                    className="h-full bg-red-500 rounded-full transition-[width] duration-100 ease-linear"
                    style={{ width: `${Math.min(100, (recordingDuration / MAX_RECORDING_SECONDS) * 100)}%` }}
                  />
                </div>
              </>
            ) : (
              <>
                <Mic className="h-5 w-5" />
                <span className="text-sm font-medium">Describe the payment</span>
                <span className="text-xs text-accent-500">Say "everyone paid $1000 deposit" — we'll fill it in</span>
              </>
            )}
          </button>
          {audioError && (
            <p className="text-xs text-red-600 -mt-2">{audioError}</p>
          )}

          {/* From */}
          <div>
            <label className="label" htmlFor="fromSelect">Who paid?</label>
            <select
              id="fromSelect"
              className="input"
              value={fromId}
              onChange={(e) => setFromId(e.target.value)}
            >
              <option value={EVERYONE}>Everyone (split among all)</option>
              {participants.map((p) => {
                const bal = balanceMap.get(p.id) ?? 0
                return (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {bal < -0.005 ? ` (owes ${formatCurrency(-bal)})` : ''}
                  </option>
                )
              })}
            </select>
            {fromId === EVERYONE && (
              <p className="mt-1.5 text-xs text-accent-600">
                Each person (except the recipient) pays an equal share.
              </p>
            )}
          </div>

          {/* To */}
          <div>
            <label className="label" htmlFor="toSelect">Who received it?</label>
            <select
              id="toSelect"
              className="input"
              value={toId}
              onChange={(e) => setToId(e.target.value)}
            >
              {participants.map((p) => {
                const bal = balanceMap.get(p.id) ?? 0
                return (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {bal > 0.005 ? ` (is owed ${formatCurrency(bal)})` : ''}
                  </option>
                )
              })}
            </select>
          </div>

          {/* Amount */}
          <div>
            <label className="label" htmlFor="paymentAmount">Amount</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">$</span>
              <input
                id="paymentAmount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                className="input pl-8"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
              />
            </div>
            {fromId !== EVERYONE && suggestedAmount > 0.005 && fromId !== toId && (
              <button
                type="button"
                onClick={() => setAmount(suggestedAmount.toFixed(2))}
                className="mt-1.5 text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
              >
                <Check className="h-3 w-3" />
                Use full balance: {formatCurrency(suggestedAmount)}
              </button>
            )}
            {fromId === EVERYONE && amount && !isNaN(parseFloat(amount)) && (
              <p className="mt-1.5 text-xs text-neutral-500">
                {formatCurrency(parseFloat(amount) / Math.max(1, participants.length - 1))} per person
              </p>
            )}
          </div>

          {/* Note */}
          <div>
            <label className="label" htmlFor="paymentNote">Note <span className="text-neutral-400 font-normal">(optional)</span></label>
            <input
              id="paymentNote"
              className="input"
              placeholder="e.g. Cabin deposit, paid via Venmo"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <button type="submit" disabled={saving} className="btn-primary w-full">
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <HandCoins className="h-4 w-4" />
                {fromId === EVERYONE ? 'Record payments' : 'Record payment'}
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
