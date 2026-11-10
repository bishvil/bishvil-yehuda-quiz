import React, { useCallback, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ParticipantPreviewDialog } from "@/src/components/admin/ParticipantPreviewDialog";
import {
  makeBlankQuestion,
  type EditableQuestion,
} from "@/src/lib/admin/quiz-editor";

vi.mock("@/src/components/MapQuestionInteractive", () => ({
  MapQuestionInteractive: ({
    onPin,
    target,
  }: {
    onPin: (pin: { lat: number; lng: number }) => void;
    target: unknown;
  }) => (
    <button onClick={() => onPin({ lat: 31, lng: 35 })}>
      {target ? "יעד נחשף" : "סימון מיקום"}
    </button>
  ),
}));

function Launcher({ question }: { question: EditableQuestion }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button onClick={() => setOpen(true)}>פתיחת התצוגה</button>
      {open && (
        <ParticipantPreviewDialog
          question={question}
          quizTitle="מסע"
          stationCount={3}
          onClose={close}
        />
      )}
    </>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.style.overflow = "";
});

describe("local participant preview", () => {
  it("checks answers locally, supports screen sizes and restores focus on Escape", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const question = makeBlankQuestion(2);
    question.options = [
      { id: "a", text: "ירושלים" },
      { id: "b", text: "חיפה" },
    ];
    render(<Launcher question={question} />);
    const trigger = screen.getByRole("button", { name: "פתיחת התצוגה" });
    trigger.focus();
    fireEvent.click(trigger);
    const close = screen.getByRole("button", { name: "סגירת תצוגת השחקן" });
    expect(close).toHaveFocus();
    expect(screen.getByText("תחנה 2 מתוך 3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "מחשב" }));
    expect(screen.getByRole("button", { name: "מחשב" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "בדיקת התשובה בתצוגה" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "ירושלים" }));
    fireEvent.click(
      screen.getByRole("button", { name: "בדיקת התשובה בתצוגה" }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("תשובה נכונה");
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("simulates GPS arrival and normalizes open answers without sending anything", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const question = {
      ...makeBlankQuestion(1),
      type: "open" as const,
      settings: {
        acceptedAnswers: ["יְרוּשָׁלַיִם"],
        timeLimitEnabled: false,
        locationGate: { lat: 31, lng: 35, radiusM: 100 },
      },
    };
    render(
      <ParticipantPreviewDialog
        question={question}
        quizTitle="מסע"
        stationCount={1}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByText(question.prompt)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "הדמיית הגעה לתחנה" }));
    expect(screen.getByText("ללא הגבלת זמן")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "התשובה שלכם" }), {
      target: { value: "  ירושלים  " },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "בדיקת התשובה בתצוגה" }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("תשובה נכונה");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("traps keyboard focus and lets informational stations finish without an answer", () => {
    const onClose = vi.fn();
    render(
      <ParticipantPreviewDialog
        question={{ ...makeBlankQuestion(1), type: "content" }}
        quizTitle="מסע"
        stationCount={1}
        onClose={onClose}
      />,
    );
    const first = screen.getByRole("button", { name: "נייד" });
    const finish = screen.getByRole("button", { name: "סיום התצוגה" });
    first.focus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(finish).toHaveFocus();
    fireEvent.keyDown(finish, { key: "Tab" });
    expect(first).toHaveFocus();
    expect(
      screen.queryByRole("button", { name: "בדיקת התשובה בתצוגה" }),
    ).not.toBeInTheDocument();
    fireEvent.click(finish);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("reveals map targets only after a local pin is checked", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const question = {
      ...makeBlankQuestion(1),
      type: "map" as const,
      map: { geo: { target: { lat: 31, lng: 35 }, toleranceKm: 1 } },
    };
    render(
      <ParticipantPreviewDialog
        question={question}
        quizTitle="מסע"
        stationCount={1}
        onClose={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "יעד נחשף" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "סימון מיקום" }));
    fireEvent.click(
      screen.getByRole("button", { name: "בדיקת התשובה בתצוגה" }),
    );
    expect(
      screen.getByRole("button", { name: "יעד נחשף" }),
    ).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not present a pending GPS station as an ungated station", () => {
    const question = { ...makeBlankQuestion(1), locationGatePending: true };
    render(
      <ParticipantPreviewDialog
        question={question}
        quizTitle="מסע"
        stationCount={1}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "מיקום התחנה עדיין לא הוגדר",
    );
    expect(screen.queryByText(question.prompt)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "בדיקת התשובה בתצוגה" }),
    ).not.toBeInTheDocument();
  });
});
