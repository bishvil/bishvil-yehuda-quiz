-- Question image metadata: alt text, natural dimensions, storage path.
--
-- Context: ADR-0012 (image quality & delivery pipeline).
--   - image_alt: accessibility text, populated by admin in the editor.
--   - image_width / image_height: natural pixel dimensions captured at upload
--     time, so participant renderers (next/image) can reserve aspect ratio
--     without CLS.
--   - image_path: Supabase Storage object path "<admin-id>/<uuid>.<ext>".
--     Closes ADR-0010 §7's open question on cleanup -- a future maintenance
--     job can list orphan paths instead of deriving them from public URLs.
--     image_path is admin-private; it MUST NOT be exposed in any
--     participant or host-facing payload (see ADR-0008).
--
-- All columns are nullable. Existing rows tolerate nulls; admins fill values
-- in on next edit. No backfill is required.

alter table public.questions
  add column if not exists image_alt text,
  add column if not exists image_width integer,
  add column if not exists image_height integer,
  add column if not exists image_path text;

alter table public.questions
  add constraint questions_image_width_positive
    check (image_width is null or image_width > 0) not valid;
alter table public.questions
  validate constraint questions_image_width_positive;

alter table public.questions
  add constraint questions_image_height_positive
    check (image_height is null or image_height > 0) not valid;
alter table public.questions
  validate constraint questions_image_height_positive;
