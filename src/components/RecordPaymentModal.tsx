import { useState } from 'react'
import { X, Loader2, HandCoins, Check } from 'lucide-react'
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

  const fromBalance = balanceMap.get(fromId) ?? 0
  const toBalance = balanceMap.get(toId) ?? 0
  const suggestedAmount = Math.min(Math.abs(fromBalance), Math.abs(toBalance))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!fromId || !toId) return setError('Pick who paid and who received.')
    if (fromId === toId) return setError('Payer and recipient must be different people.')

    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) return setError('Enter a valid amount.')

    setSaving(true)
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

          <div>
            <label className="label" htmlFor="fromSelect">Who paid?</label>
            <select
              id="fromSelect"
              className="input"
              value={fromId}
              onChange={(e) => setFromId(e.target.value)}
            >
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
          </div>

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
            {suggestedAmount > 0.005 && fromId !== toId && (
              <button
                type="button"
                onClick={() => setAmount(suggestedAmount.toFixed(2))}
                className="mt-1.5 text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
              >
                <Check className="h-3 w-3" />
                Use full balance: {formatCurrency(suggestedAmount)}
              </button>
            )}
          </div>

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
                Record payment
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
