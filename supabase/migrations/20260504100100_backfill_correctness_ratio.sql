-- Backfill answers.correctness_ratio for rows persisted before
-- 20260504100000_unify_correct_count_and_ratio.sql.
--
-- Binary types (single / truefalse / image) used to leave the column NULL.
-- The new contract is: every answer carries a numeric ratio (1.0 / 0.0 for
-- binary; 0..1 for partial-eligible types). UI consumers depend on this
-- being non-null after the unify migration ships.
--
-- Geo and multi rows are left untouched — they already populated the
-- column from inception (their migration 20260503202808 ran before any
-- production data existed for those types). The COALESCE-style update is
-- intentionally conservative: only NULL rows are touched.

update public.answers
set correctness_ratio = case when is_correct then 1 else 0 end
where correctness_ratio is null;
