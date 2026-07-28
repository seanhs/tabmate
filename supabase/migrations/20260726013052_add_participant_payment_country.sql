/*
# Add payment country to participants

## Summary
Participants can now tag their payment method with a country, so the app can
show only the payment providers that are actually valid for that country
(e.g. Interac e-Transfer for Canada, Venmo for the US).

## Changes
1. Modified Tables
   - `participants`
     - `payment_country` (text, nullable): ISO-style country code from the
       app's fixed list ('US', 'CA', 'GB', 'EU', 'AU', 'OTHER'). NULL means
       no country has been chosen yet (defaults to US in the UI).

## Security
- No new tables. RLS already enabled on `participants` with anon+authenticated
  CRUD. No policy changes needed.

## Notes
1. Column is nullable so existing participants are unaffected.
2. The frontend validates the country against a fixed list before writing.
3. Purely additive — no data loss.
*/

ALTER TABLE participants
  ADD COLUMN IF NOT EXISTS payment_country text;
