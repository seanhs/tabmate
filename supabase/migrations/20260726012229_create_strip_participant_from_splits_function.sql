create or replace function strip_participant_from_splits(
  p_trip_id uuid,
  p_participant_id uuid
) returns void as $$
begin
  update expenses
  set split_participant_ids = array_remove(split_participant_ids, p_participant_id)
  where trip_id = p_trip_id
    and p_participant_id = any(split_participant_ids);
end;
$$ language plpgsql;
