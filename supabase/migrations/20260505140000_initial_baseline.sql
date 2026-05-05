


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."async_question_status" AS ENUM (
    'answering',
    'locked',
    'revealed'
);


ALTER TYPE "public"."async_question_status" OWNER TO "postgres";


CREATE TYPE "public"."game_mode" AS ENUM (
    'sync',
    'async'
);


ALTER TYPE "public"."game_mode" OWNER TO "postgres";


CREATE TYPE "public"."participant_status" AS ENUM (
    'joined',
    'in_progress',
    'completed'
);


ALTER TYPE "public"."participant_status" OWNER TO "postgres";


CREATE TYPE "public"."question_status" AS ENUM (
    'idle',
    'presenting',
    'answering',
    'locked',
    'revealed'
);


ALTER TYPE "public"."question_status" OWNER TO "postgres";


CREATE TYPE "public"."question_type" AS ENUM (
    'single',
    'multi',
    'truefalse',
    'image',
    'map',
    'video'
);


ALTER TYPE "public"."question_type" OWNER TO "postgres";


CREATE TYPE "public"."session_status" AS ENUM (
    'draft',
    'scheduled',
    'live',
    'paused',
    'ended'
);


ALTER TYPE "public"."session_status" OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."questions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "quiz_id" "uuid" NOT NULL,
    "ordinal" integer NOT NULL,
    "type" "public"."question_type" NOT NULL,
    "prompt" "text" NOT NULL,
    "options" "jsonb",
    "correct_ids" "text"[],
    "map" "jsonb",
    "image_url" "text",
    "explanation" "text",
    "time_seconds" integer DEFAULT 25 NOT NULL,
    "points" integer DEFAULT 1500 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "image_alt" "text",
    "image_width" integer,
    "image_height" integer,
    "image_path" "text",
    "video_url" "text",
    "video_path" "text",
    "video_embed_url" "text",
    "video_provider" "text",
    "video_mime_type" "text",
    "video_duration_seconds" integer,
    "video_poster_url" "text",
    "video_width" integer,
    "video_height" integer,
    "media_lead_seconds" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "questions_image_height_positive" CHECK ((("image_height" IS NULL) OR ("image_height" > 0))),
    CONSTRAINT "questions_image_width_positive" CHECK ((("image_width" IS NULL) OR ("image_width" > 0))),
    CONSTRAINT "questions_map_payload_present_check" CHECK ((("type" <> 'map'::"public"."question_type") OR (("map" ? 'image_url'::"text") AND ("map" ? 'target'::"text")) OR (("map" ? 'geo'::"text") AND (("map" -> 'geo'::"text") ? 'target'::"text") AND (("map" -> 'geo'::"text") ? 'toleranceKm'::"text")))),
    CONSTRAINT "questions_media_lead_seconds_range" CHECK ((("media_lead_seconds" >= 0) AND ("media_lead_seconds" <= 600))),
    CONSTRAINT "questions_points_positive_check" CHECK (("points" > 0)),
    CONSTRAINT "questions_time_seconds_positive_check" CHECK (("time_seconds" > 0)),
    CONSTRAINT "questions_video_duration_positive" CHECK ((("video_duration_seconds" IS NULL) OR ("video_duration_seconds" > 0))),
    CONSTRAINT "questions_video_embed_url_length" CHECK ((("video_embed_url" IS NULL) OR ("length"("video_embed_url") <= 2048))),
    CONSTRAINT "questions_video_height_positive" CHECK ((("video_height" IS NULL) OR ("video_height" > 0))),
    CONSTRAINT "questions_video_poster_url_length" CHECK ((("video_poster_url" IS NULL) OR ("length"("video_poster_url") <= 2048))),
    CONSTRAINT "questions_video_provider_allowed" CHECK ((("video_provider" IS NULL) OR ("video_provider" = ANY (ARRAY['self'::"text", 'youtube'::"text", 'vimeo'::"text"])))),
    CONSTRAINT "questions_video_source_exclusive" CHECK ((("video_url" IS NULL) OR ("video_embed_url" IS NULL))),
    CONSTRAINT "questions_video_url_length" CHECK ((("video_url" IS NULL) OR ("length"("video_url") <= 2048))),
    CONSTRAINT "questions_video_width_positive" CHECK ((("video_width" IS NULL) OR ("video_width" > 0)))
);


