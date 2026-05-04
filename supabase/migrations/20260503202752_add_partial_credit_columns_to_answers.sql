-- ADR-0006 Open Q2 + Q3 RESOLVED — partial-credit scoring for geo map
-- and multi-select questions.
--
-- Adds two nullable columns to `answers`:
--   distance_km      numeric(10,3)  — haversine km for geo map answers.
--   correctness_ratio numeric(4,3)  — 0..1 ratio for geo map + multi-select.
--
-- For single / truefalse / image / legacy raster map these stay NULL and
-- downstream code treats them as `is_correct ? 1.0 : 0.0`.
--
-- CHECK constraints are added NOT VALID first, then validated after the
-- column is fully populated (zero-downtime pattern; safe on an empty column).

alter table public.answers
  add column distance_km numeric(10,3),
  add column correctness_ratio numeric(4,3);

alter table public.answers
  add constraint answers_distance_km_nonneg
  check (distance_km is null or distance_km >= 0) not valid;

alter table public.answers
  add constraint answers_correctness_ratio_range
  check (correctness_ratio is null or (correctness_ratio >= 0 and correctness_ratio <= 1)) not valid;

alter table public.answers validate constraint answers_distance_km_nonneg;
alter table public.answers validate constraint answers_correctness_ratio_range;
