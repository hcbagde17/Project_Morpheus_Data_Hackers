-- Supabase Storage Buckets Configuration
-- 
-- IMPORTANT: Storage buckets MUST be created via the Supabase Dashboard UI or API,
-- NOT via SQL INSERT. Follow the setup instructions below.

-- ============================================
-- BUCKET SETUP INSTRUCTIONS (Do this FIRST in Supabase Dashboard)
-- ============================================

-- 1. Go to: https://app.supabase.com/project/YOUR_PROJECT/storage/buckets
-- 2. Click "New bucket" button
-- 3. Create the following buckets:

--    Bucket 1: profile-photos
--    - Name: profile-photos
--    - Public: YES (toggle ON)
--    - File size limit: 5MB
--    - Allowed MIME types: image/jpeg, image/png, image/webp

--    Bucket 2: evidence-videos
--    - Name: evidence-videos  
--    - Public: NO (toggle OFF)
--    - File size limit: 100MB
--    - Allowed MIME types: video/webm, video/mp4

-- ============================================
-- STORAGE POLICIES (Run this SQL AFTER creating buckets)
-- ============================================

-- Profile Photos: Allow authenticated users to upload their own photo
CREATE POLICY "Users can upload their own profile photo"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'profile-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Profile Photos: Allow authenticated users to update their own photo
CREATE POLICY "Users can update their own profile photo"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'profile-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Profile Photos: Public read access
CREATE POLICY "Profile photos are publicly accessible"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'profile-photos');

-- Evidence Videos: Allow system to upload (service role)
-- Note: In production, use service role key for uploads from proctoring engine
CREATE POLICY "System can upload evidence videos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'evidence-videos');

-- Evidence Videos: Allow teachers/admins to view evidence for their sessions
CREATE POLICY "Teachers and admins can view evidence"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'evidence-videos' AND
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('teacher', 'admin', 'technical')
  )
);

-- ============================================
-- HELPER FUNCTIONS FOR STORAGE
-- ============================================

-- Function to clean up old evidence videos (older than 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_evidence()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM storage.objects
  WHERE bucket_id = 'evidence-videos'
  AND created_at < NOW() - INTERVAL '90 days';
END;
$$;

-- Note: To schedule automatic cleanup, you would need the pg_cron extension:
-- SELECT cron.schedule('cleanup-evidence', '0 2 * * *', 'SELECT cleanup_old_evidence();');
-- However, pg_cron is not enabled by default on Supabase free tier.

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Check if buckets exist
SELECT id, name, public FROM storage.buckets;

-- Check if policies are created
SELECT policyname, tablename FROM pg_policies WHERE tablename = 'objects';
