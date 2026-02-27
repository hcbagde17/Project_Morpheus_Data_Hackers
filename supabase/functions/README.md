# Supabase Edge Functions - Deployment Guide

## Prerequisites
1. Install Supabase CLI:
   ```bash
   npm install -g supabase
   ```

2. Login to Supabase:
   ```bash
   supabase login
   ```

3. Link to your project:
   ```bash
   supabase link --project-ref <your-project-ref>
   ```

## Deploying Functions

### 1. Grade Exam (Auto-grading)
```bash
supabase functions deploy grade-exam
```
**Usage:**
```javascript
const { data } = await supabase.functions.invoke('grade-exam', {
  body: { sessionId: 'uuid-here' }
});
```

### 2. Send Notification
```bash
supabase functions deploy send-notification
```
**Usage:**
```javascript
const { data } = await supabase.functions.invoke('send-notification', {
  body: {
    userId: 'uuid',
    type: 'exam_reminder',
    message: 'Your exam starts in 10 minutes',
    metadata: { testId: 'uuid' }
  }
});
```

### 3. Test Statistics
```bash
supabase functions deploy test-statistics
```
**Usage:**
```javascript
const { data } = await supabase.functions.invoke('test-statistics', {
  body: { testId: 'uuid-here' }
});
```

## Environment Variables

Set these in your Supabase project dashboard:
- `SUPABASE_URL`: Your Supabase project URL (auto-set)
- `SUPABASE_SERVICE_ROLE_KEY`: Your service role key (auto-set)
- Add custom env vars if needed for email services, etc.

## Testing Locally

```bash
supabase functions serve
```

Test with curl:
```bash
curl -i --location --request POST 'http://localhost:54321/functions/v1/grade-exam' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{"sessionId":"uuid-here"}'
```

## Notes
- All functions use CORS headers for browser requests
- Functions require authenticated requests (via Authorization header)
- Service role key is used for admin operations
- In production, integrate email service for notifications
