"use client";

/**
 * Marker placement state machine — pure logic, no WebGL.
 *
 * Extracted so the participant and admin map components can share the
 * "click-to-place" / "drag-to-move" semantics, AND so unit tests can
 * exercise the state machine in jsdom without instantiating MapLibre
 * (ADR-0011 §9). `InteractiveMap` already calls `onMapClick(LatLng)` and
 * `Marker.onDragEnd(LatLng)`; this hook just owns the resulting state.
 */

import { useCallback, useState } from "react";

import type { LatLng } from "./InteractiveMap";

export interface MapMarkerState {
  /** Current placement, or null while no pin is set. */
  position: LatLng | null;
  /** Locks all transitions (post-submission, or when the question is revealed). */
  locked: boolean;
}

export interface MapMarkerActions {
  /** Place / move the pin. No-op when locked. */
  place: (next: LatLng) => void;
  /** Remove the pin. No-op when locked. */
  clear: () => void;
  /** Lock further changes (idempotent). */
  lock: () => void;
}

export type UseMapMarkerStateReturn = MapMarkerState & MapMarkerActions;

export interface UseMapMarkerStateOptions {
  /** Initial pin (e.g. an admin loading an existing target). */
  initialPosition?: LatLng | null;
  /** Initial lock state (e.g. an already-submitted answer). */
  initialLocked?: boolean;
  /** Optional side-effect for analytics or "save draft" callbacks. */
  onChange?: (next: LatLng | null) => void;
}

/**
 * Returns marker state plus three idempotent actions. The hook is
 * deliberately small — keep behaviour additions in the consuming
 * component, not here, so unit tests stay focused on the state machine.
 */
export function useMapMarkerState(
  options: UseMapMarkerStateOptions = {},
): UseMapMarkerStateReturn {
  const [position, setPosition] = useState<LatLng | null>(
    options.initialPosition ?? null,
  );
  const [locked, setLocked] = useState<boolean>(options.initialLocked ?? false);

  const place = useCallback(
    (next: LatLng) => {
      if (locked) return;
      setPosition(next);
      options.onChange?.(next);
    },
    [locked, options],
  );

  const clear = useCallback(() => {
    if (locked) return;
    setPosition(null);
    options.onChange?.(null);
  }, [locked, options]);

  const lock = useCallback(() => setLocked(true), []);

  return { position, locked, place, clear, lock };
}
