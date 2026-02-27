# ProctorWatch — Security Improvement Plan

**Date:** 2026-02-26  
**Scope:** Full codebase audit of the ProctorWatch Electron proctoring application  
**Modules Analysed:** EnforcementService, SystemMonitor, IdentityMonitor, NetworkMonitor, BehaviorMonitor, VisionBehaviorMonitor, ProctoringService, EvidenceCapture, AuthStore, FaceRegistration, AdminAuthDialog, main.cjs / preload.cjs

---

## Executive Summary

The analysis identified **15 security vulnerabilities and logic flaws** across the proctoring stack, spanning credential management, authentication, face-recognition integrity, enforcement gaps, and evidence handling. Issues are categorised by severity — **Critical**, **High**, **Medium**, and **Low** — with actionable remediation steps for each.

---

## 🔴 CRITICAL Issues

### 1. Hardcoded Supabase Credentials in Source Code
**File:** `electron/main.cjs` (lines 7–8)

```js
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://itdratwmxbugkmbhoiyw.supabase.co';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_C9Uehgg5m0fC5O1-RmrQoQ_pldk3tsU';
```

**Risk:** The Supabase project URL and anon key are committed to source code as plaintext fallbacks. Anyone with repository access (or who decompiles the packaged Electron binary with `asar extract`) can extract these credentials. Although the anon key is publicly safe in standard Supabase deployments, it still allows direct REST API access to all tables unless Row Level Security (RLS) is configured correctly.

**Remediation:**
- Remove hardcoded fallbacks entirely.
- At build time, inject credentials using a CI/CD secrets manager (e.g., GitHub Secrets, Doppler).
- Set strict RLS policies on **every** table so that even if the key leaks, access is row-scoped to the authenticated user.
- Use Supabase service-role key **only** in a secure server-side environment, never in the client or Electron main process.

---

### 2. Insecure Password Hashing (SHA-256, No Salt)
**File:** `src/store/authStore.js` (lines 5–11)

```js
async function hashPassword(password) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    ...
}
```

**Risk:** SHA-256 without a salt is vulnerable to:
- **Rainbow table attacks** — an attacker who dumps the `users` table can look up common passwords in pre-computed tables instantly.
- **Database breach impact** — all accounts are compromised simultaneously if the database is breached.
- SHA-256 is also extremely fast (billions of hashes/second), enabling brute-force at scale.

**Remediation:**
- Replace with a slow, salted hashing algorithm: **bcrypt** (cost factor ≥ 12) or **Argon2id**.
- Since hashing happens in the renderer (browser context), use a WASM port of bcrypt/Argon2 (e.g., `bcryptjs`) on the client, **or** move login to a Supabase Edge Function / serverless backend that handles hashing server-side.
- Implement a one-time migration: on next login with the old hash, re-hash the password with Argon2/bcrypt and update the stored value.

---

### 3. Session Token is Base64-Encoded JSON (Not Cryptographically Signed)
**File:** `src/store/authStore.js` (line 72)

```js
token: btoa(JSON.stringify({ id: user.id, role: user.role, ts: Date.now() }))
```

**Risk:** `btoa()` is base64 encoding, **not encryption or signing**. Any user can:
1. Decode the token from `localStorage` with `atob()`.
2. Modify the `role` field to `"admin"`.
3. Re-encode with `btoa()` and replace the stored session.

The `ProtectedRoute` route guard reads `user.role` directly from this session object — making **privilege escalation trivial**.

**Remediation:**
- Replace with **JWTs signed by a server-side secret** (HMAC-SHA256 or RS256). Supabase Auth provides this natively.
- Migrate to **Supabase Auth** (magic link / email-password) which handles sessions with signed JWTs automatically.
- If a custom auth system is retained, validate the session against the database on every sensitive operation — never trust the locally-stored `role`.

---

### 4. Face Embedding Stored in `localStorage` (Demo Mode Bypass)
**File:** `src/components/proctoring/IdentityMonitor.jsx` (lines 24–33)

```js
if (demoMode) {
    const stored = localStorage.getItem('pw_test_face_embedding');
    if (stored) {
        setRegisteredEmbedding(JSON.parse(stored));
    }
}
```

**Risk:** In demo mode, the reference face embedding is read from `localStorage`. Since `localStorage` is accessible to all JavaScript running on the same origin and is trivially editable via DevTools, a student could:
1. Open DevTools (F12 is explicitly **allowed** — see Issue 7).
2. Navigate to Application → Local Storage.
3. Replace `pw_test_face_embedding` with an embedding of a helper's face.
4. The helper then sits in front of the camera and passes identity verification.

