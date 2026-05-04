-- Shared scoring primitives for ADR-0006.
--
-- Extracted so `submit_answer` and `rescore_session` cannot drift. The
-- helper takes a question row + the answer's submission inputs and
-- returns the type-aware (is_correct, correctness_ratio, distance_km)
-- triple. The caller computes time_bonus and final score from its own
-- timing context.
--
-- Note: SQL does not support overloading by row type, so we depend on
-- the canonical `public.questions` composite. Any column added to
-- `public.questions` is automatically visible inside the function.

create or replace function public._score_correctness(
  p_question public.questions,
  p_selected_ids text[],
  p_pin_lat numeric,
  p_pin_lng numeric
)
returns table (
  is_correct boolean,
  correctness_ratio numeric,
  distance_km numeric
)
language plpgsql
immutable
as $$
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

revoke all on function public._score_correctness(public.questions, text[], numeric, numeric) from public;
revoke all on function public._score_correctness(public.questions, text[], numeric, numeric) from anon;
revoke all on function public._score_correctness(public.questions, text[], numeric, numeric) from authenticated;
grant execute on function public._score_correctness(public.questions, text[], numeric, numeric) to service_role;
