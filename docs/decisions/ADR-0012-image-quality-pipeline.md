# ADR-0012 — Image Quality & Delivery Pipeline

**Status:** Accepted
**Date:** 2026-05-04
**Deciders:** Wave 4 image-pipeline agent
**Related:** ADR-0008 (cache & privacy), ADR-0010 (storage policy)

---

## Context

Quiz questions in this product are mostly **place / flower / sign identification
puzzles**. Source photos arrive from a 4–8 MB phone camera (admin's own field
work, museum visits, hike documentation). Image quality matters — downscaling
too aggressively erases the answer ("what's written on this sign?", "which
flower?") — but 4K is unnecessary at the participant's typical viewport
(mostly mobile portrait, occasionally tablet).

Volume is modest (~20 quizzes / month, ~210 images / month). Production
deploy target is Vercel; the Supabase project is on the Free tier (1 GB
storage, 5 GB egress / month). Source-of-truth image storage policy is
ADR-0010; this ADR layers quality and delivery decisions on top of it.

Three pre-existing rough edges that this ADR resolves:

1. Admins had to manually compress phone photos before upload because the
   server cap is 2 MB.
2. The participant renderer used a raw `<img>` of the original 2 MB asset —
   no responsive sizing, no format negotiation, no CLS protection.
3. The "external URL" field accepted any string verbatim, leaving quizzes
   vulnerable to link rot. (Resolved by ADR-0010 §8.)

## Decision

### 1. Storage stays on Supabase Storage

The `question-images` bucket from ADR-0010 §1 is unchanged. Vercel Blob is
not adopted: it would split assets across two providers, cost from day one,
and bring no participant-side benefit at our scale. The Free → Pro
trigger is documented in ADR-0010 §9.

### 2. Delivery: Next.js Image Optimization on Vercel

Question images are rendered through `next/image`, with Supabase Storage as
the origin. Vercel performs the resize/format/cache work for free at our tier.

`next.config.ts` whitelists the Supabase host via `images.remotePatterns`
restricted to `/storage/v1/object/public/**`. Wildcard hosts and the
deprecated `images.domains` shape are not used.

Renderer rules:

- Wrappers with a fixed aspect ratio use `<Image fill sizes="...">`.
- Wrappers without a fixed ratio pass explicit `width` and `height` from
  the question payload so layout is reserved (no CLS).
- `sizes` is tuned per surface — participants get a ~mobile-first hint;
  the host dashboard hint covers desktop bars and side panels.
- `alt` defaults to `imageAlt ?? ""`. An empty alt marks the image as
  decorative; we never default it to the question prompt (would leak
  the answer to screen readers).

Surface split (participant/host vs admin tooling):

- Participant and host surfaces — `QuestionCard`, `HostQuestionCard`,
  `BrandBlock` — use **optimized** `<Image>`. These are the bandwidth-
  bound surfaces and the only ones whose origins flow through
  `images.remotePatterns`.
- Admin tooling — the editor preview thumbnail in `UploadControl` —
  uses `<Image unoptimized />`. Per the official Next.js docs
  ([`next/image` API reference][nextimg]), `unoptimized` is the
  recommended prop for: small images that don't benefit from
  optimization, vector images (SVG, used by `brand-logos`), and
  sources that can't go through `remotePatterns` such as `blob:` URLs
  produced by `URL.createObjectURL` during a file drop. Using
  `<Image unoptimized />` keeps one component model across the
  codebase, removes the previous `eslint-disable
  @next/next/no-img-element` exception, and avoids whitelisting
  third-party hosts in `remotePatterns` just to render a 112×80
  authoring preview an admin sees once.

[nextimg]: https://nextjs.org/docs/app/api-reference/components/image#unoptimized

### 3. Authoring: smart client-side compression

The admin upload control runs a client-side optimizer **only when the source
file is over budget**:

- Fast path (default): if `file.size <= 2 MB` AND `max(naturalWidth,
  naturalHeight) <= 2400 px`, the original bytes are uploaded as-is. This
  preserves crispness for text-on-sign puzzles where any re-encode hurts.
- Slow path: scale to longest-side 2400 px on a `<canvas>` and re-encode
  as `image/webp` quality 0.85. This handles oversized phone JPEGs
  transparently. Re-encoding strips EXIF as a side effect (privacy
  + size).

EXIF orientation is honoured via `createImageBitmap(file, { imageOrientation:
"from-image" })`. The optimizer can be bypassed per upload with the
"שמור איכות מלאה" ("keep original quality") checkbox; the existing 2 MB
server cap then applies.

Implementation lives in `src/components/admin/upload/client-image-optimizer.ts`
and is consumed by `upload-control.tsx`. The route handler accepts
optional `width` and `height` multipart fields and echoes them in its
success body.

### 4. Schema: image metadata columns

Migration `20260504131355_question_image_metadata.sql` adds four nullable
columns to `questions`:

| Column | Purpose | Surfaced to participant payload? |
|---|---|---|
| `image_alt` | Admin-supplied accessibility text | Yes |
| `image_width` | Natural width (post any resize) | Yes |
| `image_height` | Natural height (post any resize) | Yes |
| `image_path` | Supabase Storage object path | **No — admin-only** (ADR-0008) |

`image_alt` is nullable in the schema but required in the editor when
`image_url` is set (UI gate). Existing rows are tolerated as null without
backfill; admins fill values on next edit.

`image_path` enables ADR-0010 §7's deferred cleanup job — listing
orphaned objects in the bucket against `image_path` references. It is
admin-private and never appears in participant or host payloads.

### 5. Why not Vercel Blob

Decided against on three grounds:

- Splits assets across two providers (Supabase already holds quiz/brand
  rows + auth).
- Costs from the first byte; Supabase Free covers ~14 months of authoring
  at our trajectory.
- Adds no participant-side benefit because Vercel image optimization is
  origin-agnostic.

Reassess if storage exceeds 800 MB or the platform changes (e.g.
multi-tenant authoring requiring per-tenant quotas — see ADR-0010
Open Question #1).

## Consequences

- Admins can drop a 6 MB phone photo and have it succeed transparently.
- Participants on slow networks get viewport-sized AVIF/WEBP from Vercel's
  edge cache, not 2 MB originals.
- The participant payload now carries `imageAlt`, `imageWidth`, and
  `imageHeight`. ADR-0008's forbidden-field list is unchanged — these are
  not answer-bearing. `imagePath` is explicitly admin-private.
- A future cleanup job has a stable handle (`image_path`) to identify
  orphaned objects in `question-images`.
- The participant `<img>` → `<Image>` migration removes the previous
  `eslint-disable @next/next/no-img-element` exception.
- Re-encoded uploads no longer carry EXIF GPS coordinates, removing one
  inadvertent location-leak vector for puzzles photographed near
  sensitive sites.

## Open Questions

1. **Right-to-use & moderation for imported URLs.** ADR-0010 §8 mirrors
   third-party URLs into our bucket on import. We do not record license
   metadata or perform any content moderation. If quizzes start sourcing
   from sites with strict reuse terms, add an attribution column and a
   light moderation step (e.g. perceptual-hash blocklist).
2. **Image transformation API.** Currently we run resize at the *client*
   (admin) and rely on `next/image` for delivery. If we move to Supabase
   Pro for other reasons, evaluate whether the Supabase image
   transformation endpoint (`?width=&quality=&format=`) replaces
   `next/image` for any surface — likely not, because Vercel's edge cache
   is faster than re-fetching transforms from Supabase.
3. **Question-image alt enforcement.** Today the editor requires alt only
   in the UI; the server schema accepts a null `imageAlt` even when
   `imageUrl` is set. Move to a server-side conditional check if
   accessibility audits fail.
4. **Brand logos.** ADR-0010 §1 includes `brand-logos`. This ADR does not
   change logo handling (logos may be SVG; canvas re-encoding doesn't
   apply). Logos remain on the existing simple upload path.
