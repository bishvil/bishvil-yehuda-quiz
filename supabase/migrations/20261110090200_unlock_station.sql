-- Invoked only by authenticated server handlers using service_role.
create or replace function public.unlock_quiz_station(
  p_session_id uuid, p_participant_id uuid, p_question_id uuid,
  p_lat double precision default null, p_lng double precision default null,
  p_accuracy double precision default null, p_measured_at timestamptz default null,
  p_actor uuid default null
) returns text language plpgsql set search_path = public as $$
declare
  s public.sessions%rowtype; q public.questions%rowtype;
  progress public.participant_question_progress%rowtype;
  gate jsonb; d double precision; radius double precision;
  unlocked_at timestamptz := clock_timestamp();
begin
  select * into s from public.sessions where id = p_session_id for update;
  if not found or s.game_mode <> 'async' or s.status <> 'live'
     or (s.ended_at is not null and s.ended_at < unlocked_at) then return 'session_unavailable'; end if;
  if not exists(select 1 from public.session_participants where id = p_participant_id and session_id = s.id and status <> 'completed') then return 'participant_unavailable'; end if;
  select * into progress from public.participant_question_progress where session_id = s.id and participant_id = p_participant_id
    order by question_index desc limit 1 for update;
  if not found or progress.question_id <> p_question_id then return 'question_not_active'; end if;
  if progress.location_unlocked_at is not null then return 'unlocked'; end if;
  select * into q from public.questions where id = p_question_id and quiz_id = s.quiz_id;
  gate := q.settings->'locationGate';
  if gate is null or gate = 'null'::jsonb then return 'question_not_gated'; end if;
  radius := (gate->>'radiusM')::double precision;
  if p_actor is null then
    if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180
      or p_accuracy is null or p_accuracy < 0 or p_accuracy > least(radius, 100)
      or p_measured_at is null or p_measured_at < unlocked_at - interval '30 seconds'
      or p_measured_at > unlocked_at + interval '5 seconds' then return 'location_inaccurate'; end if;
    d := 2 * 6371000 * asin(least(1, sqrt(
      sin(radians(p_lat - (gate->>'lat')::double precision) / 2)^2 +
      cos(radians(p_lat)) * cos(radians((gate->>'lat')::double precision)) *
      sin(radians(p_lng - (gate->>'lng')::double precision) / 2)^2)));
    if d > radius then return 'outside_radius'; end if;
  end if;
  update public.participant_question_progress set
    location_unlocked_at = unlocked_at, location_unlock_actor = p_actor,
    started_at = unlocked_at,
    status = case when q.type = 'content' then 'revealed'::public.async_question_status else 'answering'::public.async_question_status end,
    revealed_at = case when q.type = 'content' then unlocked_at else null end,
    deadline_at = case when q.type = 'content' or not coalesce((q.settings->>'timeLimitEnabled')::boolean,true) then null
      else unlocked_at + make_interval(secs => q.time_seconds + q.media_lead_seconds) end
  where session_id = s.id and participant_id = p_participant_id and question_id = p_question_id;
  return 'unlocked';
end; $$;
revoke all on function public.unlock_quiz_station(uuid,uuid,uuid,double precision,double precision,double precision,timestamptz,uuid) from public;
grant execute on function public.unlock_quiz_station(uuid,uuid,uuid,double precision,double precision,double precision,timestamptz,uuid) to service_role;
notify pgrst, 'reload schema';
