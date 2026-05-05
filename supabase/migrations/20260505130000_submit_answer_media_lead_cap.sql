-- Cap time-bonus remaining seconds at `time_seconds` (ADR-0013).
--
-- Context: question-start handlers now write `deadline_at = now() +
-- time_seconds + media_lead_seconds` so the answer timer doesn't tick while
-- a video plays before the answer phase. Without this fix, the existing
-- bonus formula `time_bonus = time_max * remaining / time_seconds` would
-- exceed `time_max` whenever `remaining > time_seconds` — i.e. for any
-- submission during the media gate. (A well-behaved client hides the
-- options until the gate lifts, but a malicious client could submit
-- earlier and harvest a > time_max bonus.)
--
-- The fix is a one-line cap: `remaining = least(time_seconds, deadline -
-- now)`. Equivalent to subtracting `media_lead_seconds` and clamping to
-- the [0, time_seconds] range, but simpler. Existing rows (with
-- media_lead_seconds = 0) behave identically.
--
-- The function return shape is unchanged.

drop function if exists public.submit_answer(uuid, uuid, uuid, text[], numeric, numeric);

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
  v_correctness_ratio numeric := 0;
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

  select c.is_correct, c.correctness_ratio, c.distance_km
  into v_is_correct, v_correctness_ratio, v_distance_km
  from public._score_correctness(v_question, p_selected_ids, p_pin_lat, p_pin_lng) c;

  -- -----------------------------------------------------------------------
  -- Score computation (ADR-0006 §5, ADR-0013 cap).
  --
  -- The answer-phase length is `time_seconds`, regardless of any video
  -- gate that ran before it. Cap remaining at `time_seconds` so a client
  -- that submits during the media-lead window can't exceed `time_max`.
  -- -----------------------------------------------------------------------
  v_base     := floor(v_question.points * 2 / 3.0);
  v_time_max := v_question.points - v_base;

  if v_is_correct then
    v_remaining_seconds := least(
      v_question.time_seconds::numeric,
      greatest(0, extract(epoch from (v_deadline_at - v_now)))
    );
    v_time_bonus := floor(v_time_max * v_remaining_seconds / greatest(1, v_question.time_seconds));
  end if;

  v_score := floor(v_base * v_correctness_ratio)::integer
           + case when v_is_correct then v_time_bonus else 0 end;

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
    case when v_score > 0 then 1 else 0 end,
    v_now
  )
  on conflict (session_id, participant_id) do update
  set
    total_score   = participant_scores.total_score + excluded.total_score,
    correct_count = participant_scores.correct_count + excluded.correct_count,
    last_updated_at = excluded.last_updated_at;

  update public.session_participants
  set
    streak = case when v_score > 0 then v_participant.streak + 1 else 0 end,
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
