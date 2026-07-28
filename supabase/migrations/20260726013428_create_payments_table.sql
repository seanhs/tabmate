/*
# Create payments table for settlement tracking

## Summary
Records individual settlement payments between participants so that people
can mark a payment as "paid" and the recipient can confirm it. Confirmed
payments adjust the balances so settled debts disappear from the list.

## New Tables
- `payments`
  - `id` (uuid, primary key)
  - `trip_id` (uuid, FK to trips, cascade delete)
  - `from_participant_id` (uuid, FK to participants, cascade delete)
  - `to_participant_id` (uuid, FK to participants, cascade delete)
  - `amount` (numeric, not null)
  - `status` (text, not null, default 'pending') — 'pending' or 'confirmed'
  - `created_at` (timestamptz, default now())
  - `confirmed_at` (timestamptz, nullable)

## Security
- RLS enabled on `payments`.
- This is a no-auth single-tenant app, so anon+authenticated CRUD is allowed
  (the trip link IS the access control — anyone with the link can see/edit).

## Notes
1. Only one pending payment per (from, to) pair at a time — enforced by a
   partial unique index so duplicate "mark as paid" clicks don't create
   duplicates.
2. Confirmed payments are factored into balance calculations client-side.
3. When a payment is confirmed, `confirmed_at` is set for audit.
*/

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  from_participant_id uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  to_participant_id uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_payments" ON payments;
CREATE POLICY "anon_select_payments" ON payments FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_payments" ON payments;
CREATE POLICY "anon_insert_payments" ON payments FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_payments" ON payments;
CREATE POLICY "anon_update_payments" ON payments FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_payments" ON payments;
CREATE POLICY "anon_delete_payments" ON payments FOR DELETE
  TO anon, authenticated USING (true);

-- Prevent duplicate pending payments for the same (from, to) pair
CREATE UNIQUE INDEX IF NOT EXISTS payments_pending_unique
  ON payments (trip_id, from_participant_id, to_participant_id)
  WHERE status = 'pending';