ALTER TABLE "public"."questions" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_score_correctness"("p_question" "public"."questions", "p_selected_ids" "text"[], "p_pin_lat" numeric, "p_pin_lng" numeric) RETURNS TABLE("is_correct" boolean, "correctness_ratio" numeric, "distance_km" numeric)
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
declare
  v_geo_block jsonb;
  v_target_lat numeric;
  v_target_lng numeric;
  v_tolerance_km numeric;
  v_d_lat numeric;
  v_d_lng numeric;
  v_h numeric;
  v_intersect_count bigint;
  v_union_count bigint;
begin
  is_correct        := false;
  correctness_ratio := 0;
  distance_km       := null;

  if p_pin_lat is not null and p_pin_lng is not null and p_question.map is not null then
    v_geo_block := p_question.map -> 'geo';
    if v_geo_block is null then
      return next;
      return;
    end if;

    v_target_lat   := (v_geo_block -> 'target' ->> 'lat')::numeric;
    v_target_lng   := (v_geo_block -> 'target' ->> 'lng')::numeric;
    v_tolerance_km := (v_geo_block ->> 'toleranceKm')::numeric;

    if v_target_lat is null or v_target_lng is null
       or v_tolerance_km is null or v_tolerance_km <= 0 then
      return next;
      return;
    end if;

    v_d_lat := radians(p_pin_lat - v_target_lat);
    v_d_lng := radians(p_pin_lng - v_target_lng);
    v_h := sin(v_d_lat / 2) ^ 2
         + cos(radians(v_target_lat)) * cos(radians(p_pin_lat))
         * sin(v_d_lng / 2) ^ 2;
    distance_km := 2 * 6371 * asin(least(1, sqrt(v_h)));

    if distance_km < v_tolerance_km then
      correctness_ratio := 1 - distance_km / v_tolerance_km;
      is_correct        := true;
    end if;
    return next;
    return;
  end if;

  if p_selected_ids is not null and p_question.type = 'multi' then
    if p_question.correct_ids is null
       or cardinality(p_question.correct_ids) = 0
       or cardinality(p_selected_ids) = 0 then
      return next;
      return;
    end if;

    -- text[] cannot use intarray's & / | operators — use unnest + INTERSECT/UNION.
    select count(distinct x)
    into v_intersect_count
    from (
      select unnest(p_selected_ids) as x
      intersect
      select unnest(p_question.correct_ids)
    ) sub;

    select count(distinct x)
    into v_union_count
    from (
      select unnest(p_selected_ids) as x
      union
      select unnest(p_question.correct_ids)
    ) sub;

    if v_union_count > 0 then
      correctness_ratio := v_intersect_count::numeric / v_union_count::numeric;
    end if;
    is_correct := (correctness_ratio = 1.0);
    return next;
    return;
  end if;

  if p_selected_ids is not null then
    is_correct := p_question.correct_ids is not null
      and cardinality(p_selected_ids) = cardinality(p_question.correct_ids)
      and coalesce(
        (select array_agg(value order by value) from unnest(p_selected_ids) as value),
        array[]::text[]
      ) = coalesce(
        (select array_agg(value order by value) from unnest(p_question.correct_ids) as value),
        array[]::text[]
      );
    correctness_ratio := case when is_correct then 1 else 0 end;
    return next;
    return;
  end if;

  return next;
end;
$$;


