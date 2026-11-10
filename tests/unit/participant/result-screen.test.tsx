import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ImgHTMLAttributes } from "react";
import { ResultScreen } from "@/app/[pin]/result/result-screen";
vi.mock("next/image", () => ({
  default: ({
    alt,
    src,
    priority,
    ...props
  }: ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) => {
    void priority;
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={alt} src={String(src)} {...props} />;
  },
}));
const props = {
  pin: "123456",
  brand: {
    id: "main",
    name: "בשביל יהודה",
    tagline: "מורשת בדרך ערך",
    logoUrl: "/logo.png",
    primary: "#306030",
    accent: "#A0C040",
  },
  customLogo: null,
  customLogoLabel: null,
  quizTitle: "מסלול בדיקה",
  questionCount: 2,
  maxScorePerQuestion: 100,
  myScore: 100,
  myCorrectCount: 1,
  myStreak: 1,
  myRank: 1,
  leaderboard: [],
};

describe("participant result review", () => {
  it("shows a missed answer with the accepted answer and an information row without a score", () => {
    render(
      <ResultScreen
        {...props}
        review={[
          {
            questionId: "q",
            index: 1,
            prompt: "מהי העיר?",
            outcome: "missed",
            submittedAnswer: null,
            correctAnswer: "ירושלים",
            score: 0,
            maxScore: 100,
            explanation: null,
            mapTargetUrl: null,
            distanceKm: null,
          },
          {
            questionId: "info",
            index: 2,
            prompt: "מידע על המסלול",
            outcome: "information",
            submittedAnswer: null,
            correctAnswer: null,
            score: null,
            maxScore: null,
            explanation: null,
            mapTargetUrl: null,
            distanceKm: null,
          },
        ]}
      />,
    );
    expect(screen.getByText("סקירת התשובות שלי")).toBeInTheDocument();
    expect(screen.getByText(/לא נשלחה תשובה/)).toBeInTheDocument();
    expect(screen.getByText("ירושלים")).toBeInTheDocument();
    expect(screen.getByText(/קטע מידע · ללא ניקוד/)).toBeInTheDocument();
    expect(screen.getAllByText(/מתוך 100 נקודות/)).toHaveLength(1);
  });
  it("finishes an information-only route without meaningless accuracy or zero-score ranking", () => {
    render(
      <ResultScreen
        {...props}
        questionCount={0}
        myScore={0}
        myCorrectCount={0}
        myRank={null}
      />,
    );
    expect(screen.getByText(/אין שאלות מנוקדות במסלול זה/)).toBeInTheDocument();
    expect(screen.queryByText("דיוק")).not.toBeInTheDocument();
    expect(screen.queryByText("דירוג")).not.toBeInTheDocument();
  });
});
