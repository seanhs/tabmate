-- Tabmate schema
-- Tables: trips, participants, expenses

create extension if not exists "pgcrypto";

create table if not exists trips (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists participants (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (trip_id, name)
);

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  title text not null,
  amount numeric(12,2) not null,
  paid_by uuid not null references participants(id) on delete cascade,
  category text not null default 'General',
  split_participant_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create index on expenses (trip_id);
create index on expenses (paid_by);
create index on participants (trip_id);

alter table trips enable row level security;
alter table participants enable row level security;
alter table expenses enable row level security;

create policy "select_trips" on trips for select to anon, authenticated using (true);
create policy "insert_trips" on trips for insert to anon, authenticated with check (true);
create policy "update_trips" on trips for update to anon, authenticated using (true) with check (true);
create policy "delete_trips" on trips for delete to anon, authenticated using (true);

create policy "select_participants" on participants for select to anon, authenticated using (true);
create policy "insert_participants" on participants for insert to anon, authenticated with check (true);
create policy "update_participants" on participants for update to anon, authenticated using (true) with check (true);
create policy "delete_participants" on participants for delete to anon, authenticated using (true);

create policy "select_expenses" on expenses for select to anon, authenticated using (true);
create policy "insert_expenses" on expenses for insert to anon, authenticated with check (true);
create policy "update_expenses" on expenses for update to anon, authenticated using (true) with check (true);
create policy "delete_expenses" on expenses for delete to anon, authenticated using (true);
