/*
# Add payment method fields to participants

## Summary
Each participant can now store their preferred payment method so that
settlement payment links use the recipient's preferred provider instead of
hard-coded Venmo / Cash App. This makes settlements work for people in any
country (PayPal and Wise have broad global coverage; Venmo, Cash App, and
Revolut cover their respective regions; "Other" lets someone paste any link).

## Changes
1. Modified Tables
   - `participants`
     - `payment_provider` (text, nullable): one of
       'paypal', 'wise', 'venmo', 'cashapp', 'revolut', 'other'.
       NULL means no payment method has been set yet.
     - `payment_handle` (text, nullable): the identifier for that provider
       (PayPal.me username, Wise username, Venmo/Cash App/Revolut handle,
       or a full URL for "other").

## Security
- No new tables. RLS already enabled on `participants` with anon+authenticated
  CRUD (single-tenant, no-auth app). No policy changes needed — the new
  nullable columns are covered by the existing permissive policies.

## Notes
1. Both columns are nullable so existing participants are unaffected.
2. The frontend validates provider against a fixed list before writing.
3. No data is lost — this is purely additive.
*/

ALTER TABLE participants
  ADD COLUMN IF NOT EXISTS payment_provider text,
  ADD COLUMN IF NOT EXISTS payment_handle text;
