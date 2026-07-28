
-- Removes a participant's id from the split_participant_ids array of every
-- expense in a trip. Called before deleting a participant so that their id
-- doesn't linger in any split list (which would skew balance calculations
-- since calculateBalances iterates over split ids that may no longer exist).
--
-- SECURITY: definer runs as the owner so anon/authenticated clients can call it
-- without extra grants. It only touches rows scoped to the given trip_id.

CREATE OR REPLACE FUNCTION strip_participant_from_splits(
  p_trip_id uuid,
  p_participant_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE expenses
  SET split_participant_ids = array_remove(split_participant_ids, p_participant_id)
  WHERE trip_id = p_trip_id
    AND split_participant_ids @> ARRAY[p_participant_id]::uuid[];
END;
$$;

GRANT EXECUTE ON FUNCTION strip_participant_from_splits(uuid, uuid) TO anon, authenticated;
