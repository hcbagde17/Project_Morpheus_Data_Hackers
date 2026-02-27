-- DANGER: This script deletes ALL data in the database EXCEPT the admin user
-- It is designed to cleanly reset the database for testing or production deployment.

BEGIN;

-- 1. Delete all exam-related transactional data
DELETE FROM answers;
DELETE FROM telemetry;
DELETE FROM flags;
DELETE FROM module_overrides;
DELETE FROM exam_sessions;

-- 2. Delete test structure and course data
DELETE FROM questions;
DELETE FROM tests;
DELETE FROM enrollments;
DELETE FROM courses;

-- 3. Delete user-related metadata
DELETE FROM parent_student;
DELETE FROM face_registrations;
DELETE FROM consents;
DELETE FROM audit_logs;

-- 4. Delete all users except admins
-- (This will retain users with role = 'admin')
DELETE FROM users 
WHERE role != 'admin';

-- Note: The `institutions` table is NOT deleted because a "Default Institution" 
-- is seeded by schema.sql and is typically required for course creation.
-- If you want a complete blank slate, uncomment the following line:
-- DELETE FROM institutions;

COMMIT;
