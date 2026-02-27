-- ============================================
-- FIX: RLS + Storage Policies for Custom Auth
-- ============================================
-- Our app uses custom auth (username/password in users table),
-- NOT Supabase Auth. So the client operates as 'anon' role.
-- All policies must allow 'anon' access.

-- STEP 1: Fix TABLE RLS policies (drop + recreate with TO public)
-- ============================================
DO $$ 
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'users','consents','face_registrations','institutions','courses',
    'enrollments','parent_student','tests','questions','exam_sessions',
    'answers','flags','module_overrides','audit_logs','telemetry'
  ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Allow all for authenticated" ON %I', tbl);
    EXECUTE format('CREATE POLICY "Allow all access" ON %I FOR ALL TO public USING (true) WITH CHECK (true)', tbl);
  END LOOP;
END $$;


-- STEP 2: Fix STORAGE policies (allow anon uploads/reads)
-- ============================================
DROP POLICY IF EXISTS "Users can upload their own profile photo" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own profile photo" ON storage.objects;
DROP POLICY IF EXISTS "Profile photos are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "System can upload evidence videos" ON storage.objects;
DROP POLICY IF EXISTS "Teachers and admins can view evidence" ON storage.objects;

-- Allow anyone to upload to profile-photos
CREATE POLICY "Allow profile photo upload"
ON storage.objects FOR INSERT TO public
WITH CHECK (bucket_id = 'profile-photos');

-- Allow anyone to update profile-photos
CREATE POLICY "Allow profile photo update"
ON storage.objects FOR UPDATE TO public
USING (bucket_id = 'profile-photos');

-- Allow anyone to read profile-photos
CREATE POLICY "Allow profile photo read"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'profile-photos');

-- Allow anyone to upload evidence videos
CREATE POLICY "Allow evidence upload"
ON storage.objects FOR INSERT TO public
WITH CHECK (bucket_id = 'evidence-videos');

-- Allow anyone to read evidence videos
CREATE POLICY "Allow evidence read"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'evidence-videos');


-- STEP 3: Ensure buckets exist
-- ============================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('profile-photos', 'profile-photos', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('evidence-videos', 'evidence-videos', false, 104857600, ARRAY['video/webm', 'video/mp4'])
ON CONFLICT (id) DO NOTHING;


-- STEP 4: Verify
-- ============================================
SELECT 'BUCKETS' AS check_type, name, public FROM storage.buckets;
SELECT 'TABLE POLICIES' AS check_type, tablename, policyname FROM pg_policies WHERE schemaname = 'public';
SELECT 'STORAGE POLICIES' AS check_type, tablename, policyname FROM pg_policies WHERE tablename = 'objects';
