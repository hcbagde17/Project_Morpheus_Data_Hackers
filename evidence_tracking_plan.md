# Evidence Tracking — Root Cause Analysis & Fix Plan

## How the Pipeline Is Supposed to Work

```
ExamSession detects violation
  → logFlag() inserts row to 'flags' table (gets back the row ID)
  → captureForFlag(sessionId, flagId) is called
       → extracts last 10s of video from circular buffer
       → uploads .webm to Supabase Storage bucket 'evidence-videos'
       → gets public URL
       → updates flags row: SET evidence_url = <url>

Teacher opens FlagReview
  → loads flags rows (including evidence_url)
  → if evidence_url is set → shows ▶ play button
  → clicking it opens a dialog with <video src={evidence_url}> 
```

## Why It's Broken — 4 Root Causes

---

### Bug 1 — Private Bucket + `getPublicUrl` = Broken URL 🔴
**Files:** [supabase/storage.sql](file:///d:/Projects/PW/supabase/storage.sql), [src/lib/evidenceCapture.js](file:///d:/Projects/PW/src/lib/evidenceCapture.js)

The storage setup file says:
```sql
-- Bucket 2: evidence-videos
-- Public: NO (toggle OFF)
```

But [evidenceCapture.js](file:///d:/Projects/PW/src/lib/evidenceCapture.js) calls `getPublicUrl()`:
```js
const { data: urlData } = supabase.storage
    .from('evidence-videos')
    .getPublicUrl(item.fileName);
```

**`getPublicUrl()` on a private bucket returns a URL that looks valid but returns HTTP 400/403 when accessed.** The URL is stored in the DB — so `evidence_url` is not null, the play button appears — but the video player gets a 403 error and shows nothing.

**Fix options (pick one):**
- **Option A (Recommended):** Make the bucket **public** (simpler, appropriate since only admins/teachers can reach this page anyway).
- **Option B:** Switch from `getPublicUrl` to `createSignedUrl` with a long expiry. Signed URLs expire, so the teacher/admin must be viewing the flag within that window.

---

### Bug 2 — RED Flag Race Condition: Proctoring Stops Before Upload Finishes 🔴
**File:** [src/pages/ExamSession.jsx](file:///d:/Projects/PW/src/pages/ExamSession.jsx) (lines 86–98)

When a RED flag fires, `logFlag()` does this in sequence:
```js
if (dbSeverity === 'RED') {
    await stopAllProctoring();   // <-- Line 87: stops MediaRecorder + camera stream
    ...
    setSubmitted(true);
}
```

But [captureForFlag()](file:///d:/Projects/PW/src/lib/evidenceCapture.js#92-113) is called on line 76 — **before** the RED check — and it queues an **async upload**. The upload runs in the background. When [stopAllProctoring()](file:///d:/Projects/PW/src/pages/ExamSession.jsx#104-119) fires:
1. `mediaService.stop()` kills the camera stream
2. `evidenceRef.current.stop()` calls `recorder.stop()` and **clears the chunks array** (`this.chunks = []`)

This happens almost instantly, wiping out the buffer **before the upload queue has time to process the clip**. The upload queue never gets the blob because [extractClip()](file:///d:/Projects/PW/src/lib/evidenceCapture.js#67-91) was called, a blob was created, and queued — but the Supabase upload is async and happens *after* [stop()](file:///d:/Projects/PW/src/lib/audioIntelligence.js#292-324) clears everything.

**Fix:** In `EvidenceCapture.stop()`, don't clear `chunks` immediately. Instead, wait for the upload queue to drain first, then clear. Or: for RED flags specifically, call [captureForFlag](file:///d:/Projects/PW/src/lib/evidenceCapture.js#92-113) and `await` its queue completion before calling [stopAllProctoring](file:///d:/Projects/PW/src/pages/ExamSession.jsx#104-119).

---

### Bug 3 — Field Name Mismatch: `metadata` vs `details` 🟠
**Files:** [src/pages/ExamSession.jsx](file:///d:/Projects/PW/src/pages/ExamSession.jsx) (line 70), [src/pages/FlagReview.jsx](file:///d:/Projects/PW/src/pages/FlagReview.jsx) (lines 252, 326)

Flags are inserted with the message stored in `metadata`:
```js
// ExamSession.jsx line 70
metadata: { message: flag.message },
```

But [FlagReview.jsx](file:///d:/Projects/PW/src/pages/FlagReview.jsx) reads it from `details`:
```jsx
// Line 252
{f.details?.message || '—'}

// Line 326 (dialog)
{selectedFlag?.details?.message || '—'}
```

The `flags` table schema has a `metadata JSONB` column. There is **no `details` column**. So the Details column in the flags table always shows `—` even when a message exists.

**Fix:** Change [FlagReview.jsx](file:///d:/Projects/PW/src/pages/FlagReview.jsx) to read `f.metadata?.message` instead of `f.details?.message`.

---

### Bug 4 — `getPublicUrl` Returns Stale URL When Bucket Becomes Public 🟡
**File:** [src/lib/evidenceCapture.js](file:///d:/Projects/PW/src/lib/evidenceCapture.js) (line 136)

`getPublicUrl()` is a **synchronous** call (no `await`) — it just constructs the URL string locally based on the bucket name and file path. The URL format is:
```
https://<project>.supabase.co/storage/v1/object/public/evidence-videos/<path>
```

This is fine **if** the bucket is public. But currently the bucket is private, so the URL format is correct but requests to it will always return 403. This ties back to Bug 1.

---

## Summary of All Bugs

| # | Severity | Location | Issue | Quick Fix |
|---|----------|----------|-------|-----------|
| 1 | 🔴 Critical | Supabase Dashboard + [evidenceCapture.js](file:///d:/Projects/PW/src/lib/evidenceCapture.js) | Private bucket + `getPublicUrl` = 403 on every video | Make bucket public OR switch to `createSignedUrl` |
| 2 | 🔴 Critical | [ExamSession.jsx](file:///d:/Projects/PW/src/pages/ExamSession.jsx) + [evidenceCapture.js](file:///d:/Projects/PW/src/lib/evidenceCapture.js) | RED flag stops proctoring before upload completes, wiping the upload queue | Don't clear `chunks` in [stop()](file:///d:/Projects/PW/src/lib/audioIntelligence.js#292-324) until queue drains |
| 3 | 🟠 Medium | [FlagReview.jsx](file:///d:/Projects/PW/src/pages/FlagReview.jsx) | Reads `details?.message` but data is stored in `metadata.message` | Change to `metadata?.message` in FlagReview |
| 4 | 🟡 Minor | [evidenceCapture.js](file:///d:/Projects/PW/src/lib/evidenceCapture.js) | `getPublicUrl` is sync but called without `await` — harmless but reflects assumption that bucket is public | Fixed by resolving Bug 1 |

---

## Proposed Changes

### Step 0 — Supabase Dashboard (Manual — Do First)

Go to **Supabase Dashboard → Storage → evidence-videos bucket → Edit** and toggle **Public: ON**.

Then run this SQL to also create a public read policy if not already present:
```sql
-- Make evidence-videos publicly readable (URLs work without auth)
CREATE POLICY "Public read evidence videos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'evidence-videos');
```

> [!IMPORTANT]
> This is a prerequisite. No code change will fix the 403s without this step.

---

### Code Changes

#### [MODIFY] [evidenceCapture.js](file:///d:/Projects/PW/src/lib/evidenceCapture.js)

**Fix Bug 2:** Change [stop()](file:///d:/Projects/PW/src/lib/audioIntelligence.js#292-324) to drain the upload queue before clearing chunks.

```diff
- stop() {
-     if (this.recorder && this.isRecording) {
-         this.recorder.stop();
-         this.isRecording = false;
-         this.chunks = [];           // ← clears buffer immediately!
-         this.chunkTimestamps = [];
-     }
- }

+ stop() {
+     if (this.recorder && this.isRecording) {
+         this.recorder.stop();
+         this.isRecording = false;
+         // Do NOT clear chunks here — let _processQueue drain first
+         // Chunks are only pruned by _pruneBuffer() on a time basis
+         // After queue is done (or after a short grace period), clear them
+         setTimeout(() => {
+             this.chunks = [];
+             this.chunkTimestamps = [];
+         }, 15000); // 15s grace window for any pending uploads
+     }
+ }
```

#### [MODIFY] [FlagReview.jsx](file:///d:/Projects/PW/src/pages/FlagReview.jsx)

**Fix Bug 3:** Two occurrences of `details?.message` → change to `metadata?.message`.

```diff
- {f.details?.message || '—'}
+ {f.metadata?.message || '—'}

- {selectedFlag?.details?.message || '—'}
+ {selectedFlag?.metadata?.message || '—'}
```

Also fix the **dialog's Details field** label (line 326) to say "Message" instead of "Message" pointing at wrong field — both the label and value need to be corrected.

---

## Evidence of Each Bug in Code

| Bug | File | Line | Code Snippet |
|-----|------|------|-------------|
| 1 | [storage.sql](file:///d:/Projects/PW/supabase/storage.sql) | 22 | `-- Public: NO (toggle OFF)` |
| 1 | [evidenceCapture.js](file:///d:/Projects/PW/src/lib/evidenceCapture.js) | 136 | `getPublicUrl(item.fileName)` — returns unusable URL on private bucket |
| 2 | [ExamSession.jsx](file:///d:/Projects/PW/src/pages/ExamSession.jsx) | 86–97 | [stopAllProctoring()](file:///d:/Projects/PW/src/pages/ExamSession.jsx#104-119) called after [captureForFlag()](file:///d:/Projects/PW/src/lib/evidenceCapture.js#92-113) but before upload completes |
| 2 | [evidenceCapture.js](file:///d:/Projects/PW/src/lib/evidenceCapture.js) | 59–63 | [stop()](file:///d:/Projects/PW/src/lib/audioIntelligence.js#292-324) sets `this.chunks = []` immediately |
| 3 | [FlagReview.jsx](file:///d:/Projects/PW/src/pages/FlagReview.jsx) | 252 | `f.details?.message` — field doesn't exist |
| 3 | [FlagReview.jsx](file:///d:/Projects/PW/src/pages/FlagReview.jsx) | 326 | `selectedFlag?.details?.message` — field doesn't exist |
| 3 | [ExamSession.jsx](file:///d:/Projects/PW/src/pages/ExamSession.jsx) | 70 | `metadata: { message: flag.message }` — correct column is `metadata` |

---

## Verification Plan

1. Run a test exam session that triggers at least one ORANGE flag (e.g., look away from camera for 5+ seconds).
2. After the flag is raised, wait 15 seconds (for the background upload to complete).
3. Go to **Flag Review** as a teacher/admin.
4. Confirm:
   - The **Details** column now shows the flag message (not `—`).
   - The **Evidence** column shows the ▶ play button (not `—`).
   - Clicking ▶ opens the dialog and the video plays (no 403 error in browser console).
5. Trigger a RED flag (e.g., test impersonation detection).
   - Confirm the video clip is still uploaded to Storage even though the exam terminates.
   - Confirm `evidence_url` is populated in the flags row (check Supabase table directly).
