"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { fetchHostLive, type HostLiveResponse } from "@/src/lib/host/api-client";
import { createBrowserSupabaseClient } from "@/src/lib/supabase/browser";
import { PARTICIPANT_POLL_INTERVAL_MS } from "@/src/lib/constants";

type FetchStatus = "idle" | "loading" | "ready" | "error";

export interface UseHostStateValue {
  state: HostLiveResponse | null;
  status: FetchStatus;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Realtime-first with polling as a safety net per ADR-0007 §5. Tick
 * events (`sessions`, `question_session_state`) arrive via the private
 * broadcast channel `session:<id>:tick` (see migration
 * 20260509200010_realtime_broadcast.sql). Hosts also still receive
 * `answers` updates via the legacy postgres_changes path because the
 * answers table isn't on the tick topic — the host fanout is tiny so
 * single-threaded postgres_changes is fine for it. The sessionId comes
 * from the first /live response, so the broadcast channel comes up
 * one poll behind the participants.
 */
export function useHostState(args: {
  pin: string;
  paused?: boolean;
  intervalMs?: number;
}): UseHostStateValue {
  const { pin, paused = false, intervalMs = PARTICIPANT_POLL_INTERVAL_MS } = args;

  const [state, setState] = useState<HostLiveResponse | null>(null);
  const [status, setStatus] = useState<FetchStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const inFlightRef = useRef<Promise<void> | null>(null);

  const refetch = useCallback(async () => {
    if (inFlightRef.current) {
      await inFlightRef.current;
      return;
    }

    const promise = (async () => {
      try {
        setStatus((prev) => (prev === "ready" ? prev : "loading"));
        const next = await fetchHostLive(pin);
        if (!next) {
          setError("Could not load host state.");
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

  useEffect(() => {
    if (paused) return;
    void refetch();
    const interval = setInterval(refetch, intervalMs);
    return () => clearInterval(interval);
  }, [refetch, paused, intervalMs]);

  // answers stays on postgres_changes — host fanout is small (1-few
  // hosts per session) so the single-threaded path is fine, and the
  // alternative would wake every participant on every answer.
  useEffect(() => {
    if (paused) return;
    const supabase = createBrowserSupabaseClient();

    const channel = supabase
      .channel(`host-answers-${pin}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "answers",
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

  // Tick events (sessions / question_session_state) arrive via the
  // private broadcast channel scoped to this session.
  const sessionId = state?.sessionId ?? null;
  useEffect(() => {
    if (paused || !sessionId) return;
    const supabase = createBrowserSupabaseClient();

    const channel = supabase
      .channel(`session:${sessionId}:tick`, { config: { private: true } })
      .on("broadcast", { event: "INSERT" }, () => {
        void refetch();
      })
      .on("broadcast", { event: "UPDATE" }, () => {
        void refetch();
      })
      .on("broadcast", { event: "DELETE" }, () => {
        void refetch();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [sessionId, paused, refetch]);

  return { state, status, error, refetch };
}
