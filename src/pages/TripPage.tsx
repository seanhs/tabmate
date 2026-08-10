import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useParams, Link } from 'react-router-dom'
import {
  Receipt, Plus, ArrowLeft, Share2, Check, Loader2,
  Users, TrendingUp, TrendingDown, CheckCircle2, Trash2, X, Wallet, Pencil, CreditCard,
  Camera, ScanLine, Mic, Calendar, Paperclip,
  Mail, HandCoins, History,
} from 'lucide-react'
import ShareSheet from '../components/ShareSheet'
import { ParticipantAvatar } from '../components/ParticipantAvatar'
import { BankLogo } from '../components/BankLogo'
import RecordPaymentModal from '../components/RecordPaymentModal'
import DeletePaymentButton from '../components/DeletePaymentButton'
import Footer from '../components/Footer'
import { supabase, type Trip, type Participant, type Expense, type Payment } from '../lib/supabase'
import { parseNames } from '../lib/utils'
import {
  calculateBalances, simplifyDebts, formatCurrency,
  buildPaymentLink, providerLabel,
  type Settlement,
} from '../lib/debts'
import {
  COUNTRIES, providersForCountry, CANADIAN_BANKS,
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
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [activeTab, setActiveTab] = useState<'people' | 'expenses' | 'payments'>('people')

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
        setError('Tab not found.')
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
      setError(err instanceof Error ? err.message : 'Failed to load tab.')
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
        await navigator.share({ title: trip?.name ?? 'Tabmate tab', text: `Settle up on Tabmate: ${trip?.name ?? ''}`, url })
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
  const balances = calculateBalances(expenses, participants, confirmedPayments)
  const settlements = simplifyDebts(balances, [])
  const totalSpent = expenses.reduce((sum, e) => sum + Number(e.amount), 0)

  async function markAsPaid(s: Settlement) {
    const { error } = await supabase
      .from('payments')
      .insert({
        trip_id: trip!.id,
        from_participant_id: s.from,
        to_participant_id: s.to,
        amount: s.amount,
        status: 'confirmed',
        confirmed_at: new Date().toISOString(),
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
              <EditableTripName trip={trip} onSaved={loadData} />
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

        {/* Tab bar */}
        <div className="flex gap-1 p-1 bg-neutral-100 rounded-xl">
          <button
            onClick={() => setActiveTab('people')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'people'
                ? 'bg-white text-neutral-900 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            <Users className="h-4 w-4" />
            People
            {participants.length > 0 && (
              <span className="text-xs text-neutral-400">{participants.length}</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('expenses')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'expenses'
                ? 'bg-white text-neutral-900 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            <Receipt className="h-4 w-4" />
            Expenses
            {expenses.length > 0 && (
              <span className="text-xs text-neutral-400">{expenses.length}</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('payments')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'payments'
                ? 'bg-white text-neutral-900 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            <HandCoins className="h-4 w-4" />
            Payments
            {settlements.length > 0 && (
              <span className="text-xs text-neutral-400">{settlements.length}</span>
            )}
          </button>
        </div>

        {/* People tab */}
        {activeTab === 'people' && participants.length > 0 && (
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-neutral-100 bg-gradient-to-r from-primary-50/50 to-transparent flex items-center justify-between">
              <div>
                <h2 className="font-semibold flex items-center gap-2">
                  <ZapIcon />
                  Balances
                </h2>
                <div className="text-xs text-neutral-500 mt-0.5">
                  {settlements.length > 0
                    ? `${settlements.length} payment${settlements.length === 1 ? '' : 's'} remaining`
                    : 'Everyone is settled up'}
                </div>
              </div>
              <button
                onClick={() => setShowAddPersonModal(true)}
                className="btn-ghost text-xs text-primary-600"
              >
                <Plus className="h-3.5 w-3.5" />
                Add person
              </button>
            </div>

            {/* Per-person balances */}
            <div className="px-5 py-4 space-y-3">
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
                        <ParticipantAvatar id={p.id} size="sm" />
                        <div className="min-w-0">
                          <EditableName
                            participant={p}
                            existingNames={participants.filter((x) => x.id !== p.id).map((x) => x.name)}
                            onSaved={loadData}
                          />
                          {p.payment_provider && (
                            <p className="text-[11px] text-neutral-400 flex items-center gap-1 mt-0.5">
                              <CreditCard className="h-2.5 w-2.5" />
                              {providerLabel(p.payment_provider)}
                              {p.payment_handle && <span className="truncate">· {p.payment_handle}</span>}
                            </p>
                          )}
                        </div>
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

        {/* People tab empty state */}
        {activeTab === 'people' && participants.length === 0 && (
          <div className="card p-12 text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-400 mb-4">
              <Users className="h-6 w-6" />
            </div>
            <p className="font-medium text-neutral-700">No people yet</p>
            <p className="text-sm text-neutral-500 mt-1 mb-4">
              Add people to start splitting expenses.
            </p>
            <button onClick={() => setShowAddPersonModal(true)} className="btn-primary">
              <Plus className="h-4 w-4" />
              Add person
            </button>
          </div>
        )}

        {/* Payments tab */}
        {activeTab === 'payments' && (
          <>
            {/* Suggested payments */}
            {settlements.length > 0 && (
              <div className="card overflow-hidden">
                <div className="px-5 py-4 border-b border-neutral-100 bg-gradient-to-r from-primary-50/50 to-transparent flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold flex items-center gap-2">
                      <ZapIcon />
                      Suggested payments
                    </h2>
                    <div className="text-xs text-neutral-500 mt-0.5">
                      {settlements.length} payment{settlements.length === 1 ? '' : 's'} remaining
                    </div>
                  </div>
                  <button
                    onClick={() => setShowPaymentModal(true)}
                    className="btn-ghost text-xs text-primary-600"
                  >
                    <HandCoins className="h-3.5 w-3.5" />
                    Record payment
                  </button>
                </div>
                <div className="divide-y divide-neutral-100">
                  {settlements.map((s, i) => {
                    const fromP = participantMap.get(s.from)
                    const toP = participantMap.get(s.to)
                    const note = `${fromP?.name ?? ''} → ${toP?.name ?? ''} (${trip.name})`
                    return (
                      <div key={i} className="px-5 py-4 flex items-center justify-between gap-3 animate-fade-in">
                        <div className="flex items-center gap-3 min-w-0">
                          <ParticipantAvatar id={s.from} />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              <span className="text-neutral-900">{fromP?.name}</span>
                              <span className="text-neutral-400 mx-1.5">pays</span>
                              <span className="text-neutral-900">{toP?.name}</span>
                            </p>
                            <p className="text-xs text-neutral-500">{formatCurrency(s.amount)}</p>
                            {toP?.payment_provider && (
                              <p className="text-[11px] text-neutral-400 flex items-center gap-1 mt-0.5">
                                <CreditCard className="h-2.5 w-2.5" />
                                {providerLabel(toP.payment_provider)}
                                {toP.payment_handle && <span className="truncate">· {toP.payment_handle}</span>}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {(() => {
                            const link = toP ? buildPaymentLink(toP, s.amount, note) : null
                            if (!link) return null
                            if (toP?.payment_provider === 'interac') {
                              return (
                                <InteracPayButton
                                  mailtoLink={link}
                                  recipientEmail={toP?.payment_handle ?? ''}
                                  amount={s.amount}
                                  onTrack={(bank) => track('payment_link_clicked', {
                                    trip_id: trip?.id,
                                    trip_slug: slug,
                                    provider: 'interac',
                                    bank,
                                    amount: s.amount,
                                  })}
                                />
                              )
                            }
                            return (
                              <a
                                href={link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn-primary text-xs group/btn"
                                onClick={() => track('payment_link_clicked', {
                                  trip_id: trip?.id,
                                  trip_slug: slug,
                                  provider: toP?.payment_provider,
                                  amount: s.amount,
                                })}
                              >
                                <span className="transition-transform group-hover/btn:rotate-12">💸</span>
                                Pay up
                              </a>
                            )
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

            {settlements.length > 0 && (
              <CopyChatSummaryButton
                tripName={trip.name}
                settlements={settlements}
                participantMap={participantMap}
                tripUrl={window.location.href}
              />
            )}

            {/* Payment history */}
            {payments.length > 0 && (
              <div className="card overflow-hidden">
                <div className="px-5 py-4 border-b border-neutral-100 bg-gradient-to-r from-primary-50/50 to-transparent">
                  <h2 className="font-semibold flex items-center gap-2">
                    <History className="h-4 w-4 text-primary-600" />
                    Payment history
                  </h2>
                  <div className="text-xs text-neutral-500 mt-0.5">
                    {payments.length} recorded payment{payments.length === 1 ? '' : 's'}
                  </div>
                </div>
                <div className="divide-y divide-neutral-100">
                  {payments.map((pay) => {
                    const fromP = participantMap.get(pay.from_participant_id)
                    const toP = participantMap.get(pay.to_participant_id)
                    return (
                      <div key={pay.id} className="px-5 py-3.5 flex items-center justify-between gap-3 group">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50 text-primary-600 shrink-0">
                            <HandCoins className="h-4.5 w-4.5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              <span className="text-neutral-900">{fromP?.name}</span>
                              <span className="text-neutral-400 mx-1.5">paid</span>
                              <span className="text-neutral-900">{toP?.name}</span>
                            </p>
                            <p className="text-xs text-neutral-500">
                              {formatCurrency(Number(pay.amount))}
                              {pay.note && <span className="text-neutral-400"> · {pay.note}</span>}
                              {' · '}
                              {new Date(pay.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            </p>
                          </div>
                        </div>
                        <DeletePaymentButton paymentId={pay.id} onDelete={loadData} />
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Payments empty state */}
            {settlements.length === 0 && payments.length === 0 && (
              <div className="card p-12 text-center">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-400 mb-4">
                  <HandCoins className="h-6 w-6" />
                </div>
                <p className="font-medium text-neutral-700">No payments yet</p>
                <p className="text-sm text-neutral-500 mt-1 mb-4">
                  Everyone is settled up, or record a payment manually.
                </p>
                <button onClick={() => setShowPaymentModal(true)} className="btn-primary">
                  <HandCoins className="h-4 w-4" />
                  Record payment
                </button>
              </div>
            )}
          </>
        )}

        {/* Expenses tab */}
        {activeTab === 'expenses' && (
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
                const isEveryone = exp.split_participant_ids.length === 0
                const splitIds = isEveryone
                  ? participants.map((p) => p.id)
                  : exp.split_participant_ids
                const splitNames = isEveryone
                  ? ['Everyone']
                  : splitIds
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
                        {exp.expense_date && (
                          <p className="text-xs text-neutral-400 mt-1 flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatExpenseDate(exp.expense_date)}
                          </p>
                        )}
                        {exp.receipt_url && (
                          <a
                            href={exp.receipt_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 mt-1.5 text-xs text-primary-600 hover:text-primary-700 hover:underline"
                          >
                            <Paperclip className="h-3 w-3" />
                            View receipt
                          </a>
                        )}
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
        )}
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

      {showPaymentModal && (
        <RecordPaymentModal
          tripId={trip.id}
          participants={participants}
          balances={balances}
          onClose={() => setShowPaymentModal(false)}
          onAdded={() => {
            setShowPaymentModal(false)
            loadData()
          }}
        />
      )}

      {showShareSheet && (
        <ShareSheet
          url={window.location.href}
          title={trip?.name ?? 'Tabmate tab'}
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

    // Remove this person from any expense's split list before deleting,
    // so the split falls back to remaining participants (or empty = everyone).
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
      setError('That name is already used in this tab.')
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
      {!participant.payment_provider && (
        <button
          onClick={() => setShowPayment(true)}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[11px] font-medium hover:bg-amber-100 transition-colors"
          title="Add payment method"
        >
          <CreditCard className="h-3 w-3" />
          Add payment
        </button>
      )}
      <button
        onClick={() => setEditing(true)}
        className="btn-ghost !p-1 text-neutral-400 hover:text-primary-600 transition-colors"
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
          className="btn-ghost !p-1 text-neutral-400 hover:text-red-600 transition-colors"
          title="Remove person"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        onClick={() => setShowPayment(true)}
        className={
          participant.payment_provider
            ? 'btn-ghost !p-1 text-neutral-400 hover:text-primary-600 transition-colors'
            : 'btn-ghost !p-1 text-amber-600 hover:text-amber-700 hover:bg-amber-50 transition-colors animate-pulse'
        }
        title={participant.payment_provider ? 'Edit payment method' : 'Add payment method'}
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

  // If the selected provider isn't valid for the new country, reset it.
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
      setError(`Already in this tab: ${dupes.join(', ')}`)
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
                Add to tab
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
    expense ? expense.split_participant_ids : []
  )
  const splitEveryone = splitIds.length === 0
  const [expenseDate, setExpenseDate] = useState<string>(
    expense?.expense_date
      ? new Date(expense.expense_date).toISOString().slice(0, 16)
      : new Date().toISOString().slice(0, 16)
  )
  const [saving, setSaving] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [receiptPreview, setReceiptPreview] = useState<string | null>(expense?.receipt_url ?? null)
  const [saveReceipt, setSaveReceipt] = useState(true)
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
  const MAX_RECORDING_SECONDS = 30

  function toggleSplit(id: string) {
    setSplitIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  function selectEveryone() {
    setSplitIds([])
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
        const elapsed = (Date.now() - recordStartRef.current) / 1000
        setRecordingDuration(elapsed)
        if (elapsed >= MAX_RECORDING_SECONDS) {
          stopRecording()
        }
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
      setReceiptFile(file)
      setReceiptPreview(dataUrl)
      setSaveReceipt(true)
      setEntryMethod('visual')
      track('receipt_scanned', { trip_id: tripId, category: data.category })
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Could not read receipt')
    } finally {
      setScanning(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function uploadReceipt(file: File): Promise<string | null> {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const fileName = `${tripId}/${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from('receipts').upload(fileName, file, { upsert: false })
    if (error) throw new Error(`Could not save receipt image: ${error.message}`)
    const { data: pub } = supabase.storage.from('receipts').getPublicUrl(fileName)
    return pub.publicUrl
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!title.trim()) return setError('Add a description.')
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) return setError('Enter a valid amount.')
    if (!paidBy) return setError('Pick who paid.')
    // splitIds.length === 0 means "everyone" — always valid as long as there are participants

    setSaving(true)
    let writeError: string | null = null
    let finalReceiptUrl = expense?.receipt_url ?? null
    try {
      if (saveReceipt && receiptFile) {
        finalReceiptUrl = await uploadReceipt(receiptFile)
      } else if (!saveReceipt && !receiptFile) {
        finalReceiptUrl = null
      }
    } catch (err) {
      setSaving(false)
      setError(err instanceof Error ? err.message : 'Could not save receipt image')
      return
    }
    if (isEditing && expense) {
      const { error } = await supabase.from('expenses').update({
        title: title.trim(),
        amount: amt,
        paid_by: paidBy,
        category,
        split_participant_ids: splitIds,
        expense_date: expenseDate ? new Date(expenseDate).toISOString() : null,
        receipt_url: finalReceiptUrl,
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
        expense_date: expenseDate ? new Date(expenseDate).toISOString() : null,
        receipt_url: finalReceiptUrl,
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
                    <span className="text-sm font-medium">Scanning receipt...</span>
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
              {receiptPreview && (
                <div className="-mt-2 rounded-xl border border-neutral-200 overflow-hidden bg-neutral-50">
                  <img src={receiptPreview} alt="Receipt preview" className="w-full max-h-48 object-contain" />
                  <label className="flex items-center gap-2 px-3 py-2.5 text-sm text-neutral-700 cursor-pointer hover:bg-neutral-100 transition-colors">
                    <input
                      type="checkbox"
                      checked={saveReceipt}
                      onChange={(e) => setSaveReceipt(e.target.checked)}
                      className="rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
                    />
                    <Paperclip className="h-3.5 w-3.5 text-neutral-400" />
                    Save receipt so others can see it
                  </label>
                </div>
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
                      <span className="text-sm font-medium">Parsing voice note with AI...</span>
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
            <div className="flex items-center justify-between mb-1.5">
              <label className="label !mb-0" htmlFor="title">What was it?</label>
              {!isEditing && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={scanning || transcribing}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-primary-600 hover:bg-primary-50 transition-colors disabled:opacity-50"
                    title="Scan receipt"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    Scan Receipt
                  </button>
                  <button
                    type="button"
                    onClick={recording ? stopRecording : startRecording}
                    disabled={scanning || transcribing}
                    className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                      recording ? 'text-red-600 hover:bg-red-50' : 'text-accent-600 hover:bg-accent-50'
                    }`}
                    title="Voice log"
                  >
                    <Mic className="h-3.5 w-3.5" />
                    Voice Log
                  </button>
                </div>
              )}
            </div>
            <input
              id="title"
              className="input"
              placeholder="e.g. Dinner at Ramen Bar"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
            {transcribing && (
              <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-accent-50 px-3 py-1.5 text-xs font-medium text-accent-700 animate-pulse">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Parsing voice note with AI...
              </div>
            )}
            {scanning && (
              <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-700 animate-pulse">
                <ScanLine className="h-3.5 w-3.5 animate-pulse" />
                Scanning receipt...
              </div>
            )}
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
            <label className="label" htmlFor="expenseDate">Date</label>
            <input
              id="expenseDate"
              type="datetime-local"
              className="input"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
            />
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
              <button
                type="button"
                onClick={selectEveryone}
                className={`rounded-full px-3.5 py-2 text-sm font-medium transition-all ${
                  splitEveryone
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                {splitEveryone && <Check className="h-3.5 w-3.5 inline mr-1 -ml-0.5" />}
                Everyone
              </button>
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
            {splitEveryone
              ? amount && !isNaN(parseFloat(amount)) && participants.length > 0 && (
                  <p className="mt-2 text-xs text-neutral-500">
                    {formatCurrency(parseFloat(amount) / participants.length)} per person
                  </p>
                )
              : splitIds.length > 0 && amount && !isNaN(parseFloat(amount)) && (
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

function formatExpenseDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function EditableTripName({ trip, onSaved }: { trip: Trip; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(trip.name)
  const [saving, setSaving] = useState(false)

  async function save() {
    const trimmed = name.trim()
    if (!trimmed || trimmed === trip.name) {
      setEditing(false)
      setName(trip.name)
      return
    }
    setSaving(true)
    const { error } = await supabase.from('trips').update({ name: trimmed }).eq('id', trip.id)
    setSaving(false)
    if (error) {
      console.error(error)
      setName(trip.name)
      setEditing(false)
      return
    }
    setEditing(false)
    onSaved()
  }

  if (!editing) {
    return (
      <h1 className="text-lg font-bold truncate flex items-center gap-1.5 group">
        <span className="truncate">{trip.name}</span>
        <button
          onClick={() => setEditing(true)}
          className="text-neutral-400 hover:text-neutral-700 transition-colors"
          title="Rename tab"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </h1>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save()
          if (e.key === 'Escape') {
            setName(trip.name)
            setEditing(false)
          }
        }}
        className="text-lg font-bold bg-transparent border-b border-neutral-300 focus:border-neutral-700 outline-none px-0.5 -ml-0.5 min-w-0 flex-1"
      />
      <button
        onClick={save}
        disabled={saving}
        className="btn-ghost text-xs text-accent-600 hover:bg-accent-50 shrink-0"
      >
        <Check className="h-4 w-4" />
      </button>
    </div>
  )
}

function CopyChatSummaryButton({
  tripName,
  settlements,
  participantMap,
  tripUrl,
}: {
  tripName: string
  settlements: Settlement[]
  participantMap: Map<string, Participant>
  tripUrl: string
}) {
  const [copied, setCopied] = useState(false)

  const summaryText = useMemo(() => {
    const lines = settlements.map((s) => {
      const fromP = participantMap.get(s.from)
      const toP = participantMap.get(s.to)
      return `• ${fromP?.name ?? 'Someone'} owes ${toP?.name ?? 'someone'} $${s.amount.toFixed(2)}`
    })
    return `✈️ ${tripName} Tabmate Summary:\n${lines.join('\n')}\n\n🔗 View breakdown or settle up: ${tripUrl}`
  }, [tripName, settlements, participantMap, tripUrl])

  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(summaryText)
          setCopied(true)
          setTimeout(() => setCopied(false), 2500)
          track('chat_summary_copied', { trip_name: tripName })
        } catch { /* clipboard not available */ }
      }}
      className={`w-full rounded-xl border px-5 py-3.5 flex items-center justify-center gap-2 text-sm font-semibold transition-all active:scale-[0.98] ${
        copied
          ? 'border-accent-200 bg-accent-50 text-accent-700'
          : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
      }`}
    >
      {copied ? (
        <>
          <Check className="h-4 w-4" />
          Summary copied to clipboard!
        </>
      ) : (
        <>
          <span>📋</span>
          Copy Chat Summary
        </>
      )}
    </button>
  )
}

const BANK_DEEP_LINKS: Record<string, string> = {
  RBC: 'rbcmobile://',
  TD: 'tdbank://',
  Scotiabank: 'scotiaapp://',
  BMO: 'bmomobile://',
  CIBC: 'cibc://',
  Tangerine: 'tangerineapp://',
  Wealthsimple: 'wealthsimple://',
}

function CopyButton({ text, label, icon }: { text: string; label: string; icon: React.ReactNode }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        } catch { /* clipboard not available */ }
      }}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all active:scale-[0.97] ${
        copied
          ? 'bg-accent-100 text-accent-700'
          : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
      }`}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : icon}
      {copied ? 'Copied!' : label}
    </button>
  )
}

function InteracPayButton({
  mailtoLink,
  recipientEmail,
  amount,
  onTrack,
}: {
  mailtoLink: string
  recipientEmail: string
  amount: number
  onTrack: (bank: string) => void
}) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open])

  const amountStr = amount.toFixed(2)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="btn-primary text-xs"
      >
        <span>💸</span>
        Pay via Interac
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-[fadeIn_0.15s_ease-out]"
            onClick={() => setOpen(false)}
          />
          <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 pb-8 animate-[slideUp_0.2s_ease-out] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-neutral-900">Pay via Interac</h3>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-full hover:bg-neutral-100 transition-colors"
              >
                <X className="h-5 w-5 text-neutral-500" />
              </button>
            </div>

            {recipientEmail && (
              <div className="flex gap-2 mb-4">
                <CopyButton
                  text={recipientEmail}
                  label="Copy Email"
                  icon={<Mail className="h-3.5 w-3.5" />}
                />
                <CopyButton
                  text={amountStr}
                  label={`Copy $${amountStr}`}
                  icon={<Wallet className="h-3.5 w-3.5" />}
                />
              </div>
            )}

            <p className="text-sm text-neutral-500 mb-4">
              Tap your bank to open its app, or send an e-Transfer by email.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {CANADIAN_BANKS.map((bank) => (
                <a
                  key={bank.name}
                  href={BANK_DEEP_LINKS[bank.name] ?? bank.url}
                  onClick={() => onTrack(bank.name)}
                  className="flex flex-col items-center gap-2 p-4 rounded-2xl border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 transition-colors active:scale-[0.97]"
                >
                  <span className="h-11 w-11 rounded-xl bg-white flex items-center justify-center shrink-0 p-1.5">
                    <BankLogo bank={bank.name} className="h-full w-full object-contain" />
                  </span>
                  <span className="text-sm font-medium text-neutral-800 text-center">{bank.name}</span>
                </a>
              ))}
              <a
                href={mailtoLink}
                onClick={() => onTrack('email')}
                className="flex flex-col items-center gap-2 p-4 rounded-2xl border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 transition-colors active:scale-[0.97]"
              >
                <span className="h-11 w-11 rounded-xl flex items-center justify-center bg-neutral-700 text-white shrink-0">
                  <Mail className="h-5 w-5" />
                </span>
                <span className="text-sm font-medium text-neutral-800 text-center">Email e-Transfer</span>
              </a>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
