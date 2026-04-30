create or replace function public.submit_answer(
  p_session_id uuid,
  p_participant_id uuid,
  p_question_id uuid,
  p_selected_ids text[] default null,
  p_pin_x numeric default null,
  p_pin_y numeric default null
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
  is_correct boolean,
  time_bonus integer,
  score integer,
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
  v_target_x numeric;
  v_target_y numeric;
  v_tolerance numeric;
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
    is_correct := v_existing.is_correct;
    time_bonus := v_existing.time_bonus;
    score := v_existing.score;
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

  if p_selected_ids is not null then
    v_is_correct := v_question.correct_ids is not null
      and cardinality(p_selected_ids) = cardinality(v_question.correct_ids)
      and coalesce(
        (select array_agg(value order by value) from unnest(p_selected_ids) as value),
        array[]::text[]
      ) = coalesce(
        (select array_agg(value order by value) from unnest(v_question.correct_ids) as value),
        array[]::text[]
      );
  elsif p_pin_x is not null and p_pin_y is not null and v_question.map is not null then
    v_target_x := (v_question.map->'target'->>'x')::numeric;
    v_target_y := (v_question.map->'target'->>'y')::numeric;
    v_tolerance := coalesce(v_question.tolerance, 0);
    v_is_correct := sqrt(power(p_pin_x - v_target_x, 2) + power(p_pin_y - v_target_y, 2)) <= v_tolerance;
  end if;

  v_base := floor(v_question.points * 2 / 3.0);
  v_time_max := v_question.points - v_base;

  if v_is_correct then
    v_remaining_seconds := greatest(0, extract(epoch from (v_deadline_at - v_now)));
    v_time_bonus := floor(v_time_max * v_remaining_seconds / greatest(1, v_question.time_seconds));
    v_score := v_base + v_time_bonus;
  end if;

  insert into public.answers (
    session_id,
    question_id,
    participant_id,
    submitted_at,
    selected_ids,
    pin_x,
    pin_y,
    is_correct,
    time_bonus,
    score
  )
  values (
    p_session_id,
    p_question_id,
    p_participant_id,
    v_now,
    p_selected_ids,
    p_pin_x,
    p_pin_y,
    v_is_correct,
    v_time_bonus,
    v_score
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
    is_correct := v_existing.is_correct;
    time_bonus := v_existing.time_bonus;
    score := v_existing.score;
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
    total_score = participant_scores.total_score + excluded.total_score,
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
  is_correct := v_inserted.is_correct;
  time_bonus := v_inserted.time_bonus;
  score := v_inserted.score;
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
