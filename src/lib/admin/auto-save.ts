/**
 * Pure helpers for the auto-save indicator state machine.
 *
 *   idle  →  saving  →  saved  →  idle (after dwell)
 *               ↘  error
 *
 * The hook (`useDebouncedAutoSave`) layers a debounce window on top of
 * these states; everything here is testable without React.
 */

export type AutoSaveStatus = "idle" | "saving" | "saved" | "error";

export interface AutoSaveCopy {
  label: string;
  ariaLabel: string;
}

const COPY: Record<AutoSaveStatus, AutoSaveCopy> = {
  idle: {
    label: "השינויים יישמרו אוטומטית",
    ariaLabel: "Pending auto-save",
  },
  saving: {
    label: "שומר…",
    ariaLabel: "Saving",
  },
  saved: {
    label: "נשמר אוטומטית",
    ariaLabel: "Saved",
  },
  error: {
    label: "השמירה נכשלה — נסה שוב",
    ariaLabel: "Save failed",
  },
};

export function autoSaveCopy(status: AutoSaveStatus): AutoSaveCopy {
  return COPY[status];
}

export const AUTO_SAVE_DEBOUNCE_MS = 800;
export const AUTO_SAVE_SAVED_DWELL_MS = 1_500;

/**
 * Picks the next status given a fresh request to commit edits. The mapping
 * deliberately keeps things conservative — we never go straight from
 * `error` to `saved` without observing a fresh `saving` tick first.
 */
export function nextStatusOnCommit(current: AutoSaveStatus): AutoSaveStatus {
  if (current === "saving") return "saving";
  return "saving";
}
