# ADR-0010 — Storage Policy for Admin Uploads

**Status:** Accepted
**Date:** 2026-05-01
**Deciders:** Wave 3 Phase 2 upload pipeline agent

---

## Context

Wave 3 adds admin-managed file uploads for:

- Per-quiz custom logos shown on participant and host surfaces.
- Image-question assets shown as part of a question prompt.

Interactive map background uploads are intentionally excluded from this ADR and
from the Wave 3 Phase 2 upload subtask. Map authoring is handled by a parallel
subtask and will need either a follow-up ADR or an explicit extension to this
policy.

The platform already has a strict cache/privacy contract in
[ADR-0008](./ADR-0008-cache-privacy.md): admin routes are authenticated and
`private, no-store`, while participant-facing quiz payloads may contain public
brand and question image URLs. That means upload mutation responses must be
private, but the stored asset URLs can be public once deliberately attached to a
quiz or question.

## Decision

### 1. Bucket Layout

Create two Supabase Storage buckets:

| Bucket | Purpose | Public read | Upload route |
|---|---|---:|---|
| `brand-logos` | Per-quiz custom logo overrides | Yes | `POST /api/admin/uploads/logo` |
| `question-images` | Image-question prompt assets | Yes | `POST /api/admin/uploads/question-image` |

Both buckets are public-read and authenticated-write through admin-only server
routes. The app uses Supabase public URLs rather than signed URLs for v1.

### 2. Access Control and RLS

Storage rows are protected with bucket-scoped policies on `storage.objects`:

- Anonymous users may read objects in `brand-logos` and `question-images`.
- Only authenticated users whose JWT has `app_metadata.role = "admin"` may
  insert, update, or delete objects in those buckets.
- Server upload routes still call `requireRole("admin")` before touching
  storage. Storage RLS is defense in depth for any future direct client SDK
  usage, not a substitute for route-level authorization.

The upload routes return via `privateNoStoreJson`. This preserves ADR-0008:
the mutation response and storage path are admin-private, even though the final
asset URL is public.

### 3. File Naming

Upload routes never persist the user-supplied filename in the storage path.
They derive only a sanitized extension from the validated MIME type and store:

```text
<admin-user-id>/<random-uuid>.<extension>
```

Hebrew and other non-ASCII filenames are accepted by the UI and multipart
parser, but the original filename is discarded server-side. This avoids leaking
PII or event names through public object paths and makes URLs effectively
unguessable for v1.

### 4. Size and MIME Limits

Validation is enforced twice:

1. Client upload controls reject invalid files before sending.
2. Server upload routes validate `Content-Length`, multipart shape, MIME type,
   and the final byte length after reading the file.

Limits:

| Upload kind | Max size | MIME allowlist |
|---|---:|---|
| Logo | 512 KB | `image/png`, `image/jpeg`, `image/webp`, `image/svg+xml` |
| Question image | 2 MB | `image/png`, `image/jpeg`, `image/webp` |

The server chooses the extension from MIME type:

| MIME | Extension |
|---|---|
| `image/png` | `png` |
| `image/jpeg` | `jpg` |
| `image/webp` | `webp` |
| `image/svg+xml` | `svg` |

SVG is accepted for logos only. Question images reject SVG so participant-facing
question content does not introduce arbitrary SVG markup into the play flow.

### 5. Rate Limiting

Each upload route uses an in-memory token bucket keyed by admin user id and
upload kind. This is intentionally process-local for v1:

- It protects local/serverless instances from accidental rapid retries.
- It resets when the process restarts.
- It is not a distributed quota and does not replace future persistent limits.

### 6. Public URL Strategy

The route returns:

```json
{ "url": "https://.../storage/v1/object/public/...", "path": "..." }
```

The editor stores the returned `url` in the existing `customLogo` or `imageUrl`
field. It does not store `path` in the database in v1.

Accepted v1 risk: because the asset URL is public, deleting an object does not
revoke copies of a leaked URL from browser caches, logs, screenshots, or other
external storage. This is acceptable for non-secret brand and question imagery.
If uploaded assets become sensitive, the buckets must move to private-read with
signed URLs and explicit cache-control rules in a superseding ADR.

### 7. Cleanup and Quotas

Quotas, orphan detection, and cleanup are out of scope for v1. Replacing a logo
or question image leaves the old object in storage unless a later maintenance
job removes it.

