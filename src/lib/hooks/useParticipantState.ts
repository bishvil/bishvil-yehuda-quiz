"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { fetchParticipantState } from "@/src/lib/participant/api-client";
import type { ParticipantStateResponse } from "@/src/lib/sessions/participant-payload";
import { createBrowserSupabaseClient } from "@/src/lib/supabase/browser";
import { PARTICIPANT_POLL_INTERVAL_MS } from "@/src/lib/constants";

type FetchStatus = "idle" | "loading" | "ready" | "error" | "not_found";

export interface UseParticipantStateValue {
  state: ParticipantStateResponse | null;
  status: FetchStatus;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Realtime-first with polling as a safety net per ADR-0007 §5. We
 * subscribe to a single private broadcast channel `session:<id>:tick`
 * fed by Postgres triggers (see migration 20260509200010_realtime_broadcast.sql)
 * and poll periodically as a backup. The sessionId for the topic comes
 * from the JWT (`app_metadata.session_id` set at join), so the channel
 * can come up before the first poll completes.
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
        const result = await fetchParticipantState(pin);
        if (result.kind === "not_found") {
          setError(null);
          setStatus("not_found");
          return;
        }
        if (result.kind === "error") {
          setError(result.message);
          setStatus("error");
          return;
        }
        setState(result.state);
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

  // Realtime subscription — one private broadcast channel per session.
  // Best-effort: if the channel can't subscribe (RLS, network, JWT not
  // yet propagated) the polling effect above keeps the UI live.
  useEffect(() => {
    if (paused) return;
    let cancelled = false;
    const supabase = createBrowserSupabaseClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    void (async () => {
      const { data } = await supabase.auth.getUser();
      const sessionId =
        (data.user?.app_metadata as { session_id?: string } | undefined)
          ?.session_id ?? null;
      if (cancelled || !sessionId) return;

      channel = supabase
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
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [paused, refetch]);

  return { state, status, error, refetch };
}
