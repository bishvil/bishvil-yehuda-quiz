-- Realtime: broadcast-from-database for the participant tick.
--
-- Replaces single-threaded `postgres_changes` fan-out with one private
-- broadcast channel per session: `session:<sessionId>:tick`. Postgres
-- triggers on the three tables that drive the tick call
-- realtime.broadcast_changes(...) into that topic.
--
-- This migration KEEPS the existing supabase_realtime publication and
-- REPLICA IDENTITY FULL on those tables in place: old browsers loaded
-- before this deploy continue to receive postgres_changes; new browsers
-- subscribe to broadcast. Duplicate refetches in the new client are
-- coalesced by an inFlightRef guard. A follow-up migration tears down
-- the publication after one deploy cycle.
--
-- Tables on the tick topic:
--   sessions                          (current_question_id, status, etc.)
--   question_session_state            (status: presenting/answering/locked/revealed)
--   participant_question_progress     (async-mode tick driver)
--
-- The `answers` table stays on postgres_changes for the host dashboard;
-- broadcasting it on the tick topic would wake every participant on
-- every answer, which is the opposite of what we want.

-- ---------------------------------------------------------------------------
-- Trigger functions (one per table because session_id lives in different
-- columns: sessions.id vs *.session_id).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.broadcast_sessions_tick()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, realtime, pg_temp
LANGUAGE plpgsql
AS $$
DECLARE
  topic text;
BEGIN
  topic := 'session:' || COALESCE(NEW.id, OLD.id)::text || ':tick';
  PERFORM realtime.broadcast_changes(
    topic,
    TG_OP,
    TG_OP,
    TG_TABLE_NAME,
    TG_TABLE_SCHEMA,
    NEW,
    OLD
  );
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.broadcast_session_child_tick()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, realtime, pg_temp
LANGUAGE plpgsql
AS $$
DECLARE
  topic text;
BEGIN
  topic := 'session:' || COALESCE(NEW.session_id, OLD.session_id)::text || ':tick';
  PERFORM realtime.broadcast_changes(
    topic,
    TG_OP,
    TG_OP,
    TG_TABLE_NAME,
    TG_TABLE_SCHEMA,
    NEW,
    OLD
  );
  RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- The sessions trigger is narrowed to the columns that drive the
-- participant tick. We exclude host_last_seen_at because the host
-- dashboard touches it every 5 s as a liveness heartbeat
-- (app/api/host/[pin]/live/route.ts:178-181) — broadcasting that to
-- every participant would create a heartbeat-driven refetch storm.
-- host_id, pin, quiz_id, game_mode, archived_at, created_at don't
-- affect a live participant either.
DROP TRIGGER IF EXISTS sessions_broadcast_tick ON public.sessions;
CREATE TRIGGER sessions_broadcast_tick
  AFTER INSERT OR DELETE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_sessions_tick();

DROP TRIGGER IF EXISTS sessions_broadcast_tick_update ON public.sessions;
CREATE TRIGGER sessions_broadcast_tick_update
  AFTER UPDATE OF
    current_question_id,
    status,
    started_at,
    ended_at,
    auto_reveal
  ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_sessions_tick();

DROP TRIGGER IF EXISTS qss_broadcast_tick ON public.question_session_state;
CREATE TRIGGER qss_broadcast_tick
  AFTER INSERT OR UPDATE OR DELETE ON public.question_session_state
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_session_child_tick();

-- participant_question_progress is async-mode only (ADR-0007 §1.2). One
-- participant's progress UPDATE wakes everyone on the session topic.
-- Tolerable noise at small async N; if async ever scales as wide as
-- sync, follow up with per-participant subtopics.
DROP TRIGGER IF EXISTS pqp_broadcast_tick ON public.participant_question_progress;
CREATE TRIGGER pqp_broadcast_tick
  AFTER INSERT OR UPDATE OR DELETE ON public.participant_question_progress
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_session_child_tick();

-- ---------------------------------------------------------------------------
-- RLS on realtime.messages — gate who can SUBSCRIBE to the tick topic.
--
-- Realtime checks SELECT on realtime.messages when a client subscribes to
-- a private channel. Two policies:
--   1) Participants whose JWT.app_metadata.session_id matches the topic.
--   2) Hosts/admins on a session they own (admins always pass).
--
-- Both are PERMISSIVE (default) so they're OR'd at evaluation. Do not add
-- a RESTRICTIVE policy here without re-deriving the union — RESTRICTIVE
-- ANDs with PERMISSIVE and would break participant access.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "participants subscribe to own session tick"
  ON realtime.messages;
CREATE POLICY "participants subscribe to own session tick"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    realtime.topic() = 'session:'
      || COALESCE(auth.jwt() -> 'app_metadata' ->> 'session_id', '')
      || ':tick'
  );

DROP POLICY IF EXISTS "hosts and admins subscribe to session tick"
  ON realtime.messages;
CREATE POLICY "hosts and admins subscribe to session tick"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('host', 'admin')
    AND realtime.topic() LIKE 'session:%:tick'
    AND EXISTS (
      SELECT 1
      FROM public.sessions s
      WHERE s.id::text = substring(realtime.topic() from 'session:([^:]+):')
        AND (
          (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
          OR s.host_id = auth.uid()
        )
    )
  );

-- realtime.messages already has RLS enabled on Supabase by default; the
-- policies above are additive. No ALTER TABLE needed here.
