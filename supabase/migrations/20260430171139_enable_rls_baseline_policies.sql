alter table public.quizzes enable row level security;
alter table public.questions enable row level security;
alter table public.sessions enable row level security;
alter table public.session_participants enable row level security;
alter table public.question_session_state enable row level security;
alter table public.participant_question_progress enable row level security;
alter table public.answers enable row level security;
alter table public.participant_scores enable row level security;

create policy "quiz owners read quizzes"
  on public.quizzes
  for select
  to authenticated
  using ((select auth.uid()) is not null and owner_id = (select auth.uid()));

create policy "quiz owners create quizzes"
  on public.quizzes
  for insert
  to authenticated
  with check ((select auth.uid()) is not null and owner_id = (select auth.uid()));

create policy "quiz owners update quizzes"
  on public.quizzes
  for update
  to authenticated
  using ((select auth.uid()) is not null and owner_id = (select auth.uid()))
  with check ((select auth.uid()) is not null and owner_id = (select auth.uid()));

create policy "quiz owners read questions"
  on public.questions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.quizzes
      where quizzes.id = questions.quiz_id
        and quizzes.owner_id = (select auth.uid())
    )
  );

create policy "quiz owners create questions"
  on public.questions
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.quizzes
      where quizzes.id = questions.quiz_id
        and quizzes.owner_id = (select auth.uid())
    )
  );

create policy "quiz owners update questions"
  on public.questions
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.quizzes
      where quizzes.id = questions.quiz_id
        and quizzes.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.quizzes
      where quizzes.id = questions.quiz_id
        and quizzes.owner_id = (select auth.uid())
    )
  );

create policy "hosts read own sessions"
  on public.sessions
  for select
  to authenticated
  using ((select auth.uid()) is not null and host_id = (select auth.uid()));

create policy "session participants read session"
  on public.sessions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.session_participants
      where session_participants.session_id = sessions.id
        and session_participants.id = (select auth.uid())
    )
  );

create policy "hosts update own sessions"
  on public.sessions
  for update
  to authenticated
  using ((select auth.uid()) is not null and host_id = (select auth.uid()))
  with check ((select auth.uid()) is not null and host_id = (select auth.uid()));

create policy "participants read own row"
  on public.session_participants
  for select
  to authenticated
  using (id = (select auth.uid()));

create policy "session members read question state"
  on public.question_session_state
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.session_participants
      where session_participants.session_id = question_session_state.session_id
        and session_participants.id = (select auth.uid())
    )
  );

create policy "participants read own progress"
  on public.participant_question_progress
  for select
  to authenticated
  using (participant_id = (select auth.uid()));

create policy "participants create own progress"
  on public.participant_question_progress
  for insert
  to authenticated
  with check (participant_id = (select auth.uid()));

create policy "participants read own answers"
  on public.answers
  for select
  to authenticated
  using (participant_id = (select auth.uid()));

create policy "participants create own answers"
  on public.answers
  for insert
  to authenticated
  with check (participant_id = (select auth.uid()));

create policy "participants read own score"
  on public.participant_scores
  for select
  to authenticated
  using (participant_id = (select auth.uid()));

create policy "session members read leaderboard scores"
  on public.participant_scores
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.session_participants
      where session_participants.session_id = participant_scores.session_id
        and session_participants.id = (select auth.uid())
    )
  );

alter table public.question_session_state replica identity full;
alter table public.participant_question_progress replica identity full;
alter table public.participant_scores replica identity full;

alter publication supabase_realtime add table public.question_session_state;
alter publication supabase_realtime add table public.participant_question_progress;
alter publication supabase_realtime add table public.participant_scores;
