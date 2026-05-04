-- ADR-0006 Open Q2 + Q3 RESOLVED — partial-credit scoring.
--
-- Replaces the `submit_answer` RPC to persist `distance_km` and
-- `correctness_ratio` on the answers row and to compute `score` from the
-- ratio rather than the binary `is_correct` flag.
--
-- Scoring rules (mirrors src/lib/scoring.ts exactly — ADR-0006 §5):
--
--   Geo map (p_pin_lat / p_pin_lng non-null + map.geo block present):
--     distance_km        = haversine(pin, target, R=6371)
--     correctness_ratio  = if distance_km < toleranceKm
--                            then (1 - distance_km / toleranceKm)   [0..1)
--                            else 0
--     is_correct         = (correctness_ratio > 0)      -- strict, so d=tol is wrong
--     score              = floor(base * ratio) + (is_correct ? time_bonus : 0)
--
--   Legacy raster map (p_pin_x / p_pin_y non-null):
--     euclidean_pct      = sqrt((pin_x-target_x)^2 + (pin_y-target_y)^2)
--     correctness_ratio  = if euclidean_pct < tolerance
--                            then (1 - euclidean_pct / tolerance)
--                            else 0
--     is_correct         = (correctness_ratio > 0)
--     score              = floor(base * ratio) + (is_correct ? time_bonus : 0)
--
--   Multi-select (p_selected_ids non-null, question type = 'multi'):
--     Jaccard ratio      = |selected intersect correct| / |selected union correct|
--     correctness_ratio  = jaccard ratio (0..1)
--     is_correct         = (correctness_ratio = 1.0)      -- exact match only
--     score              = floor(base * ratio) + (is_correct ? time_bonus : 0)
--
--   Single / truefalse / image:
--     correctness_ratio  = NULL
--     distance_km        = NULL
--     is_correct         = set equality as before (binary)
--     score              = is_correct ? (base + time_bonus) : 0
--
-- NOTE on Postgres array operators:
--   The & (intersection) and | (union) operators belong to the `intarray`
--   extension and apply to integer arrays ONLY. `selected_ids` is text[].
--   We therefore compute Jaccard counts via unnest + INTERSECT/UNION:
--     intersect_count = cardinality of (unnest(p) INTERSECT unnest(q))
--     union_count     = cardinality of (unnest(p) UNION     unnest(q))
--   count(distinct) guards against duplicate entries in either array.
--
-- The function RETURNS TABLE grows two columns (distance_km, correctness_ratio);
-- Postgres rejects CREATE OR REPLACE when the return set changes, so we DROP first.

drop function if exists public.submit_answer(uuid, uuid, uuid, text[], numeric, numeric, numeric, numeric);

create function public.submit_answer(
  p_session_id uuid,
  p_participant_id uuid,
  p_question_id uuid,
  p_selected_ids text[] default null,
  p_pin_x numeric default null,
  p_pin_y numeric default null,
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
  pin_x numeric,
  pin_y numeric,
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
  -- Partial-credit fields
  v_distance_km numeric := null;
  v_correctness_ratio numeric := null;
  -- Geo scratch
  v_target_lat numeric;
  v_target_lng numeric;
  v_tolerance_km numeric;
  v_geo_block jsonb;
  v_h numeric;
  v_d_lat numeric;
  v_d_lng numeric;
  -- Legacy raster scratch
  v_target_x numeric;
  v_target_y numeric;
  v_tolerance numeric;
  v_euclidean_pct numeric;
  -- Multi-select Jaccard scratch
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
    pin_x := v_existing.pin_x;
    pin_y := v_existing.pin_y;
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
        -- Haversine in km, R=6371, matches `src/lib/scoring.ts haversineKm`.
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
          -- Exactly at or beyond tolerance: no credit (strict bound).
          v_correctness_ratio := 0;
          v_is_correct := false;
        end if;
      end if;
    end if;

  elsif p_pin_x is not null and p_pin_y is not null and v_question.map is not null then
    -- Legacy raster %-distance path with partial-credit linear decay.
    v_target_x  := (v_question.map -> 'target' ->> 'x')::numeric;
    v_target_y  := (v_question.map -> 'target' ->> 'y')::numeric;
    v_tolerance := coalesce(v_question.tolerance, 0);

    if v_target_x is not null and v_target_y is not null and v_tolerance > 0 then
      v_euclidean_pct := sqrt(power(p_pin_x - v_target_x, 2) + power(p_pin_y - v_target_y, 2));

      if v_euclidean_pct < v_tolerance then
        v_correctness_ratio := 1 - v_euclidean_pct / v_tolerance;
        v_is_correct := true;
      else
        v_correctness_ratio := 0;
        v_is_correct := false;
      end if;
    end if;

  elsif p_selected_ids is not null and v_question.type = 'multi' then
    -- Multi-select Jaccard partial credit.
    -- NOTE: & and | are intarray integer-array operators — NOT usable on text[].
    -- We use unnest + INTERSECT / UNION with distinct counts instead.
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
      -- Empty selection or no correct_ids defined.
      v_correctness_ratio := 0;
      v_is_correct := false;
    end if;

  elsif p_selected_ids is not null then
    -- Single / truefalse / image — binary set equality (ADR-0006 §5).
    -- correctness_ratio and distance_km stay NULL for these types.
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
  -- base = floor(points * 2/3), time_max = points - base.
  -- -----------------------------------------------------------------------
  v_base     := floor(v_question.points * 2 / 3.0);
  v_time_max := v_question.points - v_base;

  if v_is_correct then
    v_remaining_seconds := greatest(0, extract(epoch from (v_deadline_at - v_now)));
    v_time_bonus := floor(v_time_max * v_remaining_seconds / greatest(1, v_question.time_seconds));
  end if;

  -- Partial-credit types scale base by ratio; binary types use full base.
  if v_correctness_ratio is not null then
    v_score := floor(v_base * v_correctness_ratio)::integer
             + case when v_is_correct then v_time_bonus else 0 end;
  else
    v_score := case when v_is_correct then v_base + v_time_bonus else 0 end;
  end if;

  -- -----------------------------------------------------------------------
  -- Persist answer row (idempotent — UNIQUE on session+question+participant)
  -- -----------------------------------------------------------------------
  insert into public.answers (
    session_id,
    question_id,
    participant_id,
    submitted_at,
    selected_ids,
    pin_x,
    pin_y,
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
    p_pin_x,
    p_pin_y,
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
    pin_x := v_existing.pin_x;
    pin_y := v_existing.pin_y;
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
  pin_x := v_inserted.pin_x;
  pin_y := v_inserted.pin_y;
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

revoke all on function public.submit_answer(uuid, uuid, uuid, text[], numeric, numeric, numeric, numeric) from public;
revoke all on function public.submit_answer(uuid, uuid, uuid, text[], numeric, numeric, numeric, numeric) from anon;
revoke all on function public.submit_answer(uuid, uuid, uuid, text[], numeric, numeric, numeric, numeric) from authenticated;
grant execute on function public.submit_answer(uuid, uuid, uuid, text[], numeric, numeric, numeric, numeric) to service_role;