ALTER FUNCTION "public"."_score_correctness"("p_question" "public"."questions", "p_selected_ids" "text"[], "p_pin_lat" numeric, "p_pin_lng" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rescore_session"("p_session_id" "uuid") RETURNS TABLE("answers_rescored" integer, "total_score_delta" integer, "participants_touched" integer)
    LANGUAGE "plpgsql"
    AS $$
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


ALTER FUNCTION "public"."rescore_session"("p_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_answer"("p_session_id" "uuid", "p_participant_id" "uuid", "p_question_id" "uuid", "p_selected_ids" "text"[] DEFAULT NULL::"text"[], "p_pin_lat" numeric DEFAULT NULL::numeric, "p_pin_lng" numeric DEFAULT NULL::numeric) RETURNS TABLE("result_status" "text", "inserted" boolean, "answer_id" "uuid", "session_id" "uuid", "question_id" "uuid", "participant_id" "uuid", "submitted_at" timestamp with time zone, "selected_ids" "text"[], "pin_lat" numeric, "pin_lng" numeric, "is_correct" boolean, "time_bonus" integer, "score" integer, "distance_km" numeric, "correctness_ratio" numeric, "question_status" "text", "deadline_at" timestamp with time zone, "correct_ids" "text"[], "explanation" "text")
    LANGUAGE "plpgsql"
    AS $$
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


ALTER FUNCTION "public"."submit_answer"("p_session_id" "uuid", "p_participant_id" "uuid", "p_question_id" "uuid", "p_selected_ids" "text"[], "p_pin_lat" numeric, "p_pin_lng" numeric) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."answers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "question_id" "uuid" NOT NULL,
    "participant_id" "uuid" NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "selected_ids" "text"[],
    "is_correct" boolean NOT NULL,
    "time_bonus" integer DEFAULT 0 NOT NULL,
    "score" integer DEFAULT 0 NOT NULL,
    "pin_lat" numeric(8,5),
    "pin_lng" numeric(9,5),
    "distance_km" numeric(10,3),
    "correctness_ratio" numeric(4,3),
    CONSTRAINT "answers_correctness_ratio_range" CHECK ((("correctness_ratio" IS NULL) OR (("correctness_ratio" >= (0)::numeric) AND ("correctness_ratio" <= (1)::numeric)))),
    CONSTRAINT "answers_distance_km_nonneg" CHECK ((("distance_km" IS NULL) OR ("distance_km" >= (0)::numeric))),
    CONSTRAINT "answers_pin_geo_range_check" CHECK (((("pin_lat" IS NULL) OR (("pin_lat" >= ('-90'::integer)::numeric) AND ("pin_lat" <= (90)::numeric))) AND (("pin_lng" IS NULL) OR (("pin_lng" >= ('-180'::integer)::numeric) AND ("pin_lng" <= (180)::numeric)))))
);


ALTER TABLE "public"."answers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."brands" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text",
    "name" "text" NOT NULL,
    "tagline" "text",
    "logo_url" "text" NOT NULL,
    "primary_color" "text" DEFAULT '#306030'::"text" NOT NULL,
    "accent_color" "text" DEFAULT '#A0C040'::"text" NOT NULL,
    "is_system" boolean DEFAULT false NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "archived_at" timestamp with time zone
);


ALTER TABLE "public"."brands" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."participant_question_progress" (
    "session_id" "uuid" NOT NULL,
    "participant_id" "uuid" NOT NULL,
    "question_id" "uuid" NOT NULL,
    "question_index" integer NOT NULL,
    "status" "public"."async_question_status" NOT NULL,
    "started_at" timestamp with time zone NOT NULL,
    "deadline_at" timestamp with time zone NOT NULL,
    "revealed_at" timestamp with time zone
);

ALTER TABLE ONLY "public"."participant_question_progress" REPLICA IDENTITY FULL;


ALTER TABLE "public"."participant_question_progress" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."participant_scores" (
    "session_id" "uuid" NOT NULL,
    "participant_id" "uuid" NOT NULL,
    "total_score" integer DEFAULT 0 NOT NULL,
    "correct_count" integer DEFAULT 0 NOT NULL,
    "last_updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."participant_scores" REPLICA IDENTITY FULL;


ALTER TABLE "public"."participant_scores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."question_session_state" (
    "session_id" "uuid" NOT NULL,
    "question_id" "uuid" NOT NULL,
    "question_index" integer NOT NULL,
    "status" "public"."question_status" DEFAULT 'idle'::"public"."question_status" NOT NULL,
    "presenting_at" timestamp with time zone,
    "started_at" timestamp with time zone,
    "deadline_at" timestamp with time zone,
    "revealed_at" timestamp with time zone
);

ALTER TABLE ONLY "public"."question_session_state" REPLICA IDENTITY FULL;