ADR-0012 partially closes the path-derivation half of this open question by
introducing a `questions.image_path` column populated at upload time. A future
cleanup job can list `question-images` objects and delete those whose path is
not referenced by any `questions.image_path`. `brand-logos` still has no path
column and would require either a similar migration or a public-URL → path
mapper.

### 8. External URL Import

Admins paste image URLs frequently (Wikipedia Commons, government sites, photo
references). Storing those URLs verbatim in `questions.image_url` would make
quizzes brittle: third-party hosts disappear, hot-link, change content, or
serve different bytes than the admin saw at authoring time. To keep quizzes
self-contained without disabling the workflow, `POST /api/admin/uploads/import-url`
mirrors the URL into `question-images` and returns the same response shape as
the direct upload route. After import, the DB only holds our own public URL.

Validation is performed in two stages, in this order, before any network call:

1. **URL parsing.** `new URL(input)` must succeed. Scheme must be exactly
   `https:`. `URL.username` and `URL.password` must be empty (blocks
   `https://x@10.0.0.1/` userinfo bypass).
2. **Host allowlist (negative).** Hostname rejected if it equals `localhost` /
   `*.localhost`, matches the Supabase project hostname, or resolves textually
   as an IP literal in the private/loopback/link-local ranges:
   IPv4 `0/8`, `10/8`, `127/8`, `169.254/16`, `172.16/12`, `192.168/16`;
   IPv6 `::1`, `fe80::/10`, `fc00::/7`.

Network stage:

1. `HEAD` with `AbortSignal.timeout(5000)`. If `content-length` exceeds the
   2 MB cap (plus 64 KB overhead), reject `FILE_TOO_LARGE` before any GET.
2. `GET` is read as a stream; the running byte total is checked per chunk
   and the stream is aborted at the cap. The post-stream MIME check uses the
   same allowlist as direct uploads (`image/png`, `image/jpeg`, `image/webp`).
3. The downloaded bytes are uploaded to `question-images` under the same
   `<adminUserId>/<uuid>.<ext>` scheme. The extension is rederived from the
   validated MIME, never from the source URL path.

Accepted limitations (documented for honesty, not as missing requirements):

- DNS rebinding is not defended against — `fetch` resolves once per call but we
  do not pin the IP across redirects. Static private-range checks are the
  primary mitigation. Move to a side-car HTTP client with explicit IP
  binding only if SSRF severity escalates.
- HEAD's `content-type` is used only for the size early-bail. The GET body's
  MIME is the authoritative check, mirroring the in-house upload route's
  TOCTOU-resistant behaviour.

Operational:

- The route is admin-only (`requireRole("admin")`) and shares the in-memory
  token bucket with direct uploads (per-user, per-kind).
- The mutation response is `private, no-store` (ADR-0008). The resulting
  asset URL is public and may flow into participant payloads as before.

### 9. Free → Pro Migration Trigger

Sustainability checklist for the Supabase Free tier (1 GB storage, 5 GB
egress / month):

| Trigger | Action |
|---|---|
| Monthly egress > 4 GB sustained | Upgrade to Pro to gain Smart CDN. |
| Stored bytes > 800 MB | Upgrade to Pro (100 GB ceiling). |
| Image transformations needed beyond Vercel `next/image` | Upgrade to Pro for the Supabase image transformation API. |

Vercel's `next/image` is the primary delivery layer (ADR-0012). Supabase
remains the origin and is not optimisation-bound at our current scale.

## Consequences

- Public participant and host payloads may include uploaded image URLs without
  violating ADR-0008, because the URLs are intentionally public assets and do
  not contain forbidden fields.
- Admin upload responses remain private and no-store.
- Object paths are stable enough for public serving but do not expose original
  filenames.
- A future cleanup job cannot rely on database storage paths, because v1 stores
  only public URLs in quiz/question records. Cleanup will need to derive paths
  from public URLs or introduce explicit path columns in a later migration.
- SVG logos require normal image rendering only. Do not inline uploaded SVG
  contents into React or HTML.

## Open Questions

1. **Persistent quotas:** Should storage quotas be per admin, per quiz, or per
   workspace once production traffic starts?
2. **Orphan cleanup:** Should old objects be deleted immediately on replacement,
   or should a scheduled cleanup job remove objects no longer referenced by any
   quiz/question?
3. **Private buckets:** If customer-uploaded images become sensitive, should
   both buckets move to signed URLs, or only `question-images`?
4. **Map uploads:** Should map backgrounds reuse `question-images` with a
   separate route and limit, or get a dedicated bucket because map assets may be
   larger and have different lifecycle needs?
