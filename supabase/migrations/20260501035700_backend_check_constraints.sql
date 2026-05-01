alter table public.quizzes
  add constraint quizzes_brand_id_check
  check (brand_id in ('default', 'yehuda', 'haari', 'tzafon', 'etzion'))
  not valid;

alter table public.sessions
  add constraint sessions_pin_format_check
  check (pin ~ '^[0-9]{6}$')
  not valid;

alter table public.questions
  add constraint questions_time_seconds_positive_check
  check (time_seconds > 0)
  not valid;

alter table public.questions
  add constraint questions_points_nonnegative_check
  check (points >= 0)
  not valid;

alter table public.questions
  add constraint questions_map_tolerance_positive_check
  check (type <> 'map' or tolerance > 0)
  not valid;

alter table public.quizzes validate constraint quizzes_brand_id_check;
alter table public.sessions validate constraint sessions_pin_format_check;
alter table public.questions validate constraint questions_time_seconds_positive_check;
alter table public.questions validate constraint questions_points_nonnegative_check;
alter table public.questions validate constraint questions_map_tolerance_positive_check;
