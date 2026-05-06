-- ADR-0013 — quizzes become immutable once any session exists.
-- Editing happens via duplicate, so the rescore path (force-edit + RPC) is
-- removed wholesale. Drop the RPC and any grants referring to it.
DROP FUNCTION IF EXISTS public.rescore_session(uuid);
