-- B1: Add archived_at column to sessions for soft-archive support.
-- Mirrors the quizzes.archived_at pattern. NULL means active; non-NULL
-- means the admin has archived this game and it should be hidden from
-- the default list view.
--
-- PIN uniqueness: the partial unique index `sessions_pin_active_idx`
-- covers status IN ('scheduled','live'). When archiving a scheduled
-- session the route also transitions status to 'ended', so the index
-- ceases to cover that row — no PIN collision risk for "Run again".
--
-- Cascade: all child tables (session_participants, answers,
-- question_session_state, participant_question_progress,
-- participant_scores) already carry ON DELETE CASCADE on session_id,
-- so a hard-delete of the sessions row removes all children atomically.

ALTER TABLE public.sessions
  ADD COLUMN archived_at timestamptz NULL;
