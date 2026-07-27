alter table participants
  add column if not exists payment_provider text,
  add column if not exists payment_handle text;
