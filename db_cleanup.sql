
-- DATABASE CLEANUP SCRIPT
-- Run this in your Supabase SQL Editor

-- 1. CLEAR FLAG HISTORY
-- Removes all flags and their related evidence logs
TRUNCATE TABLE flags RESTART IDENTITY CASCADE;
-- Also clear flag-related audit logs if needed
DELETE FROM audit_logs WHERE action LIKE '%FLAG%';


-- 2. CLEAR EXAM SESSIONS & RESULTS
-- Removes all student attempts, answers, and sessions
TRUNCATE TABLE answers RESTART IDENTITY CASCADE;
TRUNCATE TABLE exam_sessions RESTART IDENTITY CASCADE;
TRUNCATE TABLE evidence_logs RESTART IDENTITY CASCADE;


-- 3. CLEAR QUESTION BANK (TESTS & QUESTIONS)
-- WARNING: This removes ALL Tests and Questions.
-- Only run this if you want to completely reset the content.

-- TRUNCATE TABLE questions RESTART IDENTITY CASCADE;
-- TRUNCATE TABLE tests RESTART IDENTITY CASCADE;


-- 4. VACUUM (Optional, optimizes storage)
-- VACUUM FULL;