**Remediation:**
- Remove the `localStorage` face embedding fallback entirely, even in demo/test mode.
- For testing, use a dedicated test account with a database-stored embedding.
- Encrypt the embedding before storing (if local storage is absolutely required), and bind the decryption key to the exam session ID server-side.

---

## 🟠 HIGH Issues

### 5. Ctrl+Alt+Delete Cannot Be Blocked at the Application Level
**File:** `electron/services/EnforcementService.cjs` (lines 468–472)

```js
if (vk === VK_DELETE && isCtrlPressed && isAltPressed) {
    shouldBlock = true;
    blockReason = 'Ctrl+Alt+Del';
}
```

**Risk:** Windows handles `Ctrl+Alt+Del` at the **kernel/Secure Attention Sequence (SAS) level**. A low-level keyboard hook (WH_KEYBOARD_LL) installed by user-mode code **cannot** intercept or block SAS. The code silently claims to block it but does not. A student pressing `Ctrl+Alt+Del` can access Task Manager, the lock screen, and the sign-out option.

**Remediation:**
- Remove the false claim and update the comment. Document that SAS cannot be blocked by user-mode hooks.
- For true Ctrl+Alt+Delete suppression, a **Windows Group Policy** or a **kernel-mode driver** is required — both beyond the scope of a user app.
- Instead: detect the window losing focus immediately after a Ctrl+Alt+Del press (the enforcement loop does this at 1-second intervals). Trigger a high-severity flag and optionally pause the exam session server-side.
- Communicate clearly in Admin documentation that this limitation exists.

---

### 6. F12 (DevTools) Intentionally Allowed During Exam
**File:** `electron/services/EnforcementService.cjs` (line 492)

```js
// 9. F12 — ALLOWED (no blocking)
```

**Risk:** DevTools access allows a student to:
- Inspect and modify the DOM, including answers and timer state.
- Modify `localStorage` (including the session role and face embedding).
- Execute arbitrary JavaScript in the renderer process.
- View network requests including Supabase auth tokens.

**Remediation:**
- Block F12 during exam sessions. Add it to the key-hook list.
- In `main.cjs`, call `mainWindow.webContents.on('devtools-opened', () => mainWindow.webContents.closeDevTools())` to forcibly close DevTools if opened via another mechanism.
- This is safe since the current hook is already in production-only mode (`NODE_ENV !== 'development'`).

---

### 7. Empty Blacklist Fallback When Supabase Is Unreachable
**File:** `electron/services/EnforcementService.cjs` (lines 87–93)

```js
} else {
    console.warn('[Enforcement] Supabase returned an empty blacklist. No apps will be blocked.');
}
// No fallback — blacklist stays as-is (empty on first load...)
```

**Risk:** If Supabase is unreachable at exam start (network issue, outage, DNS failure), `this.blacklist` stays empty. The enforcement service then runs with **zero blocked applications** — completely defeating the purpose of the pre-exam cleanup and continuous detection phases.

**Remediation:**
- Bundle a **hardcoded minimal fallback blacklist** (most critical apps: remote desktop, screen-sharing tools) to use when Supabase is unreachable.
- Log a high-severity error and notify the `mainWindow` renderer so the admin/proctor can be alerted.
- Consider blocking exam start entirely if the blacklist cannot be loaded (add a `dbLoaded` gate that the renderer checks before proceeding).

---

### 8. Partial String Matching in Blacklist Creates False Positives / Bypass Risk
**File:** `electron/services/EnforcementService.cjs` (lines 153–163)

```js
if (nameNoExt.includes(entryNoExt) || entryNoExt.includes(nameNoExt)) {
    return true;
}
```

**Risk:**
- **False positives:** A process named `notification.exe` would match a blacklist entry for `notion`. A process named `codehelper.exe` would match `code`. This could cause:
  - Spurious flags/kills against benign system processes.
  - Student complaints of unfair proctoring.
- **False negatives (bypasses):** A student could rename a blacklisted process (e.g., `discord.exe` → `disc.exe`). The substring match would then fail because `disc` does not `include` `discord`.

**Remediation:**
- Remove bidirectional substring matching. Use **exact match after .exe strip** as the primary rule.
- Allow optional **glob pattern support** (e.g., `*discord*`) configured explicitly per entry in the admin dashboard.
- Test the blacklist against a corpus of known system processes to catch false positives before deployment.

---

