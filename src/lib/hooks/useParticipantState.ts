"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { fetchParticipantState } from "@/src/lib/participant/api-client";
import type { ParticipantStateResponse } from "@/src/lib/sessions/participant-payload";
import { createBrowserSupabaseClient } from "@/src/lib/supabase/browser";
import { PARTICIPANT_POLL_INTERVAL_MS } from "@/src/lib/constants";

type FetchStatus = "idle" | "loading" | "ready" | "error";

export interface UseParticipantStateValue {
  state: ParticipantStateResponse | null;
  status: FetchStatus;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Polling-first realtime fallback per ADR-0005 §5. We always poll every
 * 5s and additionally try to wake the poll on Supabase Realtime broadcasts
 * for the relevant tables. If the realtime channel never connects (RLS
 * misconfiguration, network quirks), polling alone keeps the UI live.
 */
export function useParticipantState(args: {
  pin: string;
  /** Hard-skip polling — used when the screen is in a terminal state. */
  paused?: boolean;
  /** Limit polling rate per call site — defaults to 5s (PARTICIPANT_POLL_INTERVAL_MS). */
  intervalMs?: number;
}): UseParticipantStateValue {
  const { pin, paused = false, intervalMs = PARTICIPANT_POLL_INTERVAL_MS } = args;

  const [state, setState] = useState<ParticipantStateResponse | null>(null);
  const [status, setStatus] = useState<FetchStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  // Ref to coalesce concurrent fetches — realtime triggers + interval can
  // fire in the same tick; we don't want double network requests.
  const inFlightRef = useRef<Promise<void> | null>(null);

  const refetch = useCallback(async () => {
    if (inFlightRef.current) {
      await inFlightRef.current;
      return;
    }

    const promise = (async () => {
      try {
        setStatus((prev) => (prev === "ready" ? prev : "loading"));
        const next = await fetchParticipantState(pin);
        if (!next) {
          setError("Could not load session state.");
          setStatus("error");
          return;
        }
        setState(next);
        setError(null);
        setStatus("ready");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unexpected error");
        setStatus("error");
      } finally {
        inFlightRef.current = null;
      }
    })();

    inFlightRef.current = promise;
    await promise;
  }, [pin]);

  // Initial fetch + polling.
  useEffect(() => {
    if (paused) return;
    void refetch();
    const interval = setInterval(refetch, intervalMs);
    return () => clearInterval(interval);
  }, [refetch, paused, intervalMs]);

  // Realtime subscription. Best-effort — silently degrades to polling if
  // the channel can't subscribe (RLS, network, etc.). The participant
  // state route is the source of truth; realtime simply pokes us to
  // refetch sooner than the next poll tick.
  useEffect(() => {
    if (paused) return;
    const supabase = createBrowserSupabaseClient();

    const channel = supabase
      .channel(`participant-${pin}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "question_session_state",
        },
        () => {
          void refetch();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "participant_question_progress",
        },
        () => {
          void refetch();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sessions",
        },
        () => {
          void refetch();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [pin, paused, refetch]);

  return { state, status, error, refetch };
}
