# Live Monitor ↔ Student Session — Real-Time Connection

## Problem

The admin's **Live Monitor** already has Suspend / Resume / Terminate buttons. When clicked, they correctly write to the `exam_sessions` table in Supabase (updating `status` to `'paused'`, `'in_progress'`, or `'terminated'`).

**The gap:** [ExamSession.jsx](file:///d:/Projects/PW/src/pages/ExamSession.jsx) on the student side **never subscribes** to changes in the `exam_sessions` table. So when the admin terminates a session, the student's browser has no idea — the exam just keeps running normally until the student manually submits or time runs out.

## What Needs to Change

### 1. Student's [ExamSession.jsx](file:///d:/Projects/PW/src/pages/ExamSession.jsx) — Add Supabase Realtime Subscription

The student's exam page needs to **subscribe to changes** on its own session row. When the admin changes `status`:

- **`terminated`** → immediately stop all proctoring, show termination message, lock the UI.
- **`paused`** → show a pause overlay, freeze the timer, disable question navigation.
- **`in_progress`** (after paused) → dismiss the pause overlay, resume the timer.

This is the **core change** — everything else is enhancement.

### 2. [LiveSessionMonitor.jsx](file:///d:/Projects/PW/src/pages/LiveSessionMonitor.jsx) — Enrich Terminate Action

Currently, the terminate action only sets `status = 'terminated'`. It should also:
- Write `ended_at = NOW()` ✅ (already done)
- Write `score = 0` when terminating for violations (mark as disqualified)
- Write the current `red_flags` + `orange_flags` counts into the session record
- Add a `termination_reason` field to metadata so the student sees *why* they were terminated

### 3. [DashboardRouter.jsx](file:///d:/Projects/PW/src/pages/DashboardRouter.jsx) — Fix Duplicate Route

There are two identical `<Route path="live-monitor" ...>` entries (lines 64 & 65). Remove the duplicate.

### 4. SQL Migration — Enable Realtime on `exam_sessions`

Supabase Realtime must be explicitly enabled for a table to broadcast row-level changes. A short SQL snippet must be run in the Supabase SQL Editor.

---

## Proposed Changes

### Core Logic

#### [MODIFY] [ExamSession.jsx](file:///d:/Projects/PW/src/pages/ExamSession.jsx)

Add a Supabase Realtime subscription **after** the session is created/loaded. Subscribe to `UPDATE` events on `exam_sessions` filtered to `id = session.id`.

```
useEffect(() => {
  if (!session?.id || submitted) return;

  const channel = supabase
    .channel(`session-control-${session.id}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'exam_sessions',
      filter: `id=eq.${session.id}`,
    }, (payload) => {
      const newStatus = payload.new?.status;
      if (newStatus === 'terminated') → handle termination
      if (newStatus === 'paused')     → handle pause
      if (newStatus === 'in_progress') → handle resume
    })
    .subscribe();

  return () => supabase.removeChannel(channel);
}, [session?.id, submitted]);
```

New state variables:
- `adminPaused` (boolean) — renders a full-screen pause overlay
- `terminationReason` (string) — shown in the termination message

Timer logic update: pause/resume the countdown interval when `adminPaused` changes.

#### [MODIFY] [LiveSessionMonitor.jsx](file:///d:/Projects/PW/src/pages/LiveSessionMonitor.jsx)

Update the [handleAction()](file:///d:/Projects/PW/src/pages/LiveSessionMonitor.jsx#55-82) function for the `terminate` case to also:
- Query current flag counts for the session before writing
- Set `score = 0` in the update payload
- Set `red_flags` and `orange_flags` in the update payload from the live query
- Include the admin's typed `actionReason` in a `termination_reason` metadata column

Add a new column `termination_reason` in the termination update (stored in `metadata JSONB` on `exam_sessions`, no schema change needed):
```js
await supabase.from('exam_sessions').update({
  status: 'terminated',
  ended_at: new Date().toISOString(),
  score: 0,
  red_flags: currentRedFlags,
  orange_flags: currentOrangeFlags,
  metadata: { termination_reason: actionReason, terminated_by: user.id }
}).eq('id', selectedSession.id);
```

#### [MODIFY] [DashboardRouter.jsx](file:///d:/Projects/PW/src/pages/DashboardRouter.jsx)

Remove the duplicate route on line 65.

---

### Database

#### [NEW] SQL migration — run in Supabase SQL Editor

```sql
-- Enable Realtime for exam_sessions so clients receive live row updates
ALTER PUBLICATION supabase_realtime ADD TABLE exam_sessions;
```

> [!IMPORTANT]
> This one-line SQL must be run in the **Supabase Dashboard → SQL Editor** before the feature will work. Realtime is not enabled by default on tables.

---

## Verification Plan

### Manual Testing Steps

> These steps assume you have at least one teacher-created test and two browser windows available.

1. **Open two browser windows** — log in as a student in Window 1 and as an admin (or teacher) in Window 2.
2. **In Window 1 (student):** Navigate to a test and get through the pre-test checks to reach the exam page.
3. **In Window 2 (admin):** Go to `Live Monitor`. Confirm the student's session appears in the table.
4. **Test Suspend:**
   - Click the Pause (⏸) icon for the student's session, enter a reason, confirm.
   - **Expected in Window 1:** A full-screen "Exam Paused" overlay appears within ~2 seconds. The timer freezes. Questions are not clickable.
5. **Test Resume:**
   - Click the Play (▶) icon, enter a reason, confirm.
   - **Expected in Window 1:** The pause overlay disappears. Timer resumes counting down.
6. **Test Terminate:**
   - Click the Stop (⏹) icon, enter a reason, confirm.
   - **Expected in Window 1:** All proctoring stops, a "Terminated" message is shown with the admin's reason. Student cannot interact with the exam any further.
   - **Expected in Supabase Dashboard → `exam_sessions` table:** The row for this session should show `status = terminated`, `score = 0`, `ended_at = <timestamp>`.
   - **Expected in `audit_logs`:** A `SESSION_TERMINATE` entry should exist with the reason and student info.

### Automated Check (no tests framework exists)

There are no existing automated tests in this project. A quick smoke-check can be done by opening the browser console on the student page and confirming the Realtime subscription channel is connected:
```
// In browser console on the ExamSession page, after exam loads:
// You should see a log line like:
// [supabase] Subscribed to session-control-<uuid>
```
