
-- DATABASE REFACTOR: QUESTIONS MANY-TO-MANY
-- Run this in your Supabase SQL Editor

BEGIN;

-- 1. Create Junction Table
CREATE TABLE IF NOT EXISTS test_questions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    test_id UUID REFERENCES tests(id) ON DELETE CASCADE,
    question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
    question_order INTEGER,
    marks INTEGER, -- Optional override, defaults to question marks if null
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(test_id, question_id)
);

-- 2. Migrate Existing Data
-- Copy relationships from 'questions' table to new junction table
INSERT INTO test_questions (test_id, question_id, question_order, marks)
SELECT test_id, id, question_order, marks
FROM questions
WHERE test_id IS NOT NULL;

-- 3. Update Questions Table
-- Make questions independent
ALTER TABLE questions DROP COLUMN IF EXISTS test_id;
ALTER TABLE questions DROP COLUMN IF EXISTS question_order; -- Order is now per-test

-- 4. CLEANUP (Fixed)
-- Clear tables if requested (Commented out by default for safety)
-- TRUNCATE TABLE flags RESTART IDENTITY CASCADE;
-- TRUNCATE TABLE answers RESTART IDENTITY CASCADE;
-- TRUNCATE TABLE exam_sessions RESTART IDENTITY CASCADE;

-- Handle evidence logs safely
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'evidence_logs') THEN
        TRUNCATE TABLE evidence_logs RESTART IDENTITY CASCADE;
    END IF;
END $$;


COMMIT;
