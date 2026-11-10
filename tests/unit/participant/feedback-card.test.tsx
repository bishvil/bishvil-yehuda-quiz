import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FeedbackCard } from "@/src/components/participant/FeedbackCard";
afterEach(cleanup);
describe("accurate answer feedback", () => {
  it("does not call a missing answer incorrect", () => {
    render(<FeedbackCard isCorrect={null} />);
    expect(screen.getByText("לא נשלחה תשובה")).toBeInTheDocument();
    expect(screen.queryByText("לא מדויק")).not.toBeInTheDocument();
  });
  it("explains timeout separately", () => {
    render(<FeedbackCard isCorrect={null} outcome="timeout" />);
    expect(screen.getByText("הזמן הסתיים ללא תשובה")).toBeInTheDocument();
  });
  it("marks partial credit explicitly", () => {
    render(
      <FeedbackCard
        isCorrect={false}
        outcome="partial"
        score={500}
        totalPoints={1500}
      />,
    );
    expect(screen.getByText("נכון חלקית")).toBeInTheDocument();
  });
  it("keeps slow correct answers correct", () => {
    render(<FeedbackCard isCorrect score={1001} totalPoints={1500} />);
    expect(screen.getByText("מצוין!")).toBeInTheDocument();
  });
});
