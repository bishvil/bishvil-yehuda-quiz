import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useMapMarkerState } from "@/src/components/map/useMapMarkerState";
import {
  TOLERANCE_KM_MAX,
  TOLERANCE_KM_MIN,
  kmToSlider,
  sliderToKm,
} from "@/src/components/admin/MapQuestionEditor";

describe("useMapMarkerState (ADR-0011 §10 hook)", () => {
  it("starts with no pin and unlocked by default", () => {
    const { result } = renderHook(() => useMapMarkerState());
    expect(result.current.position).toBeNull();
    expect(result.current.locked).toBe(false);
  });

  it("seeds from `initialPosition` and `initialLocked`", () => {
    const { result } = renderHook(() =>
      useMapMarkerState({
        initialPosition: { lat: 31.5, lng: 34.9 },
        initialLocked: true,
      }),
    );
    expect(result.current.position).toEqual({ lat: 31.5, lng: 34.9 });
    expect(result.current.locked).toBe(true);
  });

  it("places a pin and emits onChange", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useMapMarkerState({ onChange }));
    act(() => result.current.place({ lat: 32.0853, lng: 34.7818 }));
    expect(result.current.position).toEqual({ lat: 32.0853, lng: 34.7818 });
    expect(onChange).toHaveBeenCalledWith({ lat: 32.0853, lng: 34.7818 });
  });

  it("moves the pin on subsequent place calls", () => {
    const { result } = renderHook(() => useMapMarkerState());
    act(() => result.current.place({ lat: 31.5, lng: 34.9 }));
    act(() => result.current.place({ lat: 32.0853, lng: 34.7818 }));
    expect(result.current.position).toEqual({ lat: 32.0853, lng: 34.7818 });
  });

  it("clear() resets state when unlocked", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useMapMarkerState({ onChange }));
    act(() => result.current.place({ lat: 31.5, lng: 34.9 }));
    act(() => result.current.clear());
    expect(result.current.position).toBeNull();
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("ignores place() / clear() once locked", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useMapMarkerState({ onChange }));
    act(() => result.current.place({ lat: 31.5, lng: 34.9 }));
    act(() => result.current.lock());
    expect(result.current.locked).toBe(true);
    act(() => result.current.place({ lat: 32.0853, lng: 34.7818 }));
    act(() => result.current.clear());
    expect(result.current.position).toEqual({ lat: 31.5, lng: 34.9 });
    // onChange called once for the initial place; lock/place/clear are no-ops
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("lock() is idempotent", () => {
    const { result } = renderHook(() => useMapMarkerState());
    act(() => result.current.lock());
    act(() => result.current.lock());
    expect(result.current.locked).toBe(true);
  });
});

describe("tolerance slider helpers (ADR-0011 §10 admin editor)", () => {
  it("sliderToKm at 0 returns the minimum", () => {
    expect(sliderToKm(0)).toBeCloseTo(TOLERANCE_KM_MIN, 5);
  });

  it("sliderToKm at 1000 returns the maximum", () => {
    expect(sliderToKm(1000)).toBeCloseTo(TOLERANCE_KM_MAX, 5);
  });

  it("sliderToKm at 500 sits at the geometric mean of MIN..MAX", () => {
    const mean = Math.sqrt(TOLERANCE_KM_MIN * TOLERANCE_KM_MAX);
    expect(sliderToKm(500)).toBeCloseTo(mean, 3);
  });

  it("kmToSlider is the inverse of sliderToKm at the endpoints", () => {
    expect(kmToSlider(TOLERANCE_KM_MIN)).toBe(0);
    expect(kmToSlider(TOLERANCE_KM_MAX)).toBe(1000);
  });

  it("kmToSlider clamps inputs outside the range", () => {
    expect(kmToSlider(0.0001)).toBe(0);
    expect(kmToSlider(1_000_000)).toBe(1000);
  });

  it("round-trips a typical 5 km tolerance with reasonable precision", () => {
    const slider = kmToSlider(5);
    const km = sliderToKm(slider);
    // The slider quantizes to 1001 steps; 5 km can drift by ~1.5%.
    expect(km).toBeCloseTo(5, 0);
  });
});
