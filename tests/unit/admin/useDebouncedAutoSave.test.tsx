import { act, render } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useDebouncedAutoSave } from "@/src/lib/hooks/useDebouncedAutoSave";
import type { AutoSaveStatus } from "@/src/lib/admin/auto-save";

type Saver = (v: { title: string }) => Promise<void>;

interface HostProps {
  initial: { title: string };
  save: Saver;
  setRef: (api: {
    setValue: (next: { title: string }) => void;
    flush: () => Promise<void>;
    getStatus: () => AutoSaveStatus;
  }) => void;
}

function HostComponent({ initial, save, setRef }: HostProps) {
  const [value, setValue] = useState(initial);
  const { status, flush } = useDebouncedAutoSave({ value, save });

  setRef({
    setValue,
    flush,
    getStatus: () => status,
  });

  return null;
}

describe("useDebouncedAutoSave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces by 800ms and calls save once", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    let api!: {
      setValue: (next: { title: string }) => void;
      flush: () => Promise<void>;
      getStatus: () => AutoSaveStatus;
    };

    render(
      <HostComponent
        initial={{ title: "" }}
        save={save}
        setRef={(next) => {
          api = next;
        }}
      />,
    );

    expect(api.getStatus()).toBe("idle");
    expect(save).not.toHaveBeenCalled();

    act(() => {
      api.setValue({ title: "h" });
    });
    act(() => {
      api.setValue({ title: "he" });
    });
    act(() => {
      api.setValue({ title: "hel" });
    });

    // Debounce window not yet elapsed.
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(save).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(400);
      await Promise.resolve();
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ title: "hel" });
  });

  it("transitions saved → idle after the dwell window", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    let api!: {
      setValue: (next: { title: string }) => void;
      flush: () => Promise<void>;
      getStatus: () => AutoSaveStatus;
    };

    render(
      <HostComponent
        initial={{ title: "" }}
        save={save}
        setRef={(next) => {
          api = next;
        }}
      />,
    );

    act(() => {
      api.setValue({ title: "x" });
    });

    await act(async () => {
      vi.advanceTimersByTime(900);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(api.getStatus()).toBe("saved");

    await act(async () => {
      vi.advanceTimersByTime(2_000);
      await Promise.resolve();
    });

    expect(api.getStatus()).toBe("idle");
  });

  it("captures errors and exposes the error status", async () => {
    const save = vi.fn().mockRejectedValue(new Error("boom"));
    let api!: {
      setValue: (next: { title: string }) => void;
      flush: () => Promise<void>;
      getStatus: () => AutoSaveStatus;
    };

    render(
      <HostComponent
        initial={{ title: "" }}
        save={save}
        setRef={(next) => {
          api = next;
        }}
      />,
    );

    act(() => {
      api.setValue({ title: "y" });
    });

    await act(async () => {
      vi.advanceTimersByTime(900);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(api.getStatus()).toBe("error");
  });

  it("flush() runs the save immediately, bypassing the debounce", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    let api!: {
      setValue: (next: { title: string }) => void;
      flush: () => Promise<void>;
      getStatus: () => AutoSaveStatus;
    };

    render(
      <HostComponent
        initial={{ title: "" }}
        save={save}
        setRef={(next) => {
          api = next;
        }}
      />,
    );

    act(() => {
      api.setValue({ title: "z" });
    });

    await act(async () => {
      await api.flush();
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ title: "z" });
  });

  it("does not save the initial value on first mount", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    render(
      <HostComponent
        initial={{ title: "preloaded" }}
        save={save}
        setRef={() => {}}
      />,
    );

    await act(async () => {
      vi.advanceTimersByTime(2_000);
      await Promise.resolve();
    });

    expect(save).not.toHaveBeenCalled();
  });
});
