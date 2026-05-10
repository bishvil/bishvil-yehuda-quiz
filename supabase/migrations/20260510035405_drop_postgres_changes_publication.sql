-- Realtime cleanup: drop the three tables from the supabase_realtime
-- publication and undo REPLICA IDENTITY FULL. They were only there to
-- power postgres_changes — superseded by the broadcast triggers added
-- in 20260509200010_realtime_broadcast.sql. Project hasn't launched
-- yet so there are no in-flight clients on the old code path.

ALTER PUBLICATION supabase_realtime DROP TABLE public.participant_question_progress;
ALTER PUBLICATION supabase_realtime DROP TABLE public.question_session_state;
ALTER PUBLICATION supabase_realtime DROP TABLE public.participant_scores;

ALTER TABLE public.participant_question_progress REPLICA IDENTITY DEFAULT;
ALTER TABLE public.question_session_state REPLICA IDENTITY DEFAULT;
ALTER TABLE public.participant_scores REPLICA IDENTITY DEFAULT;
