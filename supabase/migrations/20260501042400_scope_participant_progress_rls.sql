drop policy if exists "participants read own progress"
  on public.participant_question_progress;

drop policy if exists "participants create own progress"
  on public.participant_question_progress;

create policy "participants read own session progress"
  on public.participant_question_progress
  for select
  to authenticated
  using (
    participant_id = (select auth.uid())
    and exists (
      select 1
      from public.session_participants
      where session_participants.id = (select auth.uid())
        and session_participants.session_id = participant_question_progress.session_id
    )
  );

create policy "participants create own session progress"
  on public.participant_question_progress
  for insert
  to authenticated
  with check (
    participant_id = (select auth.uid())
    and exists (
      select 1
      from public.session_participants
      where session_participants.id = (select auth.uid())
        and session_participants.session_id = participant_question_progress.session_id
    )
  );
