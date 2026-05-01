-- Tighten the per-question CHECK constraints introduced in
-- 20260501035700_backend_check_constraints.sql so the database matches
-- ADR-0004 §M4 and the admin Zod schema (`adminQuestionCreateSchema`):
--
--   * Points must be strictly positive (> 0). The earlier `points >= 0`
--     constraint allowed zero-point questions, which the admin schema and
--     ADR-0004/M4 reject.
--   * Map-question tolerance must fall within the persisted coordinate
--     scale (0 < tolerance <= 100). The earlier "type <> 'map' or
--     tolerance > 0" constraint had no upper bound, so raw writes could
--     persist nonsensically large tolerances.
--
-- Pattern matches the prior migration: drop the loose constraint, add the
-- tighter one with NOT VALID, then explicitly VALIDATE so future writes
-- and the existing rows are both checked. Greenfield-safe — current seed
-- data and test fixtures comply (seed.sql inserts no questions; unit
-- fixtures use points=1500/1000 and have no map-type questions).

alter table public.questions
  drop constraint if exists questions_points_nonnegative_check;

alter table public.questions
  add constraint questions_points_positive_check
  check (points > 0)
  not valid;

alter table public.questions
  drop constraint if exists questions_map_tolerance_positive_check;

alter table public.questions
  add constraint questions_map_tolerance_range_check
  check (type <> 'map' or (tolerance > 0 and tolerance <= 100))
  not valid;

alter table public.questions validate constraint questions_points_positive_check;
alter table public.questions validate constraint questions_map_tolerance_range_check;
