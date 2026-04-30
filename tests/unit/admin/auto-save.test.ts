import { describe, expect, it } from "vitest";

import {
  AUTO_SAVE_DEBOUNCE_MS,
  AUTO_SAVE_SAVED_DWELL_MS,
  autoSaveCopy,
} from "@/src/lib/admin/auto-save";

describe("auto-save copy", () => {
  it("returns Hebrew label for the saving state", () => {
    expect(autoSaveCopy("saving").label).toBe("שומר…");
  });

  it("returns the saved label that the indicator pill shows on success", () => {
    expect(autoSaveCopy("saved").label).toBe("נשמר אוטומטית");
  });

  it("surfaces a clear error message for the failure state", () => {
    expect(autoSaveCopy("error").label).toContain("נכשלה");
  });

  it("idle copy reassures the user changes are tracked", () => {
    expect(autoSaveCopy("idle").label).toContain("יישמרו");
  });

  it("exports stable timing constants used by the hook + tests", () => {
    expect(AUTO_SAVE_DEBOUNCE_MS).toBe(800);
    expect(AUTO_SAVE_SAVED_DWELL_MS).toBeGreaterThan(AUTO_SAVE_DEBOUNCE_MS);
  });
});
