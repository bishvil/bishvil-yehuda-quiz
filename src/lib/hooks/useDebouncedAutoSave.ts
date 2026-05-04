"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  AUTO_SAVE_DEBOUNCE_MS,
  AUTO_SAVE_SAVED_DWELL_MS,
  type AutoSaveStatus,
} from "@/src/lib/admin/auto-save";

export interface UseDebouncedAutoSaveArgs<T> {
  /**
   * The current value to be persisted. The hook re-runs the save when this
   * deep-changes (compared via the supplied serializer). The most common
   * choice is `JSON.stringify` — supplied by default if `serialize` is
   * omitted.
   */
  value: T;
  save: (value: T) => Promise<void>;
  enabled?: boolean;
  debounceMs?: number;
  savedDwellMs?: number;
  serialize?: (value: T) => string;
}

export interface UseDebouncedAutoSaveValue {
  status: AutoSaveStatus;
  /** True once the value has been edited at least once in this hook lifetime. */
  dirty: boolean;
  /** Force-flush any pending debounced save (useful before navigation). */
  flush: () => Promise<void>;
  errorMessage: string | null;
}

const DEFAULT_SERIALIZE = <T>(value: T): string => JSON.stringify(value);

/**
 * Generic debounced auto-save with an `idle | saving | saved | error`
 * status indicator. Wraps a stable serializer (`JSON.stringify` by default)
 * so consumers can pass plain objects without memoizing them.
 *
 * The save runs only when the serialized value actually changes. The first
 * mount is skipped — we don't want to PUT the freshly-loaded value on
 * page open.
 */
export function useDebouncedAutoSave<T>(
  args: UseDebouncedAutoSaveArgs<T>,
): UseDebouncedAutoSaveValue {
  const {
    value,
    save,
    enabled = true,
    debounceMs = AUTO_SAVE_DEBOUNCE_MS,
    savedDwellMs = AUTO_SAVE_SAVED_DWELL_MS,
    serialize = DEFAULT_SERIALIZE,
  } = args;

  const [status, setStatus] = useState<AutoSaveStatus>("idle");
  const [dirty, setDirty] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const valueRef = useRef(value);
  const saveRef = useRef(save);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dwellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSerializedRef = useRef<string>(serialize(value));
  const inflightRef = useRef<Promise<void> | null>(null);
  const mountedRef = useRef(false);

  // Keep refs current without re-binding effect lifecycle.
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const performSave = useCallback(async () => {
    const snapshotSerialized = serialize(valueRef.current);
    if (snapshotSerialized === lastSavedSerializedRef.current) {
      return;
    }

    setStatus("saving");
    setErrorMessage(null);

    const work = (async () => {
      try {
        await saveRef.current(valueRef.current);
        lastSavedSerializedRef.current = snapshotSerialized;
        setStatus("saved");

        if (dwellTimerRef.current) clearTimeout(dwellTimerRef.current);
        dwellTimerRef.current = setTimeout(() => {
          // Settle back to idle after the user has had time to read.
          setStatus((prev) => (prev === "saved" ? "idle" : prev));
        }, savedDwellMs);
      } catch (caught) {
        setStatus("error");
        setErrorMessage(
          caught instanceof Error ? caught.message : "השמירה נכשלה",
        );
        // Re-throw so that callers who await flush() can detect save failures.
        throw caught;
      } finally {
        inflightRef.current = null;
      }
    })();

    inflightRef.current = work;
    await work;
  }, [serialize, savedDwellMs]);

  const flush = useCallback(async () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (inflightRef.current) {
      // Swallow in-flight rejections so performSave() always runs and decides
      // whether the snapshot needs another attempt.
      await inflightRef.current.catch(() => {});
    }
    await performSave();
  }, [performSave]);

  // Schedule a debounced save whenever the serialized value changes.
  useEffect(() => {
    if (!enabled) return;

    const serialized = serialize(value);
    if (!mountedRef.current) {
      mountedRef.current = true;
      lastSavedSerializedRef.current = serialized;
      return;
    }

    if (serialized === lastSavedSerializedRef.current) {
      return;
    }

    setDirty(true);

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      performSave().catch(() => {
        // Error is reflected in state (status="error"); caller can flush() to rethrow.
      });
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- value compared via serialize
  }, [serialize(value), enabled, debounceMs, performSave]);

  // On unmount, clear timers — we don't auto-flush here because the most
  // common case (route change) means another save already happened or the
  // user wants to discard.
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (dwellTimerRef.current) clearTimeout(dwellTimerRef.current);
    };
  }, []);

  return { status, dirty, flush, errorMessage };
}
