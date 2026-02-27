
# Implementation Plan: Role-Based Flag Review & Exam Invalidation

## Goal
Separate the flag review process for Teachers and Admins, ensuring proper escalation workflows and enforcing exam invalidation.

## Role-Based Logic

### Teacher (or Proctor)
- **View:** All flags created during sessions.
- **Actions:**
    - `Dismiss`: Mark as reviewed (false alarm).
    - `Warn`: Send a warning (recorded in logs).
    - `Escalate`: Mark as `escalated` for Admin review.
- **Restriction:** Cannot invalidate exams directly.

### Admin
- **View:** Only flags marked as `escalated`.
- **Actions:**
    - `Dismiss`: Override escalation.
    - `Warn`: Issue final warning.
    - `Invalidate`: Mark exam session as `invalidated` (score = 0).

## Database Updates
- `flags` table: `review_action` column will store 'dismiss', 'warn', 'escalate', 'invalidate'.
- `exam_sessions` table: `status` column will support 'invalidated'.

## Component Changes

### 1. `src/pages/FlagReview.jsx`
- Fetch logic based on role:
    - If `admin`: `query.eq('review_action', 'escalate')` (or a helper field).
    - If `teacher`: `query` (all).
- Action dropdown options based on role.
- `handleReview` logic:
    - If action is `invalidate`:
        - Update `flags` record.
        - **CRITICAL**: Update `exam_sessions` status to `invalidated` and `score` to 0.

### 2. `src/pages/StudentPerformance.jsx`
- Display "Invalidated" status if `session.status === 'invalidated'`.
- Potentially show a list of flags/violations for transparency.

## Verification
- Login as Teacher -> Escalate a flag.
- Login as Admin -> See escalated flag -> Invalidate.
- Login as Student -> See "Exam Invalidated" status checks.
