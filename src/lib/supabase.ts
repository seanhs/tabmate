import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Trip = {
  id: string
  slug: string
  name: string
  created_at: string
}

export type PaymentProvider =
  | 'paypal'
  | 'wise'
  | 'venmo'
  | 'cashapp'
  | 'revolut'
  | 'interac'
  | 'other'

export type CountryCode = 'US' | 'CA' | 'GB' | 'EU' | 'AU' | 'OTHER'

export const COUNTRIES: { code: CountryCode; label: string; flag: string }[] = [
  { code: 'US', label: 'United States', flag: '🇺🇸' },
  { code: 'CA', label: 'Canada', flag: '🇨🇦' },
  { code: 'GB', label: 'United Kingdom', flag: '🇬🇧' },
  { code: 'EU', label: 'Europe', flag: '🇪🇺' },
  { code: 'AU', label: 'Australia', flag: '🇦🇺' },
  { code: 'OTHER', label: 'Other / Global', flag: '🌍' },
]

export const PAYMENT_PROVIDERS: {
  id: PaymentProvider
  label: string
  hint: string
  countries: CountryCode[]
}[] = [
  { id: 'paypal', label: 'PayPal', hint: 'Your PayPal.me username (e.g. janedoe)', countries: ['US', 'CA', 'GB', 'EU', 'AU', 'OTHER'] },
  { id: 'wise', label: 'Wise', hint: 'Your Wise username (e.g. janedoe)', countries: ['GB', 'EU', 'AU', 'OTHER'] },
  { id: 'venmo', label: 'Venmo', hint: 'Your Venmo @username', countries: ['US'] },
  { id: 'cashapp', label: 'Cash App', hint: 'Your $Cashtag', countries: ['US', 'GB'] },
  { id: 'revolut', label: 'Revolut', hint: 'Your Revolut @username', countries: ['GB', 'EU'] },
  { id: 'interac', label: 'Interac e-Transfer', hint: 'Your email or phone for e-Transfer', countries: ['CA'] },
  { id: 'other', label: 'Other', hint: 'A full payment link (e.g. bank details URL)', countries: ['US', 'CA', 'GB', 'EU', 'AU', 'OTHER'] },
]

export function providersForCountry(country: CountryCode): typeof PAYMENT_PROVIDERS {
  return PAYMENT_PROVIDERS.filter((p) => p.countries.includes(country))
}

export type Participant = {
  id: string
  trip_id: string
  name: string
  created_at: string
  payment_provider?: PaymentProvider | null
  payment_handle?: string | null
  payment_country?: CountryCode | null
}

export type Expense = {
  id: string
  trip_id: string
  title: string
  amount: number
  paid_by: string
  category: string
  split_participant_ids: string[]
  created_at: string
}

export type TripWithParticipants = Trip & {
  participants: Participant[]
}

export type ExpenseWithDetails = Expense & {
  paid_by_participant?: Participant
  split_participants?: Participant[]
}

export type PaymentStatus = 'pending' | 'confirmed'

export type Payment = {
  id: string
  trip_id: string
  from_participant_id: string
  to_participant_id: string
  amount: number
  status: PaymentStatus
  created_at: string
  confirmed_at: string | null
}
