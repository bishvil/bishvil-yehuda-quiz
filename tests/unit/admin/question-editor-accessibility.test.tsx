import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QuestionEditor } from "@/src/components/admin/QuestionEditor";
import { makeBlankQuestion } from "@/src/lib/admin/quiz-editor";

vi.mock("@/src/components/admin/LocationGateEditor", () => ({
  LocationGateEditor: () => null,
}));
vi.mock("@/src/components/admin/MapQuestionEditor", () => ({
  MapQuestionEditor: () => null,
}));
vi.mock("@/src/components/admin/upload/QuestionImageUploader", () => ({
  QuestionImageUploader: () => null,
}));
vi.mock("@/src/components/admin/upload/QuestionVideoUploader", () => ({
  QuestionVideoUploader: () => null,
}));

describe("question authoring accessible controls", () => {
  it("names every answer control separately and groups type choices without wrapping labels", () => {
    const question = makeBlankQuestion(1);
    const onChange = vi.fn();
    render(<QuestionEditor question={question} onChange={onChange} />);
    expect(screen.getByRole("textbox", { name: "ניסוח השאלה" })).toHaveValue(
      question.prompt,
    );
    const types = screen.getByRole("group", { name: "סוג שאלה" });
    expect(
      within(types).getByRole("button", { name: "רב־ברירה" }),
    ).toBeInTheDocument();
    const answers = screen.getByRole("group", { name: "תשובות" });
    expect(
      within(answers).getByRole("textbox", { name: "נוסח תשובה 1" }),
    ).toBeInTheDocument();
    fireEvent.click(
      within(answers).getByRole("button", { name: "סימון תשובה 2 כנכונה" }),
    );
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ correctIds: [question.options![1]!.id] }),
    );
    fireEvent.click(
      within(answers).getByRole("button", { name: "מחיקת תשובה 2" }),
    );
    expect(onChange.mock.lastCall![0].options).toHaveLength(
      question.options!.length - 1,
    );
    const advanced = screen.getByText(/ניקוד ופידבק לאחר תשובה/);
    expect(advanced.closest("details")).not.toHaveAttribute("open");
    expect(
      screen.getByRole("spinbutton", { name: "זמן (שניות)" }),
    ).toBeVisible();
    fireEvent.click(advanced);
    expect(
      screen.getByRole("textbox", { name: "פידבק לאחר תשובה" }),
    ).toBeVisible();
  });

  it("keeps open-answer fields named and read-only controls disabled", () => {
    const question = {
      ...makeBlankQuestion(1),
      type: "open" as const,
      settings: { acceptedAnswers: ["ירושלים"] },
    };
    render(<QuestionEditor question={question} onChange={vi.fn()} readOnly />);
    expect(
      screen.getByRole("textbox", { name: "תשובות קבילות (תשובה בכל שורה)" }),
    ).toBeDisabled();
    expect(screen.getByLabelText("פידבק לאחר תשובה")).toBeDisabled();
  });
});
