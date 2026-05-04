-- Admin recompute path for ADR-0006 — score recovery after a quiz edit.
--
-- When an admin changes `questions.points`, `questions.time_seconds`,
-- `questions.correct_ids`, or `questions.map` after answers exist, the
-- stored `answers.score` and `participant_scores.total_score` go stale
-- silently. `rescore_session` reapplies the same scoring branches as
-- `submit_answer` against the **current** question rows, using each
-- answer's existing `submitted_at`, `selected_ids`, `pin_lat`, `pin_lng`
-- as input. `participant_scores` and `session_participants.streak` are
-- rebuilt from scratch from the recomputed `answers` rows.
--
-- The function locks the session row FOR UPDATE so concurrent
-- submissions cannot interleave with the recompute. Granted to
-- service_role only — invoked from `POST /api/admin/sessions/[id]/rescore`.
--
-- Returns one row summarising the operation:
--   answers_rescored   — number of answers updated
--   total_score_delta  — sum of (new_score - old_score) across all answers
--   participants_touched — number of participants whose score row changed
--
-- See docs/decisions/ADR-0006-answer-policy.md "Update 2026-05-04" §
-- Recompute path.

create or replace function public.rescore_session(
  p_session_id uuid
)
returns table (
  answers_rescored integer,
  total_score_delta integer,
  participants_touched integer
)
language plpgsql
as $$
#variable_conflict use_column
declare
  v_session public.sessions%rowtype;
  v_row record;
  v_is_correct boolean;
  v_correctness_ratio numeric;
  v_distance_km numeric;
  v_base integer;
  v_time_max integer;
  v_remaining_seconds numeric;
  v_time_bonus integer;
  v_score integer;
  v_count integer := 0;
  v_delta integer := 0;
begin
  select *
  into v_session
  from public.sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  -- Single JOIN'd cursor — pulls the answer, its question, and the
  -- timing row (sync OR async) in one streaming query. Avoids the N+1
  -- pattern of looking up `questions` and the timing table per answer.
  -- A LEFT JOIN on questions tolerates a deleted question row (skipped
  -- inside the loop).
  for v_row in
    select
      a.id              as answer_id,
      a.participant_id  as participant_id,
      a.submitted_at    as submitted_at,
      a.pin_lat         as pin_lat,
      a.pin_lng         as pin_lng,
      a.selected_ids    as selected_ids,
      coalesce(a.score, 0) as old_score,
      q                 as question,
      case when v_session.game_mode = 'sync' then qss.started_at else pqp.started_at end
                        as started_at,
      case when v_session.game_mode = 'sync' then qss.deadline_at else pqp.deadline_at end
                        as deadline_at
    from public.answers a
    left join public.questions q on q.id = a.question_id
    left join public.question_session_state qss
      on v_session.game_mode = 'sync'
      and qss.session_id = a.session_id
      and qss.question_id = a.question_id
    left join public.participant_question_progress pqp
      on v_session.game_mode = 'async'
      and pqp.session_id = a.session_id
      and pqp.participant_id = a.participant_id
      and pqp.question_id = a.question_id
    where a.session_id = p_session_id
    order by a.submitted_at
  loop
    if (v_row.question).id is null then
      continue;
    end if;

    select c.is_correct, c.correctness_ratio, c.distance_km
    into v_is_correct, v_correctness_ratio, v_distance_km
    from public._score_correctness(
      v_row.question, v_row.selected_ids, v_row.pin_lat, v_row.pin_lng
    ) c;

    v_base     := floor((v_row.question).points * 2 / 3.0);
    v_time_max := (v_row.question).points - v_base;

    v_time_bonus := 0;
    if v_is_correct and v_row.started_at is not null and v_row.deadline_at is not null then
      v_remaining_seconds := greatest(0, extract(epoch from (v_row.deadline_at - v_row.submitted_at)));
      v_time_bonus := floor(v_time_max * v_remaining_seconds / greatest(1, (v_row.question).time_seconds));
    end if;

    v_score := floor(v_base * v_correctness_ratio)::integer
             + case when v_is_correct then v_time_bonus else 0 end;

    update public.answers
    set is_correct        = v_is_correct,
        correctness_ratio = v_correctness_ratio,
        distance_km       = v_distance_km,
        time_bonus        = v_time_bonus,
        score             = v_score
    where id = v_row.answer_id;

    v_count := v_count + 1;
    v_delta := v_delta + (v_score - v_row.old_score);
  end loop;

  -- Rebuild participant_scores from scratch for this session.
  delete from public.participant_scores
  where participant_scores.session_id = p_session_id;

  insert into public.participant_scores (
    session_id,
    participant_id,
    total_score,
    correct_count,
    last_updated_at
  )
  select
    a.session_id,
    a.participant_id,
    coalesce(sum(a.score), 0)::integer,
    count(*) filter (where a.score > 0)::integer,
    now()
  from public.answers a
  where a.session_id = p_session_id
  group by a.session_id, a.participant_id;

  -- Rebuild streak per participant — final streak is the trailing run of
  -- score > 0 answers ordered by submitted_at. Compute via a two-step CTE:
  -- (1) tag each answer with its descending row_number; (2) find the row
  -- number of the most-recent zero-score answer (or +infinity if none);
  -- (3) the streak is the count of answers whose descending row_number is
  -- strictly less than that.
  with descending as (
    select
      a.participant_id,
      a.score,
      row_number() over (partition by a.participant_id order by a.submitted_at desc) as rn
    from public.answers a
    where a.session_id = p_session_id
  ),
  first_break as (
    select participant_id, min(rn) as break_rn
    from descending
    where score = 0
    group by participant_id
  ),
  streaks as (
    select
      d.participant_id,
      count(*) as streak
    from descending d
    left join first_break f using (participant_id)
    where d.rn < coalesce(f.break_rn, 1000000)
    group by d.participant_id
  )
  update public.session_participants sp
  set streak = coalesce(s.streak, 0)::integer
  from streaks s
  where sp.session_id = p_session_id
    and sp.id = s.participant_id;

  -- Participants with no answers at all → streak = 0.
  update public.session_participants sp
  set streak = 0
  where sp.session_id = p_session_id
    and not exists (
      select 1 from public.answers a
      where a.session_id = p_session_id
        and a.participant_id = sp.id
    );

  answers_rescored     := v_count;
  total_score_delta    := v_delta;
  participants_touched := (
    select count(*)::integer
    from public.participant_scores
    where participant_scores.session_id = p_session_id
  );
  return next;
end;
$$;

revoke all on function public.rescore_session(uuid) from public;
revoke all on function public.rescore_session(uuid) from anon;
revoke all on function public.rescore_session(uuid) from authenticated;
grant execute on function public.rescore_session(uuid) to service_role;
