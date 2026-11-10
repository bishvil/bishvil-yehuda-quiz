import React, { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocationGateEditor } from "@/src/components/admin/LocationGateEditor";
import {
  makeBlankQuestion,
  validateQuestions,
  type EditableQuestion,
} from "@/src/lib/admin/quiz-editor";

vi.mock("next/dynamic", () => ({ default: () => () => null }));

function Editor() {
  const [question, setQuestion] = useState<EditableQuestion>({
    ...makeBlankQuestion(1),
    prompt: "לפני העריכה",
    locationGatePending: true,
  });
  return (
    <>
      <input
        aria-label="ניסוח"
        value={question.prompt}
        onChange={(event) =>
          setQuestion({ ...question, prompt: event.target.value })
        }
      />
      <LocationGateEditor
        question={question}
        update={(patch) => setQuestion({ ...question, ...patch })}
        readOnly={false}
      />
      <output data-testid="question">{JSON.stringify(question)}</output>
    </>
  );
}
afterEach(() => vi.unstubAllGlobals());

describe("GPS authoring draft safety", () => {
  it("requires an intentional point before a pending gate can launch", () => {
    const question = {
      ...makeBlankQuestion(1),
      prompt: "שאלה",
      locationGatePending: true,
    };
    expect(validateQuestions([question])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("בחרו מיקום"),
        }),
      ]),
    );
  });
  it("retains edits and current radius when device location arrives later", () => {
    let success: PositionCallback = () => {};
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: vi.fn((callback: PositionCallback) => {
          success = callback;
        }),
      },
    });
    render(<Editor />);
    fireEvent.click(screen.getByRole("button", { name: "השתמש במיקום שלי" }));
    fireEvent.change(screen.getByRole("textbox", { name: "ניסוח" }), {
      target: { value: "נוסח מעודכן" },
    });
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "רדיוס פתיחת התחנה (מטרים)" }),
      { target: { value: "250" } },
    );
    act(() =>
      success({
        coords: { latitude: 31.77, longitude: 35.23 },
      } as GeolocationPosition),
    );
    expect(
      JSON.parse(screen.getByTestId("question").textContent!),
    ).toMatchObject({
      prompt: "נוסח מעודכן",
      locationGatePending: false,
      settings: { locationGate: { lat: 31.77, lng: 35.23, radiusM: 250 } },
    });
  });
  it("ignores an old lookup after an explicit coordinate choice", () => {
    let success: PositionCallback = () => {};
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: vi.fn((callback: PositionCallback) => {
          success = callback;
        }),
      },
    });
    render(<Editor />);
    fireEvent.click(screen.getByRole("button", { name: "השתמש במיקום שלי" }));
    fireEvent.click(screen.getByText("קואורדינטות — אפשרות מתקדמת"));
    fireEvent.change(screen.getByLabelText("קו רוחב"), {
      target: { value: "32" },
    });
    fireEvent.change(screen.getByLabelText("קו אורך"), {
      target: { value: "34" },
    });
    fireEvent.click(screen.getByRole("button", { name: /שמירת/ }));
    act(() =>
      success({
        coords: { latitude: 31.77, longitude: 35.23 },
      } as GeolocationPosition),
    );
    expect(
      JSON.parse(screen.getByTestId("question").textContent!).settings
        .locationGate,
    ).toMatchObject({ lat: 32, lng: 34 });
  });
});
