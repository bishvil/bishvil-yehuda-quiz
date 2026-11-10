import React from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuizMetaCard } from "@/app/admin/quizzes/[quizId]/quiz-meta-card";
import { ActiveQuestionPane } from "@/app/admin/quizzes/[quizId]/active-question-pane";
import {
  makeBlankQuestion,
  type EditableQuiz,
} from "@/src/lib/admin/quiz-editor";

vi.mock("@/src/components/admin/upload/LogoUploader", () => ({
  LogoUploader: () => <div>העלאת לוגו</div>,
}));
vi.mock("@/src/components/admin/QuestionEditor", () => ({
  QuestionEditor: () => <div>עריכת תחנה</div>,
}));

const quiz: EditableQuiz = {
  id: "quiz",
  title: "מסע",
  brandId: "yehuda",
  defaultGameMode: "async",
  customLogo: null,
  customLogoLabel: null,
  customLogoActive: false,
  joinFields: ["name", "phone"],
  archivedAt: null,
};
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mobile authoring layout", () => {
  it("collapses inactive branding while keeping essential quiz settings visible", () => {
    const view = render(
      <QuizMetaCard quiz={quiz} onChange={vi.fn()} brands={[]} />,
    );
    expect(screen.getByRole("textbox", { name: "שם החידון" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "מצב משחק" })).toBeVisible();
    expect(screen.getByRole("group", { name: "שדות הצטרפות" })).toBeVisible();
    const summary = screen.getByText("מיתוג ייעודי והגדרות תצוגה");
    expect(summary.closest("details")).not.toHaveAttribute("open");
    view.rerender(
      <QuizMetaCard
        quiz={{ ...quiz, customLogoActive: true }}
        onChange={vi.fn()}
        brands={[]}
      />,
    );
    expect(summary.closest("details")).toHaveAttribute("open");
  });

  it("moves scroll and focus to the selected station on small screens", () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    );
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        frames.push(callback);
        return frames.length;
      }),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const props = {
      activeQuestion: makeBlankQuestion(1),
      mobileView: "list" as "list" | "edit",
      readOnly: false,
      onMobileViewChange: vi.fn(),
      onQuestionChange: vi.fn(),
      onQuestionDelete: vi.fn(),
    };
    const view = render(<ActiveQuestionPane {...props} />);
    expect(frames).toHaveLength(0);
    view.rerender(<ActiveQuestionPane {...props} mobileView="edit" />);
    const heading = screen.getByRole("heading", { name: "תחנה 1" });
    heading.scrollIntoView = vi.fn();
    act(() => {
      frames.shift()!(0);
    });
    expect(heading.scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    expect(heading).toHaveFocus();
  });
});
