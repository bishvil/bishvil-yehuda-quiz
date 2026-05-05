# Team route listUsers — local Supabase Auth failure — 2026-05-05

Status: **fixed locally**. No app code change needed; data fix only.

## Symptom
- `GET /api/admin/team` (powers `/admin/settings/team`) returned 500
  `READ_FAILED`. Server log: `listUsers failed in team route`
  (`app/api/admin/team/route.ts:127-141`).
- Origin: `supabase.auth.admin.listUsers()` (line 120) was hitting
  GoTrue's `/auth/v1/admin/users` and getting a 500 from the local
  Auth container.

## Root cause (two stacked issues in local DB only)
GoTrue's User struct uses non-nullable Go strings / typed JSONMap; if
local data drifted from those expectations, the entire list query
fails on Scan.

1. **NULL token columns.** Several rows in `auth.users` had NULLs in
   columns Go expects to be non-null strings, e.g.
   `confirmation_token`, `email_change*`, `phone_change*`,
   `recovery_token`, `reauthentication_token`. Auth log:
   `Scan error on column index 3, name "confirmation_token":
   converting NULL to string is unsupported`.
2. **Double-encoded `raw_app_meta_data`.** 6 anonymous participant
   rows had `raw_app_meta_data` stored as a JSON *string* (e.g.
   `"{\"role\":\"participant\",...}"`) instead of a JSON object.
   Auth log: `cannot unmarshal string into Go value of type
   models.JSONMap`. These rows predate current code; current writers
   (`app/api/session/[pin]/join/route.ts:171`,
   `app/api/admin/team/route.ts:197/253`,
   `app/api/admin/team/invite/route.ts:65`,
   `app/api/admin/settings/brand/route.ts:79`) all pass plain objects.

## Why prod isn't affected
Prod Supabase (`dcinzawjietdpbmvksqx`) doesn't have these corrupted
rows. The local DB accumulated them across older code paths / manual
debugging on a 4-day-old container; the current code does not produce
them.

## Fix applied (local DB only)
```sql
-- 1) Coalesce NULL token columns
UPDATE auth.users SET
  confirmation_token = COALESCE(confirmation_token, ''),
  email_change = COALESCE(email_change, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  phone_change = COALESCE(phone_change, ''),
  phone_change_token = COALESCE(phone_change_token, ''),
  reauthentication_token = COALESCE(reauthentication_token, ''),
  recovery_token = COALESCE(recovery_token, '');

-- 2) Unwrap double-encoded JSON strings
UPDATE auth.users
SET raw_app_meta_data = (raw_app_meta_data #>> '{}')::jsonb
WHERE jsonb_typeof(raw_app_meta_data) = 'string';
```

Verified: `curl /auth/v1/admin/users` now returns 200 and
`/admin/settings/team` should load.

## Follow-ups (optional)
- Upgrade the Supabase CLI dev dep: `pnpm add -D supabase@latest`
  (2.96.0 → 2.98.1) — newer GoTrue images are more tolerant of these
  data shapes, though the data fix is what actually unblocks us.
- If similar drift recurs, `pnpm db:reset:local` rebuilds from
  migrations cleanly.
- No application code change needed — current writers all pass plain
  objects for `app_metadata`.
