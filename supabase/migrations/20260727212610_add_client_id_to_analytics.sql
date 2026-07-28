/*
# Add client_id to analytics_events

1. Schema Changes
- `analytics_events` table: add `client_id` (text, nullable) — a locally-generated
  unique identifier stored in the user's browser localStorage. This lets us
  distinguish unique users (sessions) across events: how many users create
  trips vs. join existing ones, returning users, etc.

2. Security
- No RLS changes. The existing anon/authenticated insert policy already covers
  this column. No new policies needed since it's just an additional nullable
  column on an existing table.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'analytics_events' AND column_name = 'client_id'
  ) THEN
    ALTER TABLE analytics_events ADD COLUMN client_id text;
  END IF;
END $$;
