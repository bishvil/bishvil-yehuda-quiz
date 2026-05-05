-- Defense-in-depth: enforce per-file size limits at the storage layer.
--
-- The application's signed-upload-URL flow validates `size` server-side
-- before signing, but the client could in theory request a sign for one
-- size and PUT a larger blob. Setting `file_size_limit` on the bucket
-- means Supabase Storage rejects oversized PUTs with HTTP 413 regardless
-- of what the client claimed.
--
-- These match the limits in app/api/admin/uploads/_shared.ts:
--   - brand-logos:     512 KB
--   - question-images: 2 MB
--   - question-videos: 25 MB

update storage.buckets
   set file_size_limit = 524288
 where id = 'brand-logos';

update storage.buckets
   set file_size_limit = 2097152
 where id = 'question-images';

update storage.buckets
   set file_size_limit = 26214400
 where id = 'question-videos';
