create table if not exists analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  trip_id uuid references trips(id) on delete set null,
  trip_slug text,
  properties jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index on analytics_events (event_name);
create index on analytics_events (trip_id);
create index on analytics_events (created_at desc);

alter table analytics_events enable row level security;

create policy "insert_analytics" on analytics_events for insert to anon, authenticated with check (true);
create policy "select_analytics" on analytics_events for select to authenticated using (true);
