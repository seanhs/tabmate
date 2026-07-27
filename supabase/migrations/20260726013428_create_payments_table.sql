create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  from_participant_id uuid not null references participants(id) on delete cascade,
  to_participant_id uuid not null references participants(id) on delete cascade,
  amount numeric(12,2) not null,
  status text not null default 'pending' check (status in ('pending','confirmed')),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create index on payments (trip_id);
create index on payments (from_participant_id);
create index on payments (to_participant_id);
create index on payments (status);

alter table payments enable row level security;

create policy "select_payments" on payments for select to anon, authenticated using (true);
create policy "insert_payments" on payments for insert to anon, authenticated with check (true);
create policy "update_payments" on payments for update to anon, authenticated using (true) with check (true);
create policy "delete_payments" on payments for delete to anon, authenticated using (true);
