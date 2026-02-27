-- ============================================
-- ProctorWatch: DATABASE MIGRATION + BUCKET SETUP
-- Run this in Supabase SQL Editor to prepare for testing
-- ============================================

-- STEP 0: FIX ADMIN CREDENTIALS
-- ============================================
-- Username: admin@pw.com  Password: Admin@123
-- Username: tech@pw.com   Password: Tech@123
UPDATE users SET password_hash = 'e86f78a8a3caf0b60d8e74e5942aa6d86dc150cd3c03338aef25b7d2d7e3acc7'
WHERE username = 'admin@pw.com';

UPDATE users SET password_hash = 'ab38322f1e4ca606045224e90fd3033f8e590bf15917adefdaddf7890ca03d99'
WHERE username = 'tech@pw.com';

-- Add full_name column to users table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'full_name') THEN
    ALTER TABLE users ADD COLUMN full_name TEXT;
  END IF;
END $$;

-- STEP 1: Update flags table to support new severity levels and columns
-- ============================================

-- Drop the old severity constraint if it exists
ALTER TABLE flags DROP CONSTRAINT IF EXISTS flags_severity_check;

-- Add the updated constraint with all severity levels
ALTER TABLE flags ADD CONSTRAINT flags_severity_check 
CHECK (severity IN ('RED', 'ORANGE', 'high', 'medium', 'low'));

-- Add 'type' column if flag_type is the only column
-- (Our app uses 'type', schema had 'flag_type' — make both work)
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'flags' AND column_name = 'type') THEN
    ALTER TABLE flags ADD COLUMN type TEXT;
  END IF;
END $$;

-- Add 'details' JSONB column (app sends details, schema had metadata)
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'flags' AND column_name = 'details') THEN
    ALTER TABLE flags ADD COLUMN details JSONB DEFAULT '{}';
  END IF;
END $$;


-- STEP 2: CREATE STORAGE BUCKETS
-- ============================================
-- NOTE: Supabase allows bucket creation via SQL using the storage schema

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('profile-photos', 'profile-photos', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('evidence-videos', 'evidence-videos', false, 104857600, ARRAY['video/webm', 'video/mp4'])
ON CONFLICT (id) DO NOTHING;


-- STEP 3: STORAGE POLICIES
-- ============================================

-- Drop existing policies to avoid conflicts (safe to re-run)
DROP POLICY IF EXISTS "Users can upload their own profile photo" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own profile photo" ON storage.objects;
DROP POLICY IF EXISTS "Profile photos are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "System can upload evidence videos" ON storage.objects;
DROP POLICY IF EXISTS "Teachers and admins can view evidence" ON storage.objects;

-- Profile Photos: Upload own
CREATE POLICY "Users can upload their own profile photo"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'profile-photos');

-- Profile Photos: Update own
CREATE POLICY "Users can update their own profile photo"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'profile-photos');

-- Profile Photos: Public read
CREATE POLICY "Profile photos are publicly accessible"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'profile-photos');

-- Evidence Videos: Upload (all authenticated for testing)
CREATE POLICY "System can upload evidence videos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'evidence-videos');

-- Evidence Videos: Read (all authenticated for testing)
CREATE POLICY "Teachers and admins can view evidence"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'evidence-videos');


-- STEP 4: VERIFICATION
-- ============================================
-- Run these queries to confirm everything is set up:

SELECT '--- BUCKETS ---' AS section;
SELECT id, name, public FROM storage.buckets;

SELECT '--- FLAGS TABLE COLUMNS ---' AS section;
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'flags' ORDER BY ordinal_position;

SELECT '--- STORAGE POLICIES ---' AS section;
SELECT policyname, tablename FROM pg_policies WHERE tablename = 'objects';
