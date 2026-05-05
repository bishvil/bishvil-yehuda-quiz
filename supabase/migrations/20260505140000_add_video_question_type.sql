-- Add 'video' to the question_type enum (ADR-0013).
--
-- Pivot from the original "video as orthogonal media attachment" design to
-- "video as a first-class question type, mirroring image". A video question
-- has options + correct_ids like image, but its visual prompt is a clip
-- (self-hosted MP4/WebM via video_url, or YouTube/Vimeo via
-- video_embed_url). The columns added in 20260505120000 stay nullable;
-- they're only populated for type='video' rows.
--
-- ALTER TYPE ADD VALUE is permitted inside a transaction since Postgres 12;
-- Supabase ships >=15. Run idempotently so a re-applied migration doesn't
-- fail.

alter type public.question_type add value if not exists 'video';
