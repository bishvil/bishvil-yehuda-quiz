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
