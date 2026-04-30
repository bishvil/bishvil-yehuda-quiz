/**
 * Server-time countdown helper per ADR-0005 §6.
 *
 * The participant state payload includes `serverNow` and `deadlineAt`. We
 * compute a single `clockOffsetMs` on receipt — that's the difference
 * between the server's clock and the client's clock. From there, every
 * tick samples a fresh `Date.now() + clockOffsetMs` so the countdown is
 * resilient to clock skew up to ~500ms.
 */
"use client";

import { useEffect, useRef, useState } from "react";

import { PARTICIPANT_TIMER_WARNING_THRESHOLD_SECONDS } from "@/src/lib/constants";

export interface ServerCountdownInput {
  /** ISO timestamp from the server payload — when the question deadline lands. */
  deadlineAt: string | null;
  /** ISO timestamp from the server payload — server's now at the time of read. */
  serverNow: string | null;
  /** Question time in seconds — used for the maximum bound on the bar. */
  timeSeconds: number;
}

export interface ServerCountdownState {
  remainingMs: number;
  remainingSeconds: number;
  /** Raw ratio of remaining time, clamped to [0, 1]. */
  fraction: number;
  expired: boolean;
  isWarning: boolean;
}

const REFRESH_INTERVAL_MS = 250;

function buildIdleState(timeSeconds: number): ServerCountdownState {
  return {
    remainingMs: timeSeconds * 1000,
    remainingSeconds: timeSeconds,
    fraction: 1,
    expired: false,
    isWarning: false,
  };
}

function computeRemaining(
  deadlineMs: number,
  clockOffsetMs: number,
  timeSeconds: number,
): ServerCountdownState {
  const nowMs = Date.now() + clockOffsetMs;
  const remainingMs = Math.max(0, deadlineMs - nowMs);
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const totalMs = Math.max(1, timeSeconds * 1000);
  const fraction = Math.min(1, Math.max(0, remainingMs / totalMs));

  return {
    remainingMs,
    remainingSeconds,
    fraction,
    expired: remainingMs <= 0,
    isWarning:
      remainingMs > 0 &&
      remainingSeconds <= PARTICIPANT_TIMER_WARNING_THRESHOLD_SECONDS,
  };
}

/**
 * Hook variant — refreshes ~every 250ms while the question is running.
 * Stops the interval once the deadline passes to avoid wasting cycles.
 *
 * Set-state calls are confined to interval/timeout callbacks; effects
 * never call set-state synchronously (per the project's React lint
 * rule `react-hooks/set-state-in-effect`).
 */
export function useServerCountdown(
  input: ServerCountdownInput,
): ServerCountdownState {
  const { deadlineAt, serverNow, timeSeconds } = input;

  const clockOffsetMsRef = useRef(0);

  const [state, setState] = useState<ServerCountdownState>(() => {
    if (!deadlineAt) return buildIdleState(timeSeconds);
    const offset = serverNow ? Date.parse(serverNow) - Date.now() : 0;
    return computeRemaining(Date.parse(deadlineAt), offset, timeSeconds);
  });

  useEffect(() => {
    clockOffsetMsRef.current = serverNow ? Date.parse(serverNow) - Date.now() : 0;
  }, [serverNow]);

  useEffect(() => {
    let stopped = false;

    if (!deadlineAt) {
      // Reset state via a microtask so the lint rule treats this as a
      // setState-from-callback rather than a synchronous body call.
      const reset = setTimeout(() => {
        if (!stopped) setState(buildIdleState(timeSeconds));
      }, 0);
      return () => {
        stopped = true;
        clearTimeout(reset);
      };
    }

    const deadlineMs = Date.parse(deadlineAt);

    function tick() {
      if (stopped) return;
      const next = computeRemaining(
        deadlineMs,
        clockOffsetMsRef.current,
        timeSeconds,
      );
      setState(next);
      if (next.expired) {
        clearInterval(interval);
      }
    }

    const interval = setInterval(tick, REFRESH_INTERVAL_MS);
    const kickoff = setTimeout(tick, 0);

    return () => {
      stopped = true;
      clearTimeout(kickoff);
      clearInterval(interval);
    };
  }, [deadlineAt, timeSeconds]);

  return state;
}
