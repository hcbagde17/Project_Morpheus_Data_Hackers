
# Implementation Plan: Question Bank Refactor (Many-to-Many)

## Goal
Enable a true "Question Bank" where a single question (ID) can be used in multiple tests without duplication.

## 1. Database Schema Changes
*   **Table**: `questions`
    *   [REMOVE] `test_id` column.
    *   [KEEP] `id`, `question_text`, `options`, `correct_answer`, `marks`, others.
    *   [ADD] `course_id` (Optional, to organize bank by course).
*   **New Table**: `test_questions`
    *   `id` (UUID, PK)
    *   `test_id` (UUID, FK -> tests.id)
    *   `question_id` (UUID, FK -> questions.id)
    *   `question_order` (Integer)
    *   `marks` (Optional override? No, keep simple for now - assume question marks apply).

## 2. Migration Plan (SQL Script)
1.  Create `test_questions` table.
2.  Insert existing mappings: `INSERT INTO test_questions (test_id, question_id) SELECT test_id, id FROM questions`.
3.  Remove `test_id` from `questions`.

## 3. Application Updates

### [TestCreation.jsx]
*   **State**: Needs to track `question_id` for each question (if it's from bank).
*   **Save Logic**:
    *   Separate **New** questions from **Existing** (bank) questions.
    *   **New**: Insert into `questions`, then link in `test_questions`.
    *   **Existing**: Just insert link into `test_questions`.
*   **UI**: "Import" now just adds the `question_id` and data to the local state. Editing an imported question should probably **fork** it (create new) or warn user it edits globally.
    *   *Decision*: For simplicity/safety, checking "Imported" questions as "read-only" or "unlink on edit" is best. But user wants to *reuse* the ID.
    *   *Strategy*: "Import" adds it to the list. If user edits text, it becomes a **new** question (drops ID). If they just save, it links the ID.

### [QuestionBankModal.jsx]
*   **Query**: Fetch from `questions` directly, not filtered by `test_id` (unless joining).
*   **Display**: Show questions available in the pool.

### [ExamSession.jsx]
*   **Fetch**: Update query to join `test_questions` -> `questions`.
    *   Old: `select * from questions where test_id = ?`
    *   New: `select *, questions(*) from test_questions where test_id = ?` (and flatten structure).

### [StudentTestResult.jsx]
*   **Fetch**: Update to support new structure.

## Proposed Changes

### Database
*   `db_refactor_questions.sql`

### Files
#### [MODIFY] [TestCreation.jsx](file:///c:/Users/gandh/Desktop/Krish/ACM/PW%203.0/src/pages/TestCreation.jsx)
*   Update `handleSubmit` to handle linking.

#### [MODIFY] [ExamSession.jsx](file:///c:/Users/gandh/Desktop/Krish/ACM/PW%203.0/src/pages/ExamSession.jsx)
*   Update `loadExam` query.

#### [MODIFY] [QuestionBankModal.jsx](file:///c:/Users/gandh/Desktop/Krish/ACM/PW%203.0/src/components/QuestionBankModal.jsx)
*   Update fetch logic.

#### [MODIFY] [StudentTestResult.jsx](file:///c:/Users/gandh/Desktop/Krish/ACM/PW%203.0/src/pages/StudentTestResult.jsx)
*   Update fetch logic.
