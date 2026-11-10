-- One RPC call is one PostgreSQL transaction. Only the authenticated admin
-- server handler may invoke it using service_role; clients cannot bypass guards.
create or replace function public.reorder_quiz_questions(
  p_quiz_id uuid,
  p_ordinals jsonb,
  p_allow_locked_edit boolean default false
) returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_input_count integer;
  v_question_count integer;
  v_session_count integer;
  v_temporary integer[];
  v_index integer;
begin
  if p_ordinals is null or jsonb_typeof(p_ordinals) <> 'array' then
    raise exception using errcode = '22023', message = 'Reorder must be an array.';
  end if;

  -- Validate even direct RPC input, then preserve client array order for ties.
  if exists (
    select 1 from jsonb_array_elements(p_ordinals) item
    where jsonb_typeof(item) <> 'object'
      or jsonb_typeof(item->'id') is distinct from 'string'
      or jsonb_typeof(item->'ordinal') is distinct from 'number'
  ) then
    raise exception using errcode = '22023', message = 'Reorder entries are invalid.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_ordinals) item
    where (item->>'ordinal')::numeric < 1
      or trunc((item->>'ordinal')::numeric) <> (item->>'ordinal')::numeric
  ) then
    raise exception using errcode = '22023', message = 'Reorder ordinals must be positive integers.';
  end if;
  begin
    select coalesce(array_agg((item->>'id')::uuid order by (item->>'ordinal')::numeric, position), '{}'::uuid[])
    into v_ids
    from jsonb_array_elements(p_ordinals) with ordinality as input(item, position);
  exception when invalid_text_representation then
    raise exception using errcode = '22023', message = 'Reorder question IDs are invalid.';
  end;
  v_input_count := cardinality(v_ids);
  if (select count(distinct id) from unnest(v_ids) id) <> v_input_count then
    raise exception using errcode = '22023', message = 'Reorder must include all questions exactly once and no others.';
  end if;

  -- Serializes reorders and blocks concurrent FK inserts into this quiz until
  -- commit. Existing question updates/deletes are locked in deterministic order.
  perform 1 from public.quizzes where id = p_quiz_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Quiz not found.';
  end if;
  perform id from public.questions where quiz_id = p_quiz_id order by id for update;
  select count(*) into v_question_count from public.questions where quiz_id = p_quiz_id;
  if v_input_count <> v_question_count or exists (
    select 1 from public.questions where quiz_id = p_quiz_id and not (id = any(v_ids))
  ) then
    raise exception using errcode = '22023', message = 'Reorder must include all questions exactly once and no others.';
  end if;

  -- Recheck the route's edit guard under the quiz lock, closing its lookup/write
  -- race with creation of the first session. Explicit admin override persists.
  select count(*) into v_session_count from public.sessions where quiz_id = p_quiz_id;
  if v_session_count > 0 and not coalesce(p_allow_locked_edit, false) then
    raise exception using errcode = 'P0001', message = 'QUIZ_LOCKED', detail = v_session_count::text;
  end if;
  if v_question_count = 0 then return 0; end if;

  -- Pick free negative slots rather than negating old values: interrupted older
  -- implementations may already have left negative or extreme sparse ordinals.
  -- At most N slots are occupied, so the first 2N candidates contain N free slots.
  select array_agg(slot order by slot desc) into v_temporary from (
    select (-candidate)::integer as slot
    from generate_series(1::bigint, least(v_question_count::bigint * 2, 2147483648::bigint)) candidate
    where not exists (
      select 1 from public.questions q where q.quiz_id = p_quiz_id and q.ordinal = -candidate
    )
    order by candidate
    limit v_question_count
  ) free_slots;
  if cardinality(v_temporary) <> v_question_count then
    raise exception using errcode = '54000', message = 'Insufficient temporary ordinal slots.';
  end if;

  for v_index in 1..v_question_count loop
    update public.questions set ordinal = v_temporary[v_index]
    where id = v_ids[v_index] and quiz_id = p_quiz_id;
  end loop;
  for v_index in 1..v_question_count loop
    update public.questions set ordinal = v_index
    where id = v_ids[v_index] and quiz_id = p_quiz_id;
  end loop;
  return v_question_count;
end;
$$;

revoke all on function public.reorder_quiz_questions(uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.reorder_quiz_questions(uuid, jsonb, boolean) to service_role;
notify pgrst, 'reload schema';
