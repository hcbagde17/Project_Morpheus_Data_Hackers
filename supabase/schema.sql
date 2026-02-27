-- ProctorWatch Database Schema for Supabase
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  phone TEXT,
  full_name TEXT,
  role TEXT NOT NULL CHECK (role IN ('technical', 'admin', 'teacher', 'student', 'parent')),
  password_hash TEXT NOT NULL,
  profile_photo_url TEXT,
  first_login BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. CONSENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS consents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL,
  accepted_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address TEXT
);

-- ============================================
-- 3. FACE REGISTRATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS face_registrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  embeddings JSONB NOT NULL,
  landmarks JSONB,
  quality_score FLOAT,
  registered_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 4. INSTITUTIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS institutions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 5. COURSES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id UUID REFERENCES institutions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  description TEXT,
  teacher_id UUID REFERENCES users(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 6. ENROLLMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS enrollments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  student_id UUID REFERENCES users(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(course_id, student_id)
);

-- ============================================
-- 7. PARENT-STUDENT RELATIONSHIP
-- ============================================
CREATE TABLE IF NOT EXISTS parent_student (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parent_id UUID REFERENCES users(id) ON DELETE CASCADE,
  student_id UUID REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(parent_id, student_id)
);

-- ============================================
-- 8. TESTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS tests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL,
  total_marks INTEGER DEFAULT 0,
  settings JSONB DEFAULT '{
    "randomize_questions": false,
    "randomize_options": false,
    "allow_resume": false,
    "show_results_immediately": false,
    "proctoring_enabled": true,
    "negative_marking": false,
    "extra_time_students": {}
  }',
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 9. QUESTIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  test_id UUID REFERENCES tests(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL CHECK (question_type IN ('MCQ_SINGLE', 'MCQ_MULTIPLE')),
  options JSONB NOT NULL,
  correct_answer JSONB NOT NULL,
  marks INTEGER DEFAULT 1,
  negative_marks INTEGER DEFAULT 0,
  question_order INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 10. EXAM SESSIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS exam_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  test_id UUID REFERENCES tests(id) ON DELETE CASCADE,
  student_id UUID REFERENCES users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  status TEXT DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'terminated', 'paused', 'submitted')),
  score INTEGER,
  total_flags INTEGER DEFAULT 0,
  red_flags INTEGER DEFAULT 0,
  orange_flags INTEGER DEFAULT 0,
  is_flagged BOOLEAN DEFAULT false,
  device_info JSONB,
  UNIQUE(test_id, student_id)
);

-- ============================================
-- 11. ANSWERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS answers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES exam_sessions(id) ON DELETE CASCADE,
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  selected_answer JSONB,
  is_correct BOOLEAN,
  marks_awarded INTEGER DEFAULT 0,
  answered_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, question_id)
);

-- ============================================
-- 12. FLAGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS flags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES exam_sessions(id) ON DELETE CASCADE,
  flag_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('RED', 'ORANGE')),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  confidence FLOAT,
  module TEXT,
  metadata JSONB DEFAULT '{}',
  evidence_url TEXT,
  reviewed BOOLEAN DEFAULT false,
  reviewed_by UUID REFERENCES users(id),
  review_action TEXT,
  review_notes TEXT,
  prev_flag_hash TEXT
);

-- ============================================
-- 13. MODULE OVERRIDES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS module_overrides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES exam_sessions(id) ON DELETE CASCADE,
  admin_id UUID REFERENCES users(id),
  disabled_modules JSONB NOT NULL DEFAULT '[]',
  reason TEXT NOT NULL,
  applied_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 14. AUDIT LOGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action TEXT NOT NULL,
  user_id UUID REFERENCES users(id),
  target_type TEXT,
  target_id UUID,
  details JSONB DEFAULT '{}',
  ip_address TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 15. TELEMETRY TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS telemetry (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES exam_sessions(id) ON DELETE CASCADE,
  fps FLOAT,
  cpu_usage FLOAT,
  memory_usage FLOAT,
  battery_level FLOAT,
  inference_times JSONB,
  network_latency FLOAT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- DEFAULT ADMIN USER (password: Admin@123)
-- ============================================
-- Password hash for 'Admin@123' using SHA-256
-- In production, use bcrypt. This is for seeding.
INSERT INTO users (email, username, phone, role, password_hash, first_login)
VALUES (
  'admin@pw.com',
  'admin@pw.com',
  '0000000000',
  'admin',
  'e86f78a8a3caf0b60d8e74e5942aa6d86dc150cd3c03338aef25b7d2d7e3acc7',
  true
) ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash;

-- ============================================
-- DEFAULT TECHNICAL USER
-- ============================================
INSERT INTO users (email, username, phone, role, password_hash, first_login)
VALUES (
  'tech@pw.com',
  'tech@pw.com',
  '0000000001',
  'technical',
  'ab38322f1e4ca606045224e90fd3033f8e590bf15917adefdaddf7890ca03d99',
  true
) ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash;

-- ============================================
-- DEFAULT INSTITUTION
-- ============================================
INSERT INTO institutions (name, settings)
VALUES (
  'Default Institution',
  '{
    "flag_thresholds": {
      "escalation_count": 10,
      "escalation_window_minutes": 5
    },
    "proctoring_defaults": {
      "video_enabled": true,
      "audio_enabled": true,
      "network_enabled": true,
      "device_enabled": true,
      "behavior_enabled": true
    }
  }'
) ON CONFLICT DO NOTHING;

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_enrollments_student ON enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_course ON enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_tests_course ON tests(course_id);
CREATE INDEX IF NOT EXISTS idx_questions_test ON questions(test_id);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_test ON exam_sessions(test_id);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_student ON exam_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_answers_session ON answers(session_id);
CREATE INDEX IF NOT EXISTS idx_flags_session ON flags(session_id);
CREATE INDEX IF NOT EXISTS idx_flags_severity ON flags(severity);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_telemetry_session ON telemetry(session_id);

-- ============================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE face_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_student ENABLE ROW LEVEL SECURITY;
ALTER TABLE tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE module_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE telemetry ENABLE ROW LEVEL SECURITY;

-- For MVP: Allow all authenticated operations via service role
-- In production, you would create fine-grained policies per role
CREATE POLICY "Allow all for authenticated" ON users FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON consents FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON face_registrations FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON institutions FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON courses FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON enrollments FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON parent_student FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON tests FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON questions FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON exam_sessions FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON answers FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON flags FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON module_overrides FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON audit_logs FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON telemetry FOR ALL USING (true);
