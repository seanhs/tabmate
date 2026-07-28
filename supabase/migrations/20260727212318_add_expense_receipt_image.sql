/*
# Add receipt image storage for expenses

1. New Storage Bucket
- `receipts` — public bucket for storing receipt photos attached to expenses.
  Images are publicly readable so all trip participants can view them.

2. Schema Changes
- `expenses` table: add `receipt_url` (text, nullable) — stores the public URL
  of a receipt image uploaded to the `receipts` storage bucket.

3. Security
- Storage bucket `receipts` is PUBLIC (anyone with the URL can read).
- Insert/Update/Delete on the bucket allowed for anon + authenticated
  (single-tenant no-auth app model, consistent with existing tables).
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expenses' AND column_name = 'receipt_url'
  ) THEN
    ALTER TABLE expenses ADD COLUMN receipt_url text;
  END IF;
END $$;

-- Storage policies for the receipts bucket
DROP POLICY IF EXISTS "anon_read_receipts" ON storage.objects;
CREATE POLICY "anon_read_receipts" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'receipts');

DROP POLICY IF EXISTS "anon_insert_receipts" ON storage.objects;
CREATE POLICY "anon_insert_receipts" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'receipts');

DROP POLICY IF EXISTS "anon_update_receipts" ON storage.objects;
CREATE POLICY "anon_update_receipts" ON storage.objects
  FOR UPDATE TO anon, authenticated
  USING (bucket_id = 'receipts') WITH CHECK (bucket_id = 'receipts');

DROP POLICY IF EXISTS "anon_delete_receipts" ON storage.objects;
CREATE POLICY "anon_delete_receipts" ON storage.objects
  FOR DELETE TO anon, authenticated
  USING (bucket_id = 'receipts');
