-- Sunset of the legacy `{x,y}` map path (ADR-0011 §12.4 RESOLVED).
--
-- Removes:
--   * answers.pin_x / pin_y           (legacy raster pin coordinates)
--   * questions.tolerance             (legacy %-radius)
--   * answers_pin_pair_exclusive_check (now redundant — only the geo pair exists)
--   * answers_pin_geo_range_check     (re-added below as a tighter check
--     scoped to the surviving lat/lng columns; the original CHECK referenced
--     pin_x/pin_y which we are dropping in the same statement)
--   * legacy %-based scoring branch in `submit_answer`
--
-- The participant editor never persisted a `{x,y}` map question (no admin
-- UI), so no production data is lost. Migrations 0000_sloppy_bug and
-- 20260501065640_map_geo_answers added the legacy columns; this migration
-- is their gravestone.

-- 1. Drop legacy CHECK constraints first (they reference pin_x/pin_y).
alter table public.answers
  drop constraint if exists answers_pin_geo_range_check,
  drop constraint if exists answers_pin_pair_exclusive_check;

-- 2. Drop legacy columns.
alter table public.answers
  drop column if exists pin_x,
  drop column if exists pin_y;

alter table public.questions
  drop column if exists tolerance;

-- 3. Restore the lat/lng range check, scoped to the surviving columns.
alter table public.answers
  add constraint answers_pin_geo_range_check
  check (
    (pin_lat is null or (pin_lat >= -90 and pin_lat <= 90))
    and (pin_lng is null or (pin_lng >= -180 and pin_lng <= 180))
  );

-- 4. Replace `submit_answer` with a geo-only signature. The previous
--    function returned pin_x / pin_y in its result set; Postgres rejects
--    CREATE OR REPLACE when the return shape changes, so DROP first.
drop function if exists public.submit_answer(uuid, uuid, uuid, text[], numeric, numeric, numeric, numeric);

create function public.submit_answer(
  p_session_id uuid,
  p_participant_id uuid,
  p_question_id uuid,
  p_selected_ids text[] default null,
  p_pin_lat numeric default null,
  p_pin_lng numeric default null
)
returns table (
  result_status text,
  inserted boolean,
  answer_id uuid,
  session_id uuid,
  question_id uuid,
  participant_id uuid,
  submitted_at timestamptz,
  selected_ids text[],
  pin_lat numeric,
  pin_lng numeric,
  is_correct boolean,
  time_bonus integer,
  score integer,
  distance_km numeric,
  correctness_ratio numeric,
  question_status text,
  deadline_at timestamptz,
  correct_ids text[],
  explanation text
)
language plpgsql
as $$
#variable_conflict use_column
declare
  v_now timestamptz := now();
  v_session public.sessions%rowtype;
  v_participant public.session_participants%rowtype;
  v_question public.questions%rowtype;
  v_sync_state public.question_session_state%rowtype;
  v_async_progress public.participant_question_progress%rowtype;
  v_status text;
  v_started_at timestamptz;
  v_deadline_at timestamptz;
  v_existing public.answers%rowtype;
  v_inserted public.answers%rowtype;
  v_is_correct boolean := false;
  v_base integer;
  v_time_max integer;
  v_remaining_seconds numeric;
  v_score integer := 0;
  v_time_bonus integer := 0;
  v_distance_km numeric := null;
  v_correctness_ratio numeric := null;
  v_target_lat numeric;
  v_target_lng numeric;
  v_tolerance_km numeric;
  v_geo_block jsonb;
  v_h numeric;
  v_d_lat numeric;
  v_d_lng numeric;
  v_intersect_count bigint;
  v_union_count bigint;