ALTER TABLE "public"."question_session_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quizzes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "brand_id" "text" NOT NULL,
    "title" "text" NOT NULL,
    "default_game_mode" "public"."game_mode" NOT NULL,
    "join_fields" "jsonb" DEFAULT '["name", "phone", "unit"]'::"jsonb" NOT NULL,
    "custom_logo" "text",
    "custom_logo_label" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "archived_at" timestamp with time zone,
    "version" integer DEFAULT 0 NOT NULL,
    "custom_logo_active" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."quizzes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."session_participants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "unit" "text",
    "team" "text",
    "status" "public"."participant_status" DEFAULT 'joined'::"public"."participant_status" NOT NULL,
    "streak" integer DEFAULT 0 NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "display_name" "text" GENERATED ALWAYS AS (((("first_name" || ' '::"text") || "left"("last_name", 1)) || '.'::"text")) STORED NOT NULL
);


ALTER TABLE "public"."session_participants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "quiz_id" "uuid" NOT NULL,
    "host_id" "uuid",
    "pin" "text" NOT NULL,
    "status" "public"."session_status" DEFAULT 'draft'::"public"."session_status" NOT NULL,
    "game_mode" "public"."game_mode" NOT NULL,
    "auto_reveal" boolean DEFAULT false NOT NULL,
    "current_question_id" "uuid",
    "started_at" timestamp with time zone,
    "ended_at" timestamp with time zone,
    "host_last_seen_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "archived_at" timestamp with time zone,
    CONSTRAINT "sessions_pin_format_check" CHECK (("pin" ~ '^[0-9]{6}$'::"text"))
);


ALTER TABLE "public"."sessions" OWNER TO "postgres";


ALTER TABLE ONLY "public"."answers"
    ADD CONSTRAINT "answers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."brands"
    ADD CONSTRAINT "brands_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."brands"
    ADD CONSTRAINT "brands_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."participant_question_progress"
    ADD CONSTRAINT "participant_question_progress_session_participant_question_pk" PRIMARY KEY ("session_id", "participant_id", "question_id");



ALTER TABLE ONLY "public"."participant_scores"
    ADD CONSTRAINT "participant_scores_session_id_participant_id_pk" PRIMARY KEY ("session_id", "participant_id");



ALTER TABLE ONLY "public"."question_session_state"
    ADD CONSTRAINT "question_session_state_session_id_question_id_pk" PRIMARY KEY ("session_id", "question_id");



ALTER TABLE ONLY "public"."questions"
    ADD CONSTRAINT "questions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quizzes"
    ADD CONSTRAINT "quizzes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_participants"
    ADD CONSTRAINT "session_participants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "answers_session_question_participant_idx" ON "public"."answers" USING "btree" ("session_id", "question_id", "participant_id");



CREATE UNIQUE INDEX "questions_quiz_id_ordinal_idx" ON "public"."questions" USING "btree" ("quiz_id", "ordinal");



CREATE UNIQUE INDEX "session_participants_session_id_id_idx" ON "public"."session_participants" USING "btree" ("session_id", "id");



CREATE UNIQUE INDEX "session_participants_session_id_phone_idx" ON "public"."session_participants" USING "btree" ("session_id", "phone");



CREATE UNIQUE INDEX "sessions_pin_active_idx" ON "public"."sessions" USING "btree" ("pin") WHERE ("status" = ANY (ARRAY['scheduled'::"public"."session_status", 'live'::"public"."session_status"]));



CREATE INDEX "sessions_quiz_id_idx" ON "public"."sessions" USING "btree" ("quiz_id");



ALTER TABLE ONLY "public"."answers"
    ADD CONSTRAINT "answers_participant_id_session_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."session_participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."answers"
    ADD CONSTRAINT "answers_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."answers"
    ADD CONSTRAINT "answers_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."participant_question_progress"
    ADD CONSTRAINT "participant_question_progress_participant_id_session_participan" FOREIGN KEY ("participant_id") REFERENCES "public"."session_participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."participant_question_progress"
    ADD CONSTRAINT "participant_question_progress_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."participant_question_progress"
    ADD CONSTRAINT "participant_question_progress_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."participant_scores"
    ADD CONSTRAINT "participant_scores_participant_id_session_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."session_participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."participant_scores"
    ADD CONSTRAINT "participant_scores_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."question_session_state"
    ADD CONSTRAINT "question_session_state_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."question_session_state"
    ADD CONSTRAINT "question_session_state_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."questions"
    ADD CONSTRAINT "questions_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_participants"
    ADD CONSTRAINT "session_participants_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_current_question_id_questions_id_fk" FOREIGN KEY ("current_question_id") REFERENCES "public"."questions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE RESTRICT;



