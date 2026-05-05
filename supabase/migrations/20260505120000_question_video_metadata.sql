-- Question video media: self-hosted clip OR external embed (YouTube/Vimeo).
--
-- Context: ADR-0013 (question video media). Mirrors ADR-0012's image columns
-- so a question can carry an optional video prompt alongside (or instead of)
-- an image. Spotlight gating is applied client-side; the server contribution
-- is `media_lead_seconds`, which the question-start handlers add to
-- `deadline_at` so the answer timer doesn't tick while the video plays
-- (see ADR-0005 for the deadline arithmetic).
--
--   - video_url: public URL of a self-hosted MP4/WebM in `question-videos`.
--   - video_path: Supabase Storage object path "<admin-id>/<uuid>.<ext>".
--     Admin-private — MUST NOT appear in any participant or host payload
--     (ADR-0008). Used only by future cleanup jobs (mirrors image_path).
--   - video_embed_url: normalized YouTube/Vimeo embed URL. Mutually
--     exclusive with video_url.
--   - video_provider: 'self' | 'youtube' | 'vimeo'.
--   - video_mime_type / video_duration_seconds / video_width /
--     video_height: captured at upload time for self-hosted clips, manually
--     entered for embeds (admins type the duration).
--   - video_poster_url: optional poster image. Reuses the question-images
--     bucket (no separate posters bucket).
--   - media_lead_seconds: integer offset added to `deadline_at` at
--     question-start. Default 0 keeps existing rows behaving as before.
--
-- All columns are nullable except `media_lead_seconds`. Existing rows
-- tolerate nulls; no backfill required.

-- 1. Bucket for self-hosted videos.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'question-videos',
  'question-videos',
  true,
  26214400, -- 25 MB
  array['video/mp4', 'video/webm']
)
on conflict (id) do nothing;

-- 2. RLS policies for the new bucket. Kept separate from the existing
-- `('brand-logos','question-images')` policies so each bucket's auth surface
-- stays auditable on its own.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'public reads question-videos bucket'
  ) then
    create policy "public reads question-videos bucket"
      on storage.objects
      for select
      using (bucket_id = 'question-videos');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'admins insert question-videos objects'
  ) then
    create policy "admins insert question-videos objects"
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'question-videos'
        and auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'admins update question-videos objects'
  ) then
    create policy "admins update question-videos objects"
      on storage.objects
      for update
      to authenticated
      using (
        bucket_id = 'question-videos'
        and auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
      )
      with check (
        bucket_id = 'question-videos'
        and auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'admins delete question-videos objects'
  ) then
    create policy "admins delete question-videos objects"
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id = 'question-videos'
        and auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
      );
  end if;
end $$;

-- 3. Question columns.
alter table public.questions
  add column if not exists video_url text,
  add column if not exists video_path text,
  add column if not exists video_embed_url text,
  add column if not exists video_provider text,
  add column if not exists video_mime_type text,
  add column if not exists video_duration_seconds integer,
  add column if not exists video_poster_url text,
  add column if not exists video_width integer,
  add column if not exists video_height integer,
  add column if not exists media_lead_seconds integer not null default 0;

-- 4. Constraints (created NOT VALID then validated, mirroring the image
-- migration so the alter table holds a weaker lock briefly).
alter table public.questions
  add constraint questions_video_duration_positive
    check (video_duration_seconds is null or video_duration_seconds > 0) not valid;
alter table public.questions
  validate constraint questions_video_duration_positive;

alter table public.questions
  add constraint questions_video_width_positive
    check (video_width is null or video_width > 0) not valid;
alter table public.questions
  validate constraint questions_video_width_positive;

alter table public.questions
  add constraint questions_video_height_positive
    check (video_height is null or video_height > 0) not valid;
alter table public.questions
  validate constraint questions_video_height_positive;

alter table public.questions
  add constraint questions_media_lead_seconds_range
    check (media_lead_seconds >= 0 and media_lead_seconds <= 600) not valid;
alter table public.questions
  validate constraint questions_media_lead_seconds_range;

alter table public.questions
  add constraint questions_video_provider_allowed
    check (video_provider is null or video_provider in ('self', 'youtube', 'vimeo')) not valid;
alter table public.questions
  validate constraint questions_video_provider_allowed;

-- A question may have either a self-hosted clip (video_url) or an external
-- embed (video_embed_url), but not both. Either column may also be null.
alter table public.questions
  add constraint questions_video_source_exclusive
    check (video_url is null or video_embed_url is null) not valid;
alter table public.questions
  validate constraint questions_video_source_exclusive;

alter table public.questions
  add constraint questions_video_url_length
    check (video_url is null or length(video_url) <= 2048) not valid;
alter table public.questions
  validate constraint questions_video_url_length;

alter table public.questions
  add constraint questions_video_embed_url_length
    check (video_embed_url is null or length(video_embed_url) <= 2048) not valid;
alter table public.questions
  validate constraint questions_video_embed_url_length;

alter table public.questions
  add constraint questions_video_poster_url_length
    check (video_poster_url is null or length(video_poster_url) <= 2048) not valid;
alter table public.questions
  validate constraint questions_video_poster_url_length;