begin
  select *
  into v_session
  from public.sessions
  where id = p_session_id
  for update;

  if not found then
    result_status := 'session_not_found';
    return next;
    return;
  end if;

  if v_session.status = 'ended' then
    result_status := 'session_ended';
    return next;
    return;
  end if;

  if v_session.ended_at is not null and v_now > v_session.ended_at then
    result_status := 'session_expired';
    return next;
    return;
  end if;

  select *
  into v_participant
  from public.session_participants
  where session_participants.session_id = p_session_id
    and session_participants.id = p_participant_id
  for update;

  if not found then
    result_status := 'participant_not_found';
    return next;
    return;
  end if;

  select *
  into v_question
  from public.questions
  where id = p_question_id
    and quiz_id = v_session.quiz_id;

  if not found then
    result_status := 'question_not_found';
    return next;
    return;
  end if;

  if v_session.game_mode = 'sync' then
    select *
    into v_sync_state
    from public.question_session_state
    where question_session_state.session_id = p_session_id
      and question_session_state.question_id = p_question_id
    for update;

    if not found then
      result_status := 'question_not_active';
      return next;
      return;
    end if;

    if v_sync_state.status = 'answering'
      and v_sync_state.deadline_at is not null
      and v_now > v_sync_state.deadline_at
    then
      update public.question_session_state
      set
        status = case when v_session.auto_reveal then 'revealed'::public.question_status else 'locked'::public.question_status end,
        revealed_at = case when v_session.auto_reveal then v_now else revealed_at end
      where question_session_state.session_id = p_session_id
        and question_session_state.question_id = p_question_id
      returning * into v_sync_state;
    end if;

    v_status := v_sync_state.status::text;
    v_started_at := v_sync_state.started_at;
    v_deadline_at := v_sync_state.deadline_at;
  else
    select *
    into v_async_progress
    from public.participant_question_progress
    where participant_question_progress.session_id = p_session_id
      and participant_question_progress.participant_id = p_participant_id
      and participant_question_progress.question_id = p_question_id
    for update;

    if not found then
      result_status := 'question_not_active';
      return next;
      return;
    end if;

    if v_async_progress.status = 'answering' and v_now > v_async_progress.deadline_at then
      update public.participant_question_progress
      set status = 'revealed'::public.async_question_status,
          revealed_at = v_now
      where participant_question_progress.session_id = p_session_id
        and participant_question_progress.participant_id = p_participant_id
        and participant_question_progress.question_id = p_question_id
      returning * into v_async_progress;
    end if;

    v_status := v_async_progress.status::text;
    v_started_at := v_async_progress.started_at;
    v_deadline_at := v_async_progress.deadline_at;
  end if;

  select *
  into v_existing
  from public.answers
  where answers.session_id = p_session_id
    and answers.question_id = p_question_id
    and answers.participant_id = p_participant_id;

  if found then
    if v_session.game_mode = 'async' and v_status = 'answering' then
      update public.participant_question_progress
      set status = 'revealed'::public.async_question_status,
          revealed_at = v_existing.submitted_at
      where participant_question_progress.session_id = p_session_id
        and participant_question_progress.participant_id = p_participant_id
        and participant_question_progress.question_id = p_question_id;
      v_status := 'revealed';
    end if;

    result_status := 'already_submitted';
    inserted := false;
    answer_id := v_existing.id;
    session_id := v_existing.session_id;
    question_id := v_existing.question_id;
    participant_id := v_existing.participant_id;
    submitted_at := v_existing.submitted_at;
    selected_ids := v_existing.selected_ids;
    pin_lat := v_existing.pin_lat;
    pin_lng := v_existing.pin_lng;
    is_correct := v_existing.is_correct;
    time_bonus := v_existing.time_bonus;
    score := v_existing.score;
    distance_km := v_existing.distance_km;
    correctness_ratio := v_existing.correctness_ratio;
    question_status := v_status;
    deadline_at := v_deadline_at;
    correct_ids := v_question.correct_ids;
    explanation := v_question.explanation;
    return next;
    return;
  end if;

  if v_status <> 'answering' then
    result_status := case when v_status is null then 'question_not_active' else 'late_submission' end;
    question_status := v_status;
    deadline_at := v_deadline_at;
    return next;
    return;
  end if;

  if v_started_at is null or v_deadline_at is null then
    result_status := 'question_not_active';
    question_status := v_status;
    deadline_at := v_deadline_at;
    return next;
    return;
  end if;

  -- -----------------------------------------------------------------------
  -- Correctness + partial-credit calculation
  -- -----------------------------------------------------------------------

  if p_pin_lat is not null and p_pin_lng is not null and v_question.map is not null then
    -- ADR-0011 geographic path with partial-credit linear decay.
    v_geo_block := v_question.map -> 'geo';
    if v_geo_block is not null then
      v_target_lat   := (v_geo_block -> 'target' ->> 'lat')::numeric;
      v_target_lng   := (v_geo_block -> 'target' ->> 'lng')::numeric;
      v_tolerance_km := (v_geo_block ->> 'toleranceKm')::numeric;

      if v_target_lat is not null and v_target_lng is not null
         and v_tolerance_km is not null and v_tolerance_km > 0 then
        v_d_lat := radians(p_pin_lat - v_target_lat);
        v_d_lng := radians(p_pin_lng - v_target_lng);
        v_h := sin(v_d_lat / 2) ^ 2
             + cos(radians(v_target_lat)) * cos(radians(p_pin_lat))
             * sin(v_d_lng / 2) ^ 2;
        v_distance_km := 2 * 6371 * asin(least(1, sqrt(v_h)));

        if v_distance_km < v_tolerance_km then
          v_correctness_ratio := 1 - v_distance_km / v_tolerance_km;
          v_is_correct := true;
        else
          v_correctness_ratio := 0;
          v_is_correct := false;
        end if;
      end if;
    end if;

  elsif p_selected_ids is not null and v_question.type = 'multi' then
    -- Multi-select Jaccard partial credit.
    if v_question.correct_ids is not null
       and cardinality(v_question.correct_ids) > 0
       and cardinality(p_selected_ids) > 0 then

      select count(distinct x)
      into v_intersect_count
      from (
        select unnest(p_selected_ids) as x
        intersect
        select unnest(v_question.correct_ids)
      ) sub;

      select count(distinct x)
      into v_union_count
      from (
        select unnest(p_selected_ids) as x
        union
        select unnest(v_question.correct_ids)
      ) sub;

      if v_union_count > 0 then
        v_correctness_ratio := v_intersect_count::numeric / v_union_count::numeric;
      else
        v_correctness_ratio := 0;
      end if;

      v_is_correct := (v_correctness_ratio = 1.0);
    else
      v_correctness_ratio := 0;
      v_is_correct := false;
    end if;

  elsif p_selected_ids is not null then
    -- Single / truefalse / image — binary set equality (ADR-0006 §5).
    v_is_correct := v_question.correct_ids is not null
      and cardinality(p_selected_ids) = cardinality(v_question.correct_ids)
      and coalesce(
        (select array_agg(value order by value) from unnest(p_selected_ids) as value),
        array[]::text[]
      ) = coalesce(
        (select array_agg(value order by value) from unnest(v_question.correct_ids) as value),
        array[]::text[]
      );
  end if;

  -- -----------------------------------------------------------------------
  -- Score computation (ADR-0006 §5 Open Q1 RESOLVED)
  -- -----------------------------------------------------------------------
  v_base     := floor(v_question.points * 2 / 3.0);
  v_time_max := v_question.points - v_base;

  if v_is_correct then
    v_remaining_seconds := greatest(0, extract(epoch from (v_deadline_at - v_now)));
    v_time_bonus := floor(v_time_max * v_remaining_seconds / greatest(1, v_question.time_seconds));
  end if;

  if v_correctness_ratio is not null then
    v_score := floor(v_base * v_correctness_ratio)::integer
             + case when v_is_correct then v_time_bonus else 0 end;
  else
    v_score := case when v_is_correct then v_base + v_time_bonus else 0 end;
  end if;

  -- -----------------------------------------------------------------------
  -- Persist answer row
  -- -----------------------------------------------------------------------
  insert into public.answers (
    session_id,
    question_id,
    participant_id,
    submitted_at,
    selected_ids,
    pin_lat,
    pin_lng,
    is_correct,
    time_bonus,
    score,
    distance_km,
    correctness_ratio
  )
  values (
    p_session_id,
    p_question_id,
    p_participant_id,
    v_now,
    p_selected_ids,
    p_pin_lat,
    p_pin_lng,
    v_is_correct,
    v_time_bonus,
    v_score,
    v_distance_km,
    v_correctness_ratio
  )
  on conflict (session_id, question_id, participant_id) do nothing
  returning * into v_inserted;

  if not found then
    select *
    into v_existing
    from public.answers
    where answers.session_id = p_session_id
      and answers.question_id = p_question_id
      and answers.participant_id = p_participant_id;

    result_status := 'already_submitted';
    inserted := false;
    answer_id := v_existing.id;
    session_id := v_existing.session_id;
    question_id := v_existing.question_id;
    participant_id := v_existing.participant_id;
    submitted_at := v_existing.submitted_at;
    selected_ids := v_existing.selected_ids;
    pin_lat := v_existing.pin_lat;
    pin_lng := v_existing.pin_lng;
    is_correct := v_existing.is_correct;
    time_bonus := v_existing.time_bonus;
    score := v_existing.score;
    distance_km := v_existing.distance_km;
    correctness_ratio := v_existing.correctness_ratio;
    question_status := v_status;
    deadline_at := v_deadline_at;
    correct_ids := v_question.correct_ids;
    explanation := v_question.explanation;
    return next;
    return;
  end if;

  insert into public.participant_scores (
    session_id,
    participant_id,
    total_score,
    correct_count,
    last_updated_at
  )
  values (
    p_session_id,
    p_participant_id,
    v_score,
    case when v_is_correct then 1 else 0 end,
    v_now
  )
  on conflict (session_id, participant_id) do update
  set
    total_score   = participant_scores.total_score + excluded.total_score,
    correct_count = participant_scores.correct_count + excluded.correct_count,
    last_updated_at = excluded.last_updated_at;

  update public.session_participants
  set
    streak = case when v_is_correct then v_participant.streak + 1 else 0 end,
    status = case when v_participant.status = 'joined' then 'in_progress'::public.participant_status else v_participant.status end
  where id = p_participant_id;

  if v_session.game_mode = 'async' then
    update public.participant_question_progress
    set status = 'revealed'::public.async_question_status,
        revealed_at = v_now
    where participant_question_progress.session_id = p_session_id
      and participant_question_progress.participant_id = p_participant_id
      and participant_question_progress.question_id = p_question_id;
    v_status := 'revealed';
  end if;

  result_status := 'submitted';
  inserted := true;
  answer_id := v_inserted.id;
  session_id := v_inserted.session_id;
  question_id := v_inserted.question_id;
  participant_id := v_inserted.participant_id;
  submitted_at := v_inserted.submitted_at;
  selected_ids := v_inserted.selected_ids;
  pin_lat := v_inserted.pin_lat;
  pin_lng := v_inserted.pin_lng;
  is_correct := v_inserted.is_correct;
  time_bonus := v_inserted.time_bonus;
  score := v_inserted.score;
  distance_km := v_inserted.distance_km;
  correctness_ratio := v_inserted.correctness_ratio;
  question_status := v_status;
  deadline_at := v_deadline_at;
  correct_ids := v_question.correct_ids;
  explanation := v_question.explanation;
  return next;
end;
$$;

revoke all on function public.submit_answer(uuid, uuid, uuid, text[], numeric, numeric) from public;
revoke all on function public.submit_answer(uuid, uuid, uuid, text[], numeric, numeric) from anon;
revoke all on function public.submit_answer(uuid, uuid, uuid, text[], numeric, numeric) from authenticated;
grant execute on function public.submit_answer(uuid, uuid, uuid, text[], numeric, numeric) to service_role;
