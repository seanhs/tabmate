import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  Receipt, Plus, ArrowLeft, Share2, Check, Loader2,
  Users, TrendingUp, TrendingDown, CheckCircle2, Trash2, X, Wallet, Pencil, CreditCard,
  Clock, BadgeCheck, Camera, ScanLine, Mic,
} from 'lucide-react'
import ShareSheet from '../components/ShareSheet'
import Footer from '../components/Footer'
import { supabase, type Trip, type Participant, type Expense, type Payment } from '../lib/supabase'
import { parseNames } from '../lib/utils'
import {
  calculateBalances, simplifyDebts, formatCurrency,
  buildPaymentLink, providerLabel,
  type Settlement,
} from '../lib/debts'
import {
  COUNTRIES, providersForCountry,
  type PaymentProvider, type CountryCode,
} from '../lib/supabase'
import { track } from '../lib/analytics'
import { touchLocalTrip } from '../lib/localTrips'

const CATEGORIES = ['General', 'Food', 'Drink', 'Accommodation', 'Transport', 'Activities', 'Shopping', 'Other']

export default function TripPage() {
  const { slug } = useParams<{ slug: string }>()
  const [trip, setTrip] = useState<Trip | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [showShareSheet, setShowShareSheet] = useState(false)
  const [showAddPersonModal, setShowAddPersonModal] = useState(false)

  const loadData = useCallback(async () => {
    if (!slug) return
    try {
      const { data: tripData, error: tripError } = await supabase
        .from('trips')
        .select('*')
        .eq('slug', slug)
        .maybeSingle()

      if (tripError) throw tripError
      if (!tripData) {
        setError('Trip not found.')
        setLoading(false)
        return
      }

      const { data: pData, error: pError } = await supabase
        .from('participants')
        .select('*')
        .eq('trip_id', tripData.id)
        .order('created_at', { ascending: true })

      if (pError) throw pError

      const { data: eData, error: eError } = await supabase
        .from('expenses')
        .select('*')
        .eq('trip_id', tripData.id)
        .order('created_at', { ascending: false })

      if (eError) throw eError

      const { data: payData, error: payError } = await supabase
        .from('payments')
        .select('*')
        .eq('trip_id', tripData.id)
        .order('created_at', { ascending: false })

      if (payError) throw payError

      setTrip(tripData)
      setParticipants(pData ?? [])
      setExpenses(eData ?? [])
      setPayments(payData ?? [])
      touchLocalTrip(tripData)
      track('trip_viewed', {
        trip_id: tripData.id,
        trip_slug: tripData.slug,
        participant_count: pData?.length ?? 0,
        expense_count: eData?.length ?? 0,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load trip.')
    } finally {
      setLoading(false)
    }
  }, [slug])

  useEffect(() => {
    loadData()
  }, [loadData])

  async function handleShare() {
    const url = window.location.href
    if (navigator.share) {
      try {
        await navigator.share({ title: trip?.name ?? 'Tabmate trip', text: `Settle up on Tabmate: ${trip?.name ?? ''}`, url })
        track('share_native_invoked', { trip_id: trip?.id, trip_slug: slug })
        return
      } catch {
        // user cancelled — fall through to sheet
      }
    }
    setShowShareSheet(true)
  }

  const participantMap = new Map(participants.map((p) => [p.id, p]))
  const confirmedPayments = payments.filter((p) => p.status === 'confirmed')
  const pendingPayments = payments.filter((p) => p.status === 'pending')
  const balances = calculateBalances(expenses, participants, confirmedPayments)
  const settlements = simplifyDebts(balances, pendingPayments)
  const totalSpent = expenses.reduce((sum, e) => sum + Number(e.amount), 0)

  async function markAsPaid(s: Settlement) {
    const { error } = await supabase
      .from('payments')
      .insert({
        trip_id: trip!.id,
        from_participant_id: s.from,
        to_participant_id: s.to,
        amount: s.amount,
        status: 'pending',
      })
    if (error) {
      console.error(error)
      return
    }
    track('payment_marked_paid', {
      trip_id: trip?.id,
      trip_slug: slug,
      from: s.from,
      to: s.to,
      amount: s.amount,
    })
    loadData()
  }

  async function confirmPayment(payment: Payment) {
    const { error } = await supabase
      .from('payments')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
      .eq('id', payment.id)
    if (error) {
      console.error(error)
      return
    }
    track('payment_confirmed', {
      trip_id: trip?.id,
      trip_slug: slug,
      payment_id: payment.id,
      amount: payment.amount,
    })
    loadData()
  }

  async function rejectPayment(payment: Payment) {
    const { error } = await supabase
      .from('payments')
      .delete()
      .eq('id', payment.id)
    if (error) {
      console.error(error)
      return
    }
    track('payment_rejected', {
      trip_id: trip?.id,
      trip_slug: slug,
      payment_id: payment.id,
    })
    loadData()
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    )
  }

  if (error || !trip) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 px-6">
        <div className="text-center max-w-sm">
          <p className="text-lg font-semibold text-neutral-900 mb-2">
            {error ?? 'Something went wrong.'}
          </p>
          <Link to="/" className="btn-primary mt-4">
            <ArrowLeft className="h-4 w-4" />
            Back home
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header */}
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/" className="btn-ghost -ml-2 shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0">
              <h1 className="text-lg font-bold truncate">{trip.name}</h1>
              <p className="text-xs text-neutral-500 flex items-center gap-1">
                <Users className="h-3 w-3" />
                {participants.length} people · {expenses.length} expenses
              </p>
            </div>
          </div>
          <button onClick={handleShare} className="btn-secondary shrink-0">
            <Share2 className="h-4 w-4" />
            Share
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="card p-5">
            <div className="flex items-center gap-2 text-neutral-500 mb-1">
              <Wallet className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wide">Total spent</span>
            </div>
            <p className="text-2xl font-bold">{formatCurrency(totalSpent)}</p>
          </div>
          <div className="card p-5">
            <div className="flex items-center gap-2 text-neutral-500 mb-1">
              <Receipt className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wide">Per person</span>
            </div>
            <p className="text-2xl font-bold">
              {formatCurrency(participants.length > 0 ? totalSpent / participants.length : 0)}
            </p>
          </div>
          <div className="card p-5 col-span-2 sm:col-span-1">
            <div className="flex items-center gap-2 text-neutral-500 mb-1">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wide">Payments to settle</span>
            </div>
            <p className="text-2xl font-bold">{settlements.length}</p>
          </div>
        </div>

        {/* Settlements */}
        {settlements.length > 0 && (
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-neutral-100 bg-gradient-to-r from-primary-50/50 to-transparent">
              <h2 className="font-semibold flex items-center gap-2">
                <ZapIcon />
                Smart settlements
              </h2>
              <div className="text-xs text-neutral-500 mt-0.5">
                {settlements.length} payment{settlements.length === 1 ? '' : 's'} remaining
                {pendingPayments.length > 0 && ` · ${pendingPayments.length} pending confirmation`}
              </div>
            </div>
            <div className="divide-y divide-neutral-100">
              {settlements.map((s, i) => {
                const fromP = participantMap.get(s.from)
                const toP = participantMap.get(s.to)
                const note = `${fromP?.name ?? ''} → ${toP?.name ?? ''} (${trip.name})`
                return (
                  <div key={i} className="px-5 py-4 flex items-center justify-between gap-3 animate-fade-in">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-50 text-primary-600 text-sm font-semibold shrink-0">
                        {(fromP?.name ?? '?')[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          <span className="text-neutral-900">{fromP?.name}</span>
                          <span className="text-neutral-400 mx-1.5">pays</span>
                          <span className="text-neutral-900">{toP?.name}</span>
                        </p>
                        <p className="text-xs text-neutral-500">{formatCurrency(s.amount)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {(() => {
                        const link = toP ? buildPaymentLink(toP, s.amount, note) : null
                        if (link) {
                          return (
                            <a
                              href={link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn-ghost text-xs"
                              onClick={() => track('payment_link_clicked', {
                                trip_id: trip?.id,
                                trip_slug: slug,
                                provider: toP?.payment_provider,
                                amount: s.amount,
                              })}
                            >
                              Pay with {providerLabel(toP?.payment_provider)}
                            </a>
                          )
                        }
                        return null
                      })()}
                      <button
                        onClick={() => markAsPaid(s)}
                        className="btn-ghost text-xs text-neutral-600 hover:bg-neutral-100"
                        title="Mark as paid"
                      >
                        <Wallet className="h-3.5 w-3.5" />
                        Mark paid
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Pending payments awaiting confirmation */}
        {pendingPayments.length > 0 && (
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-neutral-100 bg-amber-50/50">
              <h2 className="font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-600" />
                Pending confirmation
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                Tap confirm once you've received the money.
              </p>
            </div>
            <div className="divide-y divide-neutral-100">
              {pendingPayments.map((pay) => {
                const fromP = participantMap.get(pay.from_participant_id)
                const toP = participantMap.get(pay.to_participant_id)
                return (
                  <div key={pay.id} className="px-5 py-4 flex items-center justify-between gap-3 animate-fade-in">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-50 text-amber-600 text-sm font-semibold shrink-0">
                        {(fromP?.name ?? '?')[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          <span className="text-neutral-900">{fromP?.name}</span>
                          <span className="text-neutral-400 mx-1.5">paid</span>
                          <span className="text-neutral-900">{toP?.name}</span>
                        </p>
                        <p className="text-xs text-neutral-500">{formatCurrency(Number(pay.amount))}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => confirmPayment(pay)}
                        className="btn-ghost text-xs text-accent-600 hover:bg-accent-50"
                        title="Confirm received"
                      >
                        <BadgeCheck className="h-4 w-4" />
                        Confirm
                      </button>
                      <button
                        onClick={() => rejectPayment(pay)}
                        className="btn-ghost text-xs text-red-500 hover:bg-red-50"
                        title="Reject"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Balances */}
        {participants.length > 0 && (
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Balances</h2>
              <button
                onClick={() => setShowAddPersonModal(true)}
                className="btn-ghost text-xs text-primary-600"
              >
                <Plus className="h-3.5 w-3.5" />
                Add person
              </button>
            </div>
            <div className="space-y-3">
              {balances
                .sort((a, b) => b.net - a.net)
                .map((b) => {
                  const p = participantMap.get(b.participantId)
                  if (!p) return null
                  const isOwed = b.net > 0.005
                  const owes = b.net < -0.005
                  const settled = !isOwed && !owes
                  return (
                    <div key={b.participantId} className="flex items-center justify-between group/p">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 text-xs font-semibold">
                          {p.name[0]}
                        </div>
                        <EditableName
                          participant={p}
                          existingNames={participants.filter((x) => x.id !== p.id).map((x) => x.name)}
                          onSaved={loadData}
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        {settled ? (
                          <>
                            <Check className="h-4 w-4 text-neutral-400" />
                            <span className="text-sm font-medium text-neutral-500">
                              settled up
                            </span>
                          </>
                        ) : isOwed ? (
                          <>
                            <TrendingUp className="h-4 w-4 text-accent-600" />
                            <span className="text-sm font-semibold text-accent-700">
                              gets {formatCurrency(b.net)}
                            </span>
                          </>
                        ) : (
                          <>
                            <TrendingDown className="h-4 w-4 text-red-500" />
                            <span className="text-sm font-semibold text-red-600">
                              owes {formatCurrency(-b.net)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        )}

        {/* Expenses list */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Expenses</h2>
            <button onClick={() => setShowAddModal(true)} className="btn-primary">
              <Plus className="h-4 w-4" />
              Add expense
            </button>
          </div>

          {expenses.length === 0 ? (
            <div className="card p-12 text-center">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-400 mb-4">
                <Receipt className="h-6 w-6" />
              </div>
              <p className="font-medium text-neutral-700">No expenses yet</p>
              <p className="text-sm text-neutral-500 mt-1 mb-4">
                Add the first expense to start tracking.
              </p>
              <button onClick={() => setShowAddModal(true)} className="btn-primary">
                <Plus className="h-4 w-4" />
                Add expense
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {expenses.map((exp) => {
                const payer = participantMap.get(exp.paid_by)
                const splitIds = exp.split_participant_ids.length > 0
                  ? exp.split_participant_ids
                  : participants.map((p) => p.id)
                const splitNames = splitIds
                  .map((id) => participantMap.get(id)?.name)
                  .filter(Boolean)
                const share = Number(exp.amount) / splitIds.length

                return (
                  <div key={exp.id} className="card p-4 flex items-start justify-between gap-3 group">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-600 shrink-0">
                        <Receipt className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate">{exp.title}</p>
                        <p className="text-xs text-neutral-500 mt-0.5">
                          <span className="font-medium text-neutral-700">{payer?.name}</span> paid
                          {' · '}
                          <span className="badge bg-neutral-100 text-neutral-600 mr-1">{exp.category}</span>
                        </p>
                        <p className="text-xs text-neutral-400 mt-1">
                          Split: {splitNames.join(', ')} ({formatCurrency(share)}/person)
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-semibold">{formatCurrency(Number(exp.amount))}</span>
                      <button
                        onClick={() => setEditingExpense(exp)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity btn-ghost text-neutral-400 hover:text-primary-600 -mr-1"
                        aria-label="Edit expense"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <DeleteExpenseButton expenseId={exp.id} onDeleted={loadData} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>

      {showAddModal && (
        <AddExpenseModal
          tripId={trip.id}
          participants={participants}
          onClose={() => setShowAddModal(false)}
          onAdded={() => {
            setShowAddModal(false)
            loadData()
          }}
        />
      )}

      {editingExpense && (
        <AddExpenseModal
          tripId={trip.id}
          participants={participants}
          expense={editingExpense}
          onClose={() => setEditingExpense(null)}
          onAdded={() => {
            setEditingExpense(null)
            loadData()
          }}
        />
      )}

      {showAddPersonModal && (
        <AddParticipantModal
          tripId={trip.id}
          existingNames={participants.map((p) => p.name)}
          onClose={() => setShowAddPersonModal(false)}
          onAdded={() => {
            setShowAddPersonModal(false)
            loadData()
          }}
        />
      )}

      {showShareSheet && (
        <ShareSheet
          url={window.location.href}
          title={trip?.name ?? 'Tabmate trip'}
          onClose={() => setShowShareSheet(false)}
        />
      )}

      <Footer />
    </div>
  )
}

function EditableName({
  participant, existingNames, onSaved,
}: {
  participant: Participant
  existingNames: string[]
  onSaved: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(participant.name)
  const [saving, setSaving] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPayment, setShowPayment] = useState(false)

  useEffect(() => {
    if (!editing) setValue(participant.name)
  }, [participant.name, editing])

  async function handleDelete() {
    setDeleting(true)
    setError(null)

    const { error: stripError } = await supabase.rpc('strip_participant_from_splits', {
      p_trip_id: participant.trip_id,
      p_participant_id: participant.id,
    })
    if (stripError) {
      setDeleting(false)
      setError(stripError.message)
      return
    }

    const { error: dError } = await supabase
      .from('participants')
      .delete()
      .eq('id', participant.id)
    setDeleting(false)

    if (dError) {
      setError(dError.message)
      return
    }
    track('participant_deleted', {
      trip_id: participant.trip_id,
      participant_id: participant.id,
    })
    onSaved()
  }

  async function save() {
    const trimmed = value.trim()
    if (!trimmed) {
      setError('Name cannot be empty.')
      return
    }
    if (trimmed.toLowerCase() === participant.name.toLowerCase()) {
      setEditing(false)
      setError(null)
      return
    }
    if (existingNames.some((n) => n.toLowerCase() === trimmed.toLowerCase())) {
      setError('That name is already used in this trip.')
      return
    }

    setSaving(true)
    const { error: uError } = await supabase
      .from('participants')
      .update({ name: trimmed })
      .eq('id', participant.id)
    setSaving(false)

    if (uError) {
      setError(uError.message)
      return
    }
    setEditing(false)
    setError(null)
    onSaved()
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5 min-w-0">
        <input
          className="input !py-1 !px-2 text-sm h-8 max-w-[140px]"
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(null) }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); save() }
            if (e.key === 'Escape') { setEditing(false); setError(null) }
          }}
          autoFocus
          maxLength={60}
          disabled={saving}
        />
        <button
          onClick={save}
          disabled={saving}
          className="btn-ghost !p-1 text-accent-600"
          title="Save"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        </button>
        <button
          onClick={() => { setEditing(false); setError(null) }}
          disabled={saving}
          className="btn-ghost !p-1 text-neutral-400"
          title="Cancel"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        {error && (
          <span className="text-xs text-red-500 truncate">{error}</span>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className="text-sm font-medium truncate">{participant.name}</span>
      <button
        onClick={() => setEditing(true)}
        className="btn-ghost !p-1 text-neutral-400 opacity-0 group-hover/p:opacity-100 transition-opacity"
        title="Edit name"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      {confirmingDelete ? (
        <span className="flex items-center gap-1">
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="btn-ghost !p-1 text-red-600 hover:bg-red-50"
            title="Confirm delete"
          >
            {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={() => setConfirmingDelete(false)}
            disabled={deleting}
            className="btn-ghost !p-1 text-neutral-400"
            title="Cancel"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      ) : (
        <button
          onClick={() => setConfirmingDelete(true)}
          className="btn-ghost !p-1 text-neutral-400 hover:text-red-600 opacity-0 group-hover/p:opacity-100 transition-opacity"
          title="Remove person"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        onClick={() => setShowPayment(true)}
        className="btn-ghost !p-1 text-neutral-400 hover:text-primary-600 opacity-0 group-hover/p:opacity-100 transition-opacity"
        title="Set payment method"
      >
        <CreditCard className="h-3.5 w-3.5" />
      </button>
      {error && (
        <span className="text-xs text-red-500 truncate">{error}</span>
      )}
      {showPayment && (
        <PaymentMethodEditor
          participant={participant}
          onClose={() => setShowPayment(false)}
          onSaved={() => {
            setShowPayment(false)
            onSaved()
          }}
        />
      )}
    </div>
  )
}

function PaymentMethodEditor({
  participant, onClose, onSaved,
}: {
  participant: Participant
  onClose: () => void
  onSaved: () => void
}) {
  const [country, setCountry] = useState<CountryCode>(
    (participant.payment_country as CountryCode) ?? 'US',
  )
  const [provider, setProvider] = useState<PaymentProvider | ''>(
    (participant.payment_provider as PaymentProvider) ?? '',
  )
  const [handle, setHandle] = useState(participant.payment_handle ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const availableProviders = providersForCountry(country)
  const selected = availableProviders.find((p) => p.id === provider)

  function changeCountry(c: CountryCode) {
    setCountry(c)
    if (provider && !providersForCountry(c).some((p) => p.id === provider)) {
      setProvider('')
      setHandle('')
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const trimmed = handle.trim()
    if (provider && !trimmed) {
      setError('Enter a handle or link for the selected method.')
      return
    }

    setSaving(true)
    const { error: uError } = await supabase
      .from('participants')
      .update({
        payment_provider: provider || null,
        payment_handle: provider ? trimmed : null,
        payment_country: provider ? country : null,
      })
      .eq('id', participant.id)
    setSaving(false)

    if (uError) {
      setError(uError.message)
      return
    }
    track('payment_method_set', {
      trip_id: participant.trip_id,
      participant_id: participant.id,
      provider: provider || null,
      country,
    })
    onSaved()
  }

  async function handleClear() {
    setSaving(true)
    const { error: uError } = await supabase
      .from('participants')
      .update({ payment_provider: null, payment_handle: null, payment_country: null })
      .eq('id', participant.id)
    setSaving(false)
    if (uError) {
      setError(uError.message)
      return
    }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-neutral-900/40 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        className="card w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100 sticky top-0 bg-white">
          <div>
            <h2 className="font-semibold">Payment method</h2>
            <p className="text-xs text-neutral-400">How {participant.name} gets paid back</p>
          </div>
          <button onClick={onClose} className="btn-ghost -mr-2">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-5 space-y-5">
          <div>
            <label className="label">Country</label>
            <div className="flex flex-wrap gap-1.5">
              {COUNTRIES.map((c) => (
                <button
                  type="button"
                  key={c.code}
                  onClick={() => changeCountry(c.code)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                    country === c.code
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-neutral-200 text-neutral-600 hover:border-neutral-300'
                  }`}
                >
                  <span className="text-base leading-none">{c.flag}</span>
                  {c.code}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-neutral-400">
              Only payment methods available in {COUNTRIES.find((c) => c.code === country)?.label} are shown.
            </p>
          </div>

          <div>
            <label className="label">Provider</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {availableProviders.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => setProvider(p.id)}
                  className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    provider === p.id
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-neutral-200 text-neutral-600 hover:border-neutral-300'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {provider && (
            <div>
              <label className="label" htmlFor="paymentHandle">
                {selected?.hint}
              </label>
              <input
                id="paymentHandle"
                className="input"
                placeholder={
                  provider === 'other'
                    ? 'https://...'
                    : provider === 'paypal'
                      ? 'janedoe'
                      : provider === 'interac'
                        ? 'you@email.com or 5551234567'
                        : '@username'
                }
                value={handle}
                onChange={(e) => { setHandle(e.target.value); setError(null) }}
                autoFocus
              />
              <p className="mt-1.5 text-xs text-neutral-400">
                {provider === 'paypal' && 'Links to paypal.me/<you>/<amount>.'}
                {provider === 'wise' && 'Links to your Wise profile.'}
                {provider === 'venmo' && 'Pre-fills a charge request in Venmo.'}
                {provider === 'cashapp' && 'Pre-fills a request in Cash App.'}
                {provider === 'revolut' && 'Links to your Revolut.me profile.'}
                {provider === 'interac' && 'Opens your email app to start an e-Transfer.'}
                {provider === 'other' && 'Opens this link directly when someone pays you.'}
              </p>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Save
                </>
              )}
            </button>
            {(participant.payment_provider || participant.payment_handle || participant.payment_country) && (
              <button type="button" onClick={handleClear} disabled={saving} className="btn-ghost text-red-600">
                Clear
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

function AddParticipantModal({
  tripId, existingNames, onClose, onAdded,
}: {
  tripId: string
  existingNames: string[]
  onClose: () => void
  onAdded: () => void
}) {
  const [namesInput, setNamesInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const names = parseNames(namesInput)
    if (names.length === 0) {
      setError('Add at least one name.')
      return
    }
    const lower = existingNames.map((n) => n.toLowerCase())
    const dupes = names.filter((n) => lower.includes(n.toLowerCase()))
    if (dupes.length > 0) {
      setError(`Already in this trip: ${dupes.join(', ')}`)
      return
    }

    setSaving(true)
    const { error: pError } = await supabase
      .from('participants')
      .insert(names.map((name) => ({ trip_id: tripId, name })))
    setSaving(false)

    if (pError) {
      setError(pError.message)
      return
    }
    track('participants_added', {
      trip_id: tripId,
      count: names.length,
    })
    onAdded()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-neutral-900/40 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        className="card w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100 sticky top-0 bg-white">
          <h2 className="font-semibold">Add people</h2>
          <button onClick={onClose} className="btn-ghost -mr-2">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          <div>
            <label className="label" htmlFor="newNames">Who's joining?</label>
            <textarea
              id="newNames"
              className="input min-h-[88px] resize-none"
              placeholder="Comma or line separated&#10;e.g. Taylor, Morgan"
              value={namesInput}
              onChange={(e) => setNamesInput(e.target.value)}
              autoFocus
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

          <button type="submit" disabled={saving} className="btn-primary w-full">
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Adding...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                Add to trip
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}

function ZapIcon() {
  return (
    <svg className="h-4 w-4 text-primary-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  )
}

function DeleteExpenseButton({ expenseId, onDeleted }: { expenseId: string; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    await supabase.from('expenses').delete().eq('id', expenseId)
    setDeleting(false)
    track('expense_deleted', { expense_id: expenseId })
    onDeleted()
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1">
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="btn-ghost text-xs text-red-600 hover:bg-red-50"
        >
          {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Delete'}
        </button>
        <button onClick={() => setConfirming(false)} className="btn-ghost text-xs">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="opacity-0 group-hover:opacity-100 transition-opacity btn-ghost text-neutral-400 hover:text-red-600 -mr-2"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  )
}

function AddExpenseModal({
  tripId, participants, expense, onClose, onAdded,
}: {
  tripId: string
  participants: Participant[]
  expense?: Expense
  onClose: () => void
  onAdded: () => void
}) {
  const [title, setTitle] = useState(expense?.title ?? '')
  const [amount, setAmount] = useState(expense ? String(expense.amount) : '')
  const [paidBy, setPaidBy] = useState(expense?.paid_by ?? participants[0]?.id ?? '')
  const [category, setCategory] = useState(expense?.category ?? 'General')
  const [splitIds, setSplitIds] = useState<string[]>(
    expense && expense.split_participant_ids.length > 0
      ? expense.split_participant_ids
      : participants.map((p) => p.id)
  )
  const [saving, setSaving] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [audioError, setAudioError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const isEditing = Boolean(expense)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordStartRef = useRef<number>(0)
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [entryMethod, setEntryMethod] = useState<'visual' | 'audio' | 'manual' | null>(null)

  function toggleSplit(id: string) {
    setSplitIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
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
        const durationSeconds = Math.round((Date.now() - recordStartRef.current) / 1000)
        transcribeAudio(blob, durationSeconds)
      }
      mr.start()
      recordStartRef.current = Date.now()
      setRecordingDuration(0)
      recordTimerRef.current = setInterval(() => {
        setRecordingDuration(Math.floor((Date.now() - recordStartRef.current) / 1000))
      }, 1000)
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

  async function transcribeAudio(blob: Blob, recordingDurationSeconds = 0) {
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

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe-audio`, {
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
      if (data.title) setTitle(data.title)
      if (data.amount) setAmount(String(data.amount))
      if (data.category && CATEGORIES.includes(data.category)) setCategory(data.category)
      if (data.paidByName) {
        const payer = participants.find((p) => p.name.toLowerCase() === String(data.paidByName).toLowerCase())
        if (payer) setPaidBy(payer.id)
      }
      if (data.splitMode === 'all') {
        setSplitIds(participants.map((p) => p.id))
      } else if (data.splitMode === 'only' && Array.isArray(data.splitNames)) {
        const ids = participants
          .filter((p) => data.splitNames.some((n: string) => n.toLowerCase() === p.name.toLowerCase()))
          .map((p) => p.id)
        if (ids.length > 0) setSplitIds(ids)
      } else if (data.splitMode === 'except' && Array.isArray(data.splitNames)) {
        const excludeIds = participants
          .filter((p) => data.splitNames.some((n: string) => n.toLowerCase() === p.name.toLowerCase()))
          .map((p) => p.id)
        const ids = participants.filter((p) => !excludeIds.includes(p.id)).map((p) => p.id)
        if (ids.length > 0) setSplitIds(ids)
      }
      setEntryMethod('audio')
      track('expense_transcribed', { trip_id: tripId, category: data.category, recording_duration_seconds: recordingDurationSeconds })
    } catch (err) {
      setAudioError(err instanceof Error ? err.message : 'Could not transcribe audio')
    } finally {
      setTranscribing(false)
    }
  }

  async function handleScan(file: File) {
    setScanning(true)
    setScanError(null)
    try {
      const reader = new FileReader()
      const dataUrl: string = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const base64 = dataUrl.split(',')[1]
      const mimeType = file.type || 'image/jpeg'

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-receipt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ imageBase64: base64, mimeType }),
      })
      if (!res.ok) throw new Error(`Scan failed (${res.status})`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      if (data.title) setTitle(data.title)
      if (data.amount) setAmount(String(data.amount))
      if (data.category && CATEGORIES.includes(data.category)) setCategory(data.category)
      setEntryMethod('visual')
      track('receipt_scanned', { trip_id: tripId, category: data.category })
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Could not read receipt')
    } finally {
      setScanning(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!title.trim()) return setError('Add a description.')
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) return setError('Enter a valid amount.')
    if (!paidBy) return setError('Pick who paid.')
    if (splitIds.length === 0) return setError('Pick at least one person to split with.')

    setSaving(true)
    let writeError: string | null = null
    if (isEditing && expense) {
      const { error } = await supabase.from('expenses').update({
        title: title.trim(),
        amount: amt,
        paid_by: paidBy,
        category,
        split_participant_ids: splitIds,
      }).eq('id', expense.id)
      writeError = error?.message ?? null
    } else {
      const { error } = await supabase.from('expenses').insert({
        trip_id: tripId,
        title: title.trim(),
        amount: amt,
        paid_by: paidBy,
        category,
        split_participant_ids: splitIds,
      })
      writeError = error?.message ?? null
    }
    setSaving(false)

    if (writeError) {
      setError(writeError)
      return
    }
    track(isEditing ? 'expense_edited' : 'expense_added', {
      trip_id: tripId,
      amount: amt,
      category,
      split_count: splitIds.length,
      entry_method: entryMethod ?? 'manual',
    })
    setEntryMethod(null)
    onAdded()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-neutral-900/40 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        className="card w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100 sticky top-0 bg-white">
          <h2 className="font-semibold">{isEditing ? 'Edit expense' : 'Add expense'}</h2>
          <button onClick={onClose} className="btn-ghost -mr-2">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {!isEditing && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleScan(f)
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={scanning}
                className="w-full rounded-xl border-2 border-dashed border-primary-200 bg-primary-50/50 hover:bg-primary-50 transition-colors px-4 py-4 flex flex-col items-center gap-1.5 text-primary-700 disabled:opacity-60"
              >
                {scanning ? (
                  <>
                    <ScanLine className="h-5 w-5 animate-pulse" />
                    <span className="text-sm font-medium">Reading receipt...</span>
                  </>
                ) : (
                  <>
                    <Camera className="h-5 w-5" />
                    <span className="text-sm font-medium">Scan receipt</span>
                    <span className="text-xs text-primary-500">Snap a photo, we'll fill the details</span>
                  </>
                )}
              </button>
              {scanError && (
                <p className="text-xs text-red-600 -mt-2">{scanError}</p>
              )}

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={recording ? stopRecording : startRecording}
                  disabled={transcribing}
                  className={`flex-1 rounded-xl border-2 transition-colors px-4 py-4 flex flex-col items-center gap-1.5 disabled:opacity-60 ${
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
                        {String(Math.floor(recordingDuration / 60)).padStart(2, '0')}:{String(recordingDuration % 60).padStart(2, '0')} · tap when done
                      </span>
                    </>
                  ) : (
                    <>
                      <Mic className="h-5 w-5" />
                      <span className="text-sm font-medium">Describe it</span>
                      <span className="text-xs text-accent-500">Say it out loud, we'll fill the details</span>
                    </>
                  )}
                </button>
              </div>
              {audioError && (
                <p className="text-xs text-red-600 -mt-2">{audioError}</p>
              )}
            </>
          )}

          <div>
            <label className="label" htmlFor="title">What was it?</label>
            <input
              id="title"
              className="input"
              placeholder="e.g. Dinner at Ramen Bar"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="amount">Amount</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">$</span>
                <input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  className="input pl-7"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="category">Category</label>
              <select
                id="category"
                className="input"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label" htmlFor="paidBy">Who paid?</label>
            <select
              id="paidBy"
              className="input"
              value={paidBy}
              onChange={(e) => setPaidBy(e.target.value)}
            >
              {participants.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Split between</label>
            <div className="flex flex-wrap gap-2">
              {participants.map((p) => {
                const selected = splitIds.includes(p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleSplit(p.id)}
                    className={`rounded-full px-3.5 py-2 text-sm font-medium transition-all ${
                      selected
                        ? 'bg-primary-600 text-white shadow-sm'
                        : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                    }`}
                  >
                    {selected && <Check className="h-3.5 w-3.5 inline mr-1 -ml-0.5" />}
                    {p.name}
                  </button>
                )
              })}
            </div>
            {splitIds.length > 0 && amount && !isNaN(parseFloat(amount)) && (
              <p className="mt-2 text-xs text-neutral-500">
                {formatCurrency(parseFloat(amount) / splitIds.length)} per person
              </p>
            )}
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
                {isEditing ? 'Saving...' : 'Adding...'}
              </>
            ) : (
              isEditing ? 'Save changes' : 'Add expense'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
