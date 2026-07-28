
/*
# TabStack V1 Schema

## Overview
Creates the core tables for the TabStack group expense balancer app.
This is a no-auth, link-shared app — all data is intentionally public/shared
via unguessable trip slugs. No user accounts are required.

## New Tables

### trips
The top-level container for a group trip or event.
- id: uuid primary key
- slug: unique, URL-safe identifier (e.g. "vegas-2026-v8f2a9") used in shareable links
- name: display name for the trip (e.g. "Vegas 2026")
- created_at: timestamp

### participants
People involved in a trip. Set by the organizer when creating the trip, and can be added later.
- id: uuid primary key
- trip_id: foreign key to trips
- name: participant's name (e.g. "Alex")
- created_at: timestamp

### expenses
Each expense logged against a trip.
- id: uuid primary key
- trip_id: foreign key to trips
- title: description of the expense (e.g. "Hotel Night 1")
- amount: decimal total amount paid
- paid_by: foreign key to participants (who paid)
- category: optional label (e.g. "Food", "Transport", "Accommodation")
- split_participant_ids: array of participant uuids who share this expense (empty = split among all)
- created_at: timestamp

## Security
- RLS enabled on all tables
- All policies use TO anon, authenticated with USING (true) since this is an intentionally
  public/shared app accessed via secret links — no login exists
*/

-- TRIPS
CREATE TABLE IF NOT EXISTS trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE trips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_trips" ON trips;
CREATE POLICY "anon_select_trips" ON trips FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_trips" ON trips;
CREATE POLICY "anon_insert_trips" ON trips FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_trips" ON trips;
CREATE POLICY "anon_update_trips" ON trips FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_trips" ON trips;
CREATE POLICY "anon_delete_trips" ON trips FOR DELETE TO anon, authenticated USING (true);

-- PARTICIPANTS
CREATE TABLE IF NOT EXISTS participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_participants" ON participants;
CREATE POLICY "anon_select_participants" ON participants FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_participants" ON participants;
CREATE POLICY "anon_insert_participants" ON participants FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_participants" ON participants;
CREATE POLICY "anon_update_participants" ON participants FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_participants" ON participants;
CREATE POLICY "anon_delete_participants" ON participants FOR DELETE TO anon, authenticated USING (true);

-- EXPENSES
CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  title text NOT NULL,
  amount numeric(10, 2) NOT NULL CHECK (amount > 0),
  paid_by uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'General',
  split_participant_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_expenses" ON expenses;
CREATE POLICY "anon_select_expenses" ON expenses FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_expenses" ON expenses;
CREATE POLICY "anon_insert_expenses" ON expenses FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_expenses" ON expenses;
CREATE POLICY "anon_update_expenses" ON expenses FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_expenses" ON expenses;
CREATE POLICY "anon_delete_expenses" ON expenses FOR DELETE TO anon, authenticated USING (true);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_participants_trip_id ON participants(trip_id);
CREATE INDEX IF NOT EXISTS idx_expenses_trip_id ON expenses(trip_id);
CREATE INDEX IF NOT EXISTS idx_trips_slug ON trips(slug);
