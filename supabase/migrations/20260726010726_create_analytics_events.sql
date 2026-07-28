
/*
# TabStack Analytics Events Table

## Overview
Creates a simple event-logging table to track key user actions for V1
product analytics. No auth required — events are logged via the anon key.

## New Tables

### analytics_events
Lightweight event log for product analytics.
- id: uuid primary key
- event_name: the action taken (e.g. "trip_created", "expense_added")
- trip_id: optional foreign key to trips (null for landing-page events)
- trip_slug: optional slug for easy human-readable queries
- properties: jsonb column for arbitrary event metadata (amount, participant_count, etc.)
- created_at: timestamp

## Security
- RLS enabled
- anon + authenticated can INSERT (to log events)
- No SELECT for anon (analytics are read via execute_sql or dashboard, not the frontend)
*/

CREATE TABLE IF NOT EXISTS analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  trip_id uuid REFERENCES trips(id) ON DELETE SET NULL,
  trip_slug text,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_insert_events" ON analytics_events;
CREATE POLICY "anon_insert_events" ON analytics_events FOR INSERT
TO anon, authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_events_name ON analytics_events(event_name);
CREATE INDEX IF NOT EXISTS idx_events_created ON analytics_events(created_at);
CREATE INDEX IF NOT EXISTS idx_events_trip_id ON analytics_events(trip_id);
