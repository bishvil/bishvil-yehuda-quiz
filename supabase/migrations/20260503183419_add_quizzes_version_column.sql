-- Add a monotonically-incrementing version counter to quizzes.
-- Bumped on every successful metadata PUT (updateAdminQuiz). Clients send
-- X-Expected-Version with the last-known value; the server rejects stale
-- writes (409 Conflict) to prevent a second browser tab from silently
-- overwriting concurrent metadata edits.
--
-- Scope note: this guards quiz *metadata* writes only. Question-level
-- concurrent-edit protection would require a version on `questions` or a
-- per-quiz question-version counter bumped by question mutations.

ALTER TABLE quizzes
  ADD COLUMN version integer NOT NULL DEFAULT 0;
