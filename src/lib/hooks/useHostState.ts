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
 * Polling-first realtime fallback per ADR-0005 §5 — same shape as the
 * participant hook. We poll /api/host/[pin]/live every 5s and additionally
 * subscribe to Supabase Realtime broadcasts on the tables the host cares
 * about (`answers`, `question_session_state`, `sessions`). If the realtime
 * channel never connects, polling alone keeps the UI live.
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

  useEffect(() => {
    if (paused) return;
    const supabase = createBrowserSupabaseClient();

    const channel = supabase
      .channel(`host-${pin}`)
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