CREATE POLICY "admins delete brands" ON "public"."brands" FOR DELETE TO "authenticated" USING (((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text") = 'admin'::"text"));



CREATE POLICY "admins insert brands" ON "public"."brands" FOR INSERT TO "authenticated" WITH CHECK (((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text") = 'admin'::"text"));



CREATE POLICY "admins update brands" ON "public"."brands" FOR UPDATE TO "authenticated" USING (((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text") = 'admin'::"text")) WITH CHECK (((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text") = 'admin'::"text"));



ALTER TABLE "public"."answers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "authenticated users read brands" ON "public"."brands" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") IS NOT NULL));



ALTER TABLE "public"."brands" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "hosts read own sessions" ON "public"."sessions" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND ("host_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "hosts update own sessions" ON "public"."sessions" FOR UPDATE TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND ("host_id" = ( SELECT "auth"."uid"() AS "uid")))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND ("host_id" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."participant_question_progress" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."participant_scores" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "participants create own answers" ON "public"."answers" FOR INSERT TO "authenticated" WITH CHECK (("participant_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "participants create own session progress" ON "public"."participant_question_progress" FOR INSERT TO "authenticated" WITH CHECK ((("participant_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."session_participants"
  WHERE (("session_participants"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("session_participants"."session_id" = "participant_question_progress"."session_id"))))));



CREATE POLICY "participants read own answers" ON "public"."answers" FOR SELECT TO "authenticated" USING (("participant_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "participants read own row" ON "public"."session_participants" FOR SELECT TO "authenticated" USING (("id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "participants read own score" ON "public"."participant_scores" FOR SELECT TO "authenticated" USING (("participant_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "participants read own session progress" ON "public"."participant_question_progress" FOR SELECT TO "authenticated" USING ((("participant_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."session_participants"
  WHERE (("session_participants"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("session_participants"."session_id" = "participant_question_progress"."session_id"))))));



ALTER TABLE "public"."question_session_state" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."questions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "quiz owners create questions" ON "public"."questions" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."quizzes"
  WHERE (("quizzes"."id" = "questions"."quiz_id") AND ("quizzes"."owner_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "quiz owners create quizzes" ON "public"."quizzes" FOR INSERT TO "authenticated" WITH CHECK (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND ("owner_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "quiz owners read questions" ON "public"."questions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."quizzes"
  WHERE (("quizzes"."id" = "questions"."quiz_id") AND ("quizzes"."owner_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "quiz owners read quizzes" ON "public"."quizzes" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND ("owner_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "quiz owners update questions" ON "public"."questions" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."quizzes"
  WHERE (("quizzes"."id" = "questions"."quiz_id") AND ("quizzes"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."quizzes"
  WHERE (("quizzes"."id" = "questions"."quiz_id") AND ("quizzes"."owner_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "quiz owners update quizzes" ON "public"."quizzes" FOR UPDATE TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND ("owner_id" = ( SELECT "auth"."uid"() AS "uid")))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND ("owner_id" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."quizzes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "session members read leaderboard scores" ON "public"."participant_scores" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."session_participants"
  WHERE (("session_participants"."session_id" = "participant_scores"."session_id") AND ("session_participants"."id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "session members read question state" ON "public"."question_session_state" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."session_participants"
  WHERE (("session_participants"."session_id" = "question_session_state"."session_id") AND ("session_participants"."id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "session participants read session" ON "public"."sessions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."session_participants"
  WHERE (("session_participants"."session_id" = "sessions"."id") AND ("session_participants"."id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."session_participants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sessions" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."participant_question_progress";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."participant_scores";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."question_session_state";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";




























































































































































GRANT ALL ON TABLE "public"."questions" TO "anon";
GRANT ALL ON TABLE "public"."questions" TO "authenticated";
GRANT ALL ON TABLE "public"."questions" TO "service_role";



REVOKE ALL ON FUNCTION "public"."_score_correctness"("p_question" "public"."questions", "p_selected_ids" "text"[], "p_pin_lat" numeric, "p_pin_lng" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_score_correctness"("p_question" "public"."questions", "p_selected_ids" "text"[], "p_pin_lat" numeric, "p_pin_lng" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."rescore_session"("p_session_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rescore_session"("p_session_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."submit_answer"("p_session_id" "uuid", "p_participant_id" "uuid", "p_question_id" "uuid", "p_selected_ids" "text"[], "p_pin_lat" numeric, "p_pin_lng" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_answer"("p_session_id" "uuid", "p_participant_id" "uuid", "p_question_id" "uuid", "p_selected_ids" "text"[], "p_pin_lat" numeric, "p_pin_lng" numeric) TO "service_role";


















GRANT ALL ON TABLE "public"."answers" TO "anon";
GRANT ALL ON TABLE "public"."answers" TO "authenticated";
GRANT ALL ON TABLE "public"."answers" TO "service_role";



GRANT ALL ON TABLE "public"."brands" TO "anon";
GRANT ALL ON TABLE "public"."brands" TO "authenticated";
GRANT ALL ON TABLE "public"."brands" TO "service_role";



GRANT ALL ON TABLE "public"."participant_question_progress" TO "anon";
GRANT ALL ON TABLE "public"."participant_question_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."participant_question_progress" TO "service_role";



GRANT ALL ON TABLE "public"."participant_scores" TO "anon";
GRANT ALL ON TABLE "public"."participant_scores" TO "authenticated";
GRANT ALL ON TABLE "public"."participant_scores" TO "service_role";



GRANT ALL ON TABLE "public"."question_session_state" TO "anon";
GRANT ALL ON TABLE "public"."question_session_state" TO "authenticated";
GRANT ALL ON TABLE "public"."question_session_state" TO "service_role";



GRANT ALL ON TABLE "public"."quizzes" TO "anon";
GRANT ALL ON TABLE "public"."quizzes" TO "authenticated";
GRANT ALL ON TABLE "public"."quizzes" TO "service_role";



GRANT ALL ON TABLE "public"."session_participants" TO "anon";
GRANT ALL ON TABLE "public"."session_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."session_participants" TO "service_role";



GRANT ALL ON TABLE "public"."sessions" TO "anon";
GRANT ALL ON TABLE "public"."sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."sessions" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
































--
-- Dumped schema changes for auth and storage
--

CREATE POLICY "admins delete question-videos objects" ON "storage"."objects" FOR DELETE TO "authenticated" USING ((("bucket_id" = 'question-videos'::"text") AND ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text") = 'admin'::"text")));



CREATE POLICY "admins delete upload bucket objects" ON "storage"."objects" FOR DELETE TO "authenticated" USING ((("bucket_id" = ANY (ARRAY['brand-logos'::"text", 'question-images'::"text"])) AND ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text") = 'admin'::"text")));



CREATE POLICY "admins insert question-videos objects" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'question-videos'::"text") AND ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text") = 'admin'::"text")));



CREATE POLICY "admins insert upload bucket objects" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = ANY (ARRAY['brand-logos'::"text", 'question-images'::"text"])) AND ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text") = 'admin'::"text")));



CREATE POLICY "admins update question-videos objects" ON "storage"."objects" FOR UPDATE TO "authenticated" USING ((("bucket_id" = 'question-videos'::"text") AND ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text") = 'admin'::"text"))) WITH CHECK ((("bucket_id" = 'question-videos'::"text") AND ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text") = 'admin'::"text")));



CREATE POLICY "admins update upload bucket objects" ON "storage"."objects" FOR UPDATE TO "authenticated" USING ((("bucket_id" = ANY (ARRAY['brand-logos'::"text", 'question-images'::"text"])) AND ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text") = 'admin'::"text"))) WITH CHECK ((("bucket_id" = ANY (ARRAY['brand-logos'::"text", 'question-images'::"text"])) AND ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text") = 'admin'::"text")));



CREATE POLICY "public reads admin upload buckets" ON "storage"."objects" FOR SELECT USING (("bucket_id" = ANY (ARRAY['brand-logos'::"text", 'question-images'::"text"])));



CREATE POLICY "public reads question-videos bucket" ON "storage"."objects" FOR SELECT USING (("bucket_id" = 'question-videos'::"text"));



