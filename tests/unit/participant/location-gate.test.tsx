import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocationGate } from "@/src/components/participant/LocationGate";

function setup() {
  let success: PositionCallback | undefined;
  let failure: PositionErrorCallback | null | undefined;
  const locate = vi.fn(
    (ok: PositionCallback, error?: PositionErrorCallback | null) => {
      success = ok;
      failure = error;
    },
  );
  vi.stubGlobal("navigator", { geolocation: { getCurrentPosition: locate } });
  const onUnlock = vi.fn(async () => {});
  render(
    <LocationGate
      pin="654321"
      questionId="q1"
      gate={{ lat: 31.5, lng: 34.9, radiusM: 100 }}
      onUnlock={onUnlock}
      quizTitle="טיול בשביל יהודה"
      index={2}
      total={5}
    />,
  );
  return { locate, onUnlock, success: () => success!, failure: () => failure! };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GPS station recovery", () => {
  it("keeps journey context and checks only on request, unlocking only after server approval", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      json: async () => ({ error: "outside_radius" }),
    } as Response);
    const f = setup();
    expect(screen.getByText("טיול בשביל יהודה")).toBeInTheDocument();
    expect(screen.getByText("תחנה 2 מתוך 5")).toBeInTheDocument();
    expect(f.locate).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "בדיקת מיקום ופתיחת התחנה" }),
    );
    expect(f.locate).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
    await act(async () =>
      f.success()({
        coords: { latitude: 31.5, longitude: 34.9, accuracy: 7.2 },
        timestamp: Date.now(),
      } as GeolocationPosition),
    );
    expect(screen.getByText("עד 8 מטרים")).toBeInTheDocument();
    expect(f.onUnlock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "unlocked" }),
    } as Response);
    fireEvent.click(
      screen.getByRole("button", { name: "בדיקת מיקום ופתיחת התחנה" }),
    );
    await act(async () =>
      f.success()({
        coords: { latitude: 31.5, longitude: 34.9, accuracy: 5 },
        timestamp: Date.now(),
      } as GeolocationPosition),
    );
    await waitFor(() => expect(f.onUnlock).toHaveBeenCalledTimes(1));
  });

  it("explains permission recovery and gives the operator the actual PIN and station", async () => {
    const f = setup();
    fireEvent.click(
      screen.getByRole("button", { name: "בדיקת מיקום ופתיחת התחנה" }),
    );
    act(() =>
      f.failure()({ code: 1, message: "Denied" } as GeolocationPositionError),
    );
    expect(screen.getByRole("status")).toHaveTextContent("הגישה למיקום חסומה");
    expect(
      screen.getByText("איך מאפשרים גישה למיקום?").closest("details"),
    ).toHaveAttribute("open");
    expect(screen.getByText("ב־iPhone:")).toBeInTheDocument();
    expect(screen.getByText("ב־Android:")).toBeInTheDocument();
    expect(screen.getByText("654321")).toBeInTheDocument();
    expect(screen.getByText(/ואת מספר התחנה 2/)).toBeInTheDocument();
    expect(f.onUnlock).not.toHaveBeenCalled();
  });
});
