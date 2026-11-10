import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/src/components/admin/AdminTopBar", () => ({
  AdminTopBar: () => null,
}));
vi.mock("@/src/lib/admin/api-client", () => ({
  listAdminQuizzes: vi.fn(),
  isAdminApiError: () => false,
  archiveAdminQuiz: vi.fn(),
  createAdminQuiz: vi.fn(),
  duplicateAdminQuiz: vi.fn(),
  hardDeleteAdminQuiz: vi.fn(),
  unarchiveAdminQuiz: vi.fn(),
}));
import { listAdminQuizzes } from "@/src/lib/admin/api-client";
import { QuizListScreen } from "@/app/admin/quizzes/quiz-list-screen";
const uuid = "11111111-1111-4111-8111-111111111111";
const brand = {
  id: "yehuda",
  name: "בשביל יהודה",
  tagline: "",
  logoUrl: "https://example.com/brand.png",
  primary: "#254833",
  accent: "#ccc",
};
beforeEach(() => {
  vi.mocked(listAdminQuizzes).mockResolvedValue({
    quizzes: [
      {
        id: "q1",
        title: "חידון ממותג",
        brandId: uuid,
        brandKey: "yehuda",
        brandName: brand.name,
        brandLogoUrl: brand.logoUrl,
        defaultGameMode: "async",
        customLogoActive: false,
        archivedAt: null,
        createdAt: "2026-11-10",
        questionCount: 3,
        sessionCount: 0,
      },
      {
        id: "q2",
        title: "חידון ללא מותג זמין",
        brandId: "missing-brand",
        defaultGameMode: "sync",
        customLogoActive: false,
        archivedAt: null,
        createdAt: "2026-11-10",
        questionCount: 1,
        sessionCount: 0,
      },
    ],
  });
});
describe("quiz card brand presentation", () => {
  it("shows the resolved name and logo, with a meaningful fallback and no raw IDs", async () => {
    render(<QuizListScreen brands={[brand]} defaultBrandId="yehuda" />);
    const cards = await screen.findAllByTestId("admin-quiz-card");
    expect(
      within(cards[0]!).getByRole("img", { name: brand.name }),
    ).toHaveAttribute("src", brand.logoUrl);
    expect(cards[0]).toHaveTextContent(brand.name);
    expect(cards[0]).not.toHaveTextContent(uuid);
    expect(cards[1]).toHaveTextContent("מותג כללי");
    expect(cards[1]).not.toHaveTextContent("missing-brand");
    fireEvent.click(screen.getByTestId("admin-quiz-filter-toggle"));
    fireEvent.change(screen.getByTestId("admin-quiz-filter-brand"), {
      target: { value: "yehuda" },
    });
    expect(screen.getAllByTestId("admin-quiz-card")).toHaveLength(1);
    expect(screen.getByText("חידון ממותג")).toBeInTheDocument();
  });
});
