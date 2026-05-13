# Participant Identity And User Analytics Notes

## Current Model

Participant rows are currently session-scoped. `session_participants` means
"this person joined this game", not "this is a global user".

The best available unique-user key is:

```text
identity_provider + identity_key
```

Today that resolves to:

```text
phone + normalized_phone
```

The legacy unique key `(session_id, phone)` and the newer
`(session_id, identity_provider, identity_key)` only prevent duplicate joins
inside one session. They do not create a global user record across sessions.

## Important Complexity

- Names are display data, not identity. Two people named `דני` can be different
  users, and one person can appear as `Nehorai Hadad` and `נהוראי חדד`.
- Without real authentication or OTP verification, a phone/email is still
  user-entered data. It is useful for analysis, but not a proof of identity.
- A future Google/Auth flow should use a stable provider key, such as Google
  `sub` or `auth.users.id`, instead of name or phone.
- Merging by name, unit, or team should never be automatic. Those fields are
  useful for search and suspicious-duplicate review only.
- If manual merge is added later, keep an audit trail and keep raw
  participation rows unchanged.

## Local Data Findings On 2026-05-13

After ignoring obvious local test/load rows, unique users by
`identity_provider + identity_key` looked like:

| Identity | Participations | Names Seen |
|---|---:|---|
| `phone:+972547401660` | 7 | `Nehorai Hadad`, `נהוראי חדד` |
| `phone:+972501111111` | 2 | `שחקן א` |
| `phone:+972549767505` | 1 | `נהוראי חדד` |
| `phone:+972509998888` | 1 | `טסט יוטיוב` |
| `phone:+972501111112` | 1 | `שחקן נ` |
| `phone:+972502222222` | 1 | `שחקן ב` |
| `phone:+972501234567` | 1 | `טסט משתמש` |

The same displayed name appearing under two phone numbers must be treated as
two distinct users unless an admin explicitly merges them later.

The local database also had rows where `participant_scores` exists without
matching `answers`. That is likely local/fixture residue, but reports should be
careful not to present score-derived metrics as answer-derived metrics when
answer rows are missing.

## Recommended Analytics Shape

For "user data", prefer a unique-user aggregate grouped by:

```text
identity_provider, identity_key
```

Each user aggregate should include:

- latest display name
- all names seen
- latest profile fields
- first seen and last seen timestamps
- participation count
- answer totals and score totals derived from participation rows

Keep a separate drill-down for participation history per game. This preserves
the session model while giving the admin a clear "people" view.

## Future Direction

The next clean step is to change `/api/admin/participants` from returning one
row per participation to returning one row per unique identity, with a nested or
separate participation list. No schema change is required for that first step.

If stronger identity is needed later, add an authentication preset:

- `phone` with OTP
- `email` with verification
- `google` with provider subject as `identity_key`

Those should all continue to write `identity_provider + identity_key`, so the
analytics layer does not need to know which login method was used.

## If Google/Auth Is Added Later

Google or full Supabase Auth should not be treated as a simple UI swap. It
changes the strength and source of identity.

Recommended shape:

```text
identity_provider = google
identity_key = auth.users.id
```

Using Supabase `auth.users.id` as the key keeps the analytics layer independent
from provider-specific token formats. Google `sub` can also work, but then the
app must decide how to handle provider changes or additional auth providers.

Known limits and decisions to handle before implementing:

- Existing phone-based users will not automatically merge with Google users.
  `phone:+972...` and `google:<auth-user-id>` are different identities unless
  an admin or a migration explicitly links them.
- Email/name from Google must not be used as the primary identity key. Email can
  change, and names are display data only.
- If historical continuity matters, add a merge/linking model before rollout.
  A minimal future model could be a global user table plus identity aliases:
  `phone`, `email`, `google`.
- Manual merge should keep raw participation rows intact and record an audit
  trail. Do not rewrite historical participation identity blindly.
- If both phone and Google are allowed, decide precedence for repeat joins:
  Google identity should win once authenticated, with phone stored as a profile
  field or linked alias.
- Admin analytics should continue grouping by the resolved stable identity, not
  by display name, email label, or latest profile value.

In short: Google/Auth makes future identity stronger, but the product still
needs an explicit answer for migration and merging of old phone-based history.