### 9. No Rate Limiting on Admin Credential Verification
**File:** `src/store/authStore.js` (lines 148–172) and `src/components/AdminAuthDialog.jsx`

**Risk:** The `verifyAdmin()` function issues Supabase queries on every attempt. There is no:
- Lockout after repeated failures.
- Delay between failed attempts.
- Logging of failed attempts.

An attacker (or student) can brute-force the admin password by rapidly submitting the `AdminAuthDialog` form.

**Remediation:**
- Implement **exponential backoff** by tracking attempt counts in a ref: lock the dialog for increasing durations after 3, 5, and 10 failures.
- Log failed admin verification attempts to `audit_logs` (username, timestamp, IP/hostname).
- Consider a CAPTCHA or require physical admin presence (PIN on a separate device) for the most sensitive overrides.

---

## 🟡 MEDIUM Issues

### 10. Screen Recording Is Disabled — Evidence Capture Lacks Screen Context
**File:** `src/lib/proctoringService.js` (lines 45–57)

```js
// 1. Get Screen Stream - DISABLED per user request (issues with NotSupportedError)
this.screenStream = null;
```

**Risk:** The `EvidenceCapture` module only captures the camera feed. Violation evidence (e.g., a student reading notes on a second monitor) cannot be proven without screen content. The evidence clips would only show the student's face, which may be insufficient for disciplinary action.

**Remediation:**
- Re-enable screen capture. The original commented-out Electron `desktopCapturer` logic should work in production. The `NotSupportedError` was likely a development/sandbox issue.
- If screen capture is intentionally disabled for privacy, clearly document this decision and adjust the evidence collection strategy.
- At minimum, capture a periodic screenshot (1 per 30s) alongside camera clips.

---

### 11. Face Identity Threshold Is Very Low (0.40 Similarity)
**File:** `src/components/proctoring/IdentityMonitor.jsx` (line 152)

```js
if (similarity < 0.4) {
    handleFlag('IMPERSONATION', ...);
}
```

**Risk:** A 40% similarity threshold means an impersonator with even vague facial resemblance could pass identity verification. Typical production face-recognition systems require >70–80% similarity for a positive match.

**Remediation:**
- Raise the similarity threshold to at least **0.65** and ideally make it **configurable per exam** from the admin dashboard.
- Collect the face score distribution during beta testing to tune the threshold empirically.
- Add a "liveness check" step (random blink/turn prompt at registration and during exam) to prevent photo spoofing.

---

### 12. `verifyAdmin` Does Not Return/Verify the Password Field on First Query
**File:** `src/store/authStore.js` (lines 158–169)

```js
if (users[0] && users.length > 0) {
    const { data: fullUser } = await supabase
        .from('users').select('password_hash').eq('id', users[0].id).limit(1);

    if (fullUser && fullUser[0].password_hash === passwordHash) {
        return users[0];
    }
}
return null;
```

**Risk:** The first query fetches the user's `id` and `role` WITHOUT verifying the password. If there is a Supabase RLS bug or misconfiguration allowing cross-user reads, `users[0]` could be a different user from the one the caller intended.

**Remediation:**
- Combine both queries: select `id, role, password_hash` in a single query, then compare the hash locally. Eliminate the two-query pattern entirely.

---

### 13. `ProtectedRoute` Checks `user.role` From Client-Side State Only
**File:** `src/components/ProtectedRoute.jsx`

**Risk:** The current route guard only checks whether a `user` object is present in Zustand state. Admin-specific routes (e.g., `/dashboard/admin`, flag review, user management) depend on `user.role` — which is read from the **unverified localStorage session** (see Issue 3). This means any user who edits their session token can access admin routes.

**Remediation:**
- Verify the user's role **server-side** via a short-lived Supabase session (not a home-rolled token).
- For critical admin actions, always perform a fresh `verifyAdmin()` check with the live database, not just a route guard.

---

### 14. Proctoring Violation Flags Are Generated Client-Side With No Server Validation
**File:** `src/pages/ExamSession.jsx` (general pattern), `src/lib/proctoringService.js`

**Risk:** All violation flags (face missing, blacklisted process, focus lost, etc.) are generated and initially stored only in the renderer process. There is no server-side cross-validation. A motivated student could:
- Use DevTools to intercept or modify IPC messages (see Issue 6).
- Patch the JavaScript to suppress `onFlag` calls.
- Tamper with the Supabase `flags` table using the anon key (if RLS is not correctly configured).

