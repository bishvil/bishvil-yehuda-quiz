-- ADR-0011 §6.3 / §11 — additive geographic pin storage on `answers`.
--
-- The interactive map question stores a participant's pin as a geographic
-- (lat, lng) pair instead of the legacy (x, y) percent-of-image pair.
-- This migration adds two nullable columns alongside the existing
-- `pin_x` / `pin_y` columns and enforces:
--
--   1. Each new column lies in the standard WGS-84 range
--      (lat ∈ [-90, 90], lng ∈ [-180, 180]).
--   2. The legacy pair and the geo pair are mutually exclusive on a
--      single row — exactly one pair is populated per answer.
--
-- A follow-up migration is shipped in the same Wave-3 commit to extend
-- the `submit_answer` RPC to consume `p_pin_lat` and `p_pin_lng` and
-- branch on the question's `map.geo` block.
--
-- Rollback strategy: dropping the columns is safe in dev (no production
-- data writes them today). The pair-exclusivity CHECK is `not valid`
-- before being explicitly validated so writes during migration are not
-- blocked unexpectedly.

alter table public.answers
  add column if not exists pin_lat numeric(8, 5),
  add column if not exists pin_lng numeric(9, 5);

alter table public.answers
  drop constraint if exists answers_pin_geo_range_check;

alter table public.answers
  add constraint answers_pin_geo_range_check
  check (
    (pin_lat is null or (pin_lat >= -90 and pin_lat <= 90))
    and (pin_lng is null or (pin_lng >= -180 and pin_lng <= 180))
  )
  not valid;

alter table public.answers
  drop constraint if exists answers_pin_pair_exclusive_check;

alter table public.answers
  add constraint answers_pin_pair_exclusive_check
  check (
    not (
      (pin_x is not null or pin_y is not null)
      and (pin_lat is not null or pin_lng is not null)
    )
  )
  not valid;

alter table public.answers validate constraint answers_pin_geo_range_check;
alter table public.answers validate constraint answers_pin_pair_exclusive_check;

-- The map JSON gets an optional `geo` block; nothing to do at the column
-- level (the column is `jsonb`). Stored content is validated server-side
-- by `validateStoredQuestionContent` and by `adminQuestionCreateSchema`.
-- A defensive CHECK that disallows writes where neither legacy nor geo
-- block is set on a `type = 'map'` question:

alter table public.questions
  drop constraint if exists questions_map_payload_present_check;

alter table public.questions
  add constraint questions_map_payload_present_check
  check (
    type <> 'map'
    or (map ? 'image_url' and map ? 'target')
    or (map ? 'geo' and (map -> 'geo') ? 'target' and (map -> 'geo') ? 'toleranceKm')
  )
  not valid;

alter table public.questions validate constraint questions_map_payload_present_check;
