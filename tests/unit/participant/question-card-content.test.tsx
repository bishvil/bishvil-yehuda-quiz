import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QuestionCard } from "@/src/components/participant/QuestionCard";

describe("information station reading", () => {
  it("separates a short first-line title from readable body paragraphs", () => {
    render(
      <QuestionCard
        type="content"
        prompt={"סיפורו של המקום\nכאן מתחיל הסיפור.\nוכאן ממשיכים לקרוא."}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "סיפורו של המקום" }),
    ).toBeInTheDocument();
    const body = screen.getByText(/כאן מתחיל הסיפור/);
    expect(body.tagName).toBe("DIV");
    expect(body.className).toContain("font-[var(--font-body)]");
    expect(body.className).toContain("leading-8");
  });
  it("keeps a long unstructured paragraph in body text instead of a display heading", () => {
    const paragraph = "זהו סיפור ארוך על המקום ועל האנשים שעברו בדרך. ".repeat(
      8,
    );
    render(<QuestionCard type="content" prompt={paragraph} />);
    expect(
      screen.getByRole("heading", { name: "סיפור התחנה" }),
    ).toBeInTheDocument();
    expect(screen.getByText(paragraph.trim()).tagName).toBe("DIV");
  });
});