**Remediation:**
- Send a heartbeat to a Supabase Edge Function every 30 seconds during the exam, including monitoring health status. If heartbeats stop, flag the session.
- Validate evidence server-side: the edge function can cross-check that the number of flags stored is consistent with session telemetry.
- Implement strict RLS on the `flags` table: students can only `INSERT`, not `UPDATE` or `DELETE` their own flags.

---

### 15. Retry Loop in `EvidenceCapture._processQueue()` Has No Maximum Retry Limit
**File:** `src/lib/evidenceCapture.js` (lines 153–157)

```js
this.uploadQueue.push(this.uploadQueue.shift()); // Move to end for retry
await new Promise(r => setTimeout(r, 5000));
```

**Risk:** If Supabase Storage is persistently unavailable, the queue grows infinitely (each failed item is re-queued). Over a long exam, this would:
- Exhaust client memory.
- Keep the upload loop spinning forever, increasing CPU usage.
- Prevent `isUploading` from ever being set to `false`, stalling all future uploads.

**Remediation:**
- Track a `retryCount` per item. After **5 retries**, discard the item and log a critical error.
- Use exponential backoff (5s → 10s → 20s → ...) rather than a fixed 5-second delay.

---

## Summary Table

| # | Issue | Severity | Module |
|---|-------|----------|--------|
| 1 | Hardcoded Supabase credentials | 🔴 Critical | main.cjs |
| 2 | Plain SHA-256 password hashing (no salt) | 🔴 Critical | authStore.js |
| 3 | Base64 session token (not signed JWT) → privilege escalation | 🔴 Critical | authStore.js |
| 4 | Face embedding stored in localStorage (demo mode bypass) | 🔴 Critical | IdentityMonitor.jsx |
| 5 | Ctrl+Alt+Del cannot actually be blocked (SAS limitation undocumented) | 🟠 High | EnforcementService.cjs |
| 6 | F12 / DevTools intentionally allowed during exam | 🟠 High | EnforcementService.cjs |
| 7 | Empty blacklist when Supabase is unreachable = zero enforcement | 🟠 High | EnforcementService.cjs |
| 8 | Bidirectional substring blacklist matching → false positives & bypasses | 🟠 High | EnforcementService.cjs |
| 9 | No rate limiting on admin credential verification | 🟠 High | authStore.js / AdminAuthDialog.jsx |
| 10 | Screen recording disabled → incomplete evidence | 🟡 Medium | proctoringService.js |
| 11 | Face similarity threshold too low (0.40) | 🟡 Medium | IdentityMonitor.jsx |
| 12 | `verifyAdmin` uses a two-query pattern (TOCTOU-like) | 🟡 Medium | authStore.js |
| 13 | `ProtectedRoute` trusts client-side role from unverified token | 🟡 Medium | ProtectedRoute.jsx |
| 14 | Violation flags generated client-side with no server-side validation | 🟡 Medium | ExamSession.jsx / proctoringService.js |
| 15 | Infinite retry loop in EvidenceCapture (no max retries) | 🟡 Medium | evidenceCapture.js |

---

## Recommended Implementation Order

### Phase 1 — Immediate (before next exam)
1. **Issue 3:** Migrate to Supabase Auth (JWTs). This also fixes Issue 13.
2. **Issue 2:** Integrate `bcryptjs` for password hashing.
3. **Issue 1:** Remove hardcoded credential fallbacks from `main.cjs`.
4. **Issue 6:** Block F12 in the keyboard hook; add `devtools-opened` handler.
5. **Issue 7:** Add a hardcoded fallback blacklist for when Supabase is unreachable.

### Phase 2 — Short Term (within 1–2 sprints)
6. **Issue 4:** Remove localStorage face embedding path. Database-only embeddings.
7. **Issue 8:** Replace bidirectional substring matching with exact-match + explicit glob patterns.
8. **Issue 9:** Add brute-force protection (lockout + audit logging) to admin verification.
9. **Issue 11:** Raise face similarity threshold to 0.65–0.75, make it configurable.
10. **Issue 15:** Add max-retry count and exponential backoff to EvidenceCapture.

### Phase 3 — Medium Term
11. **Issue 14:** Add server-side heartbeat validation via Supabase Edge Functions.
12. **Issue 10:** Re-enable screen capture and capture periodic screenshots.
13. **Issue 5:** Document SAS limitation in admin guide; add compensating controls.
14. **Issue 12:** Combine the two-query `verifyAdmin` into a single query.
15. **Audit Supabase RLS** across all tables: `users`, `flags`, `face_registrations`, `audit_logs`.

---

*Plan prepared by: Antigravity (Codebase Security Audit)*
