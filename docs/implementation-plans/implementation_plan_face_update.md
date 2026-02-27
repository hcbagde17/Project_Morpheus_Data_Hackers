# Face ID Update - Implementation Plan

## Goal
Allow students (via Admin intervention) to update their Face ID directly from the Dashboard. This is useful if the initial registration was poor or the student's appearance has changed significantly.

## User Review Required
> [!IMPORTANT]
> This action requires Admin Authentication to prevent students from bypassing identity checks by registering someone else's face.

## Proposed Changes

### 1. `src/components/AdminAuthDialog.jsx` [NEW]
Create a reusable Admin Authentication dialog.
- Inputs: Admin Password (or full login if needed, but password check against a configured secret or admin user table is simpler for quick overrides).
- For now, we will verify against the `users` table via Supabase RPC or a client-side check if the user has `role: admin`.
- **Better approach**: Since the current user is a *Student*, we need a way for an *Admin* to authorize this.
- **Solution**: A simple "Admin Password" prompt. We can store a hashed admin password in the `settings` table or use a hardcoded fallback for this MVP version, or check if the credentials generic to an admin account are entered.
- **Refined Solution**: Use a specific `verify_admin_password` RPC function or just check against a known admin account credentials entered into the dialog.
- Let's implementing a `checkAdminCredentials(email, password)` helper.

### 2. `src/pages/dashboards/StudentDashboard.jsx` [MODIFY]
- Locate the "Face ID Active" chip/badge.
- Add `onClick` handler to open `AdminAuthDialog`.
- On success:
  - Call `deleteFaceRegistration(userId)`.
  - Redirect to `/face-registration` or open the registration modal.

### 3. `src/lib/faceProcessing.js` or `src/lib/supabase.js`
- Ensure `deleteFaceRegistration` exists.

## Verification Plan
### Manual Verification
1. Log in as Student.
2. Click "Face ID Active".
3. Verify Admin Dialog appears.
4. Enter wrong credentials -> Error.
5. Enter correct Admin credentials -> Success.
6. Verify redirection to Face Registration.
7. Complete registration and verify return to Dashboard with "Face ID Active".
