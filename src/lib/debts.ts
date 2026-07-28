import type { Expense, Participant, PaymentProvider, Payment } from './supabase'
import { PAYMENT_PROVIDERS } from './supabase'

export type Balance = {
  participantId: string
  net: number
}

export type Settlement = {
  from: string
  to: string
  amount: number
}

/**
 * Calculate each participant's net balance across all expenses.
 * Positive = they are owed money. Negative = they owe money.
 * Confirmed payments are subtracted so settled debts disappear.
 */
export function calculateBalances(
  expenses: Expense[],
  participants: Participant[],
  confirmedPayments: Payment[] = [],
): Balance[] {
  const balances = new Map<string, number>()
  for (const p of participants) {
    balances.set(p.id, 0)
  }

  for (const expense of expenses) {
    const splitIds = expense.split_participant_ids.length > 0
      ? expense.split_participant_ids
      : participants.map((p) => p.id)

    // Compute shares in integer cents so the split always sums exactly to
    // the expense amount. Any remainder penny is distributed to the first
    // few people in the split list.
    const totalCents = Math.round(expense.amount * 100)
    const baseShareCents = Math.floor(totalCents / splitIds.length)
    const remainderCents = totalCents - baseShareCents * splitIds.length

    // The payer's balance goes up by the full amount (they fronted the money)
    balances.set(expense.paid_by, (balances.get(expense.paid_by) ?? 0) + expense.amount)

    // Each person in the split owes their share
    splitIds.forEach((pid, i) => {
      const shareCents = baseShareCents + (i < remainderCents ? 1 : 0)
      balances.set(pid, (balances.get(pid) ?? 0) - shareCents / 100)
    })
  }

  // Confirmed payments reduce what the sender still owes and what the
  // recipient is still owed.
  for (const payment of confirmedPayments) {
    if (payment.status !== 'confirmed') continue
    balances.set(payment.from_participant_id, (balances.get(payment.from_participant_id) ?? 0) + payment.amount)
    balances.set(payment.to_participant_id, (balances.get(payment.to_participant_id) ?? 0) - payment.amount)
  }

  return participants.map((p) => ({
    participantId: p.id,
    net: balances.get(p.id) ?? 0,
  }))
}

/**
 * Greedy debt simplification algorithm.
 * Takes net balances and produces the minimum number of payments to settle all debts.
 *
 * 1. Separate into creditors (net > 0) and debtors (net < 0).
 * 2. Sort each by magnitude (largest first).
 * 3. Greedily match the largest debtor to the largest creditor,
 *    transferring as much as possible, until all balances are settled.
 *
 * Pending payments are excluded from the settlement list — they're already
 * in flight and waiting for confirmation.
 */
export function simplifyDebts(balances: Balance[], pendingPayments: Payment[] = []): Settlement[] {
  const pendingKey = (from: string, to: string) => `${from}:${to}`
  const pendingSet = new Set(pendingPayments.map((p) => pendingKey(p.from_participant_id, p.to_participant_id)))

  const creditors = balances
    .filter((b) => b.net > 0.005)
    .map((b) => ({ id: b.participantId, amount: b.net }))
    .sort((a, b) => b.amount - a.amount)

  const debtors = balances
    .filter((b) => b.net < -0.005)
    .map((b) => ({ id: b.participantId, amount: -b.net }))
    .sort((a, b) => b.amount - a.amount)

  const settlements: Settlement[] = []
  let ci = 0
  let di = 0

  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci]
    const debtor = debtors[di]
    const transfer = Math.min(creditor.amount, debtor.amount)

    if (transfer > 0.005 && !pendingSet.has(pendingKey(debtor.id, creditor.id))) {
      settlements.push({
        from: debtor.id,
        to: creditor.id,
        amount: Math.round(transfer * 100) / 100,
      })
    }

    creditor.amount -= transfer
    debtor.amount -= transfer

    if (creditor.amount < 0.005) ci++
    if (debtor.amount < 0.005) di++
  }

  return settlements
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

/**
 * Build a payment link for a settlement, using the recipient's preferred
 * payment provider. Returns null when the recipient has no method set up.
 */
export function buildPaymentLink(
  recipient: { payment_provider?: PaymentProvider | null; payment_handle?: string | null },
  amount: number,
  note: string,
): string | null {
  const provider = recipient.payment_provider
  const handle = (recipient.payment_handle ?? '').trim()
  if (!provider || !handle) return null

  switch (provider) {
    case 'paypal': {
      // PayPal.me supports an amount path: paypal.me/<username>/<amount>
      const clean = handle.replace(/^@/, '')
      return `https://paypal.me/${clean}/${amount.toFixed(2)}`
    }
    case 'wise': {
      // Wise has no public deep-link with amount; link to the user's Wise profile.
      const clean = handle.replace(/^@/, '')
      return `https://wise.com/pay/${clean}`
    }
    case 'venmo': {
      const clean = handle.replace(/^@/, '')
      const params = new URLSearchParams({
        txn: 'charge',
        recipients: clean,
        amount: amount.toFixed(2),
        note,
      })
      return `https://venmo.com/?${params.toString()}`
    }
    case 'cashapp': {
      const clean = handle.replace(/^\$/, '').replace(/^@/, '')
      const params = new URLSearchParams({
        amount: amount.toFixed(2),
        note,
      })
      return `https://cash.app/${clean}/request?${params.toString()}`
    }
    case 'revolut': {
      const clean = handle.replace(/^@/, '')
      return `https://revolut.me/${clean}`
    }
    case 'interac': {
      // Interac e-Transfer is initiated through the recipient's bank, not a
      // deep link. We return a mailto: so the sender can request the
      // recipient's email/phone (which is what they entered as the handle).
      const body = `Hi, I'd like to send you an Interac e-Transfer of ${amount.toFixed(2)} for: ${note}`
      return `mailto:${encodeURIComponent(handle)}?subject=${encodeURIComponent('Interac e-Transfer')}&body=${encodeURIComponent(body)}`
    }
    case 'other':
      return handle
    default:
      return null
  }
}

export function providerLabel(provider?: PaymentProvider | null): string {
  if (!provider) return ''
  return PAYMENT_PROVIDERS.find((p) => p.id === provider)?.label ?? provider
}
