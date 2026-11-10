import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/src/components/admin/AdminTopBar", () => ({
  AdminTopBar: () => null,
}));
import { ResultsListScreen } from "@/app/admin/results/results-list-screen";
afterEach(() => {
  vi.unstubAllGlobals();
});
describe("results overview read states", () => {
  it("shows an empty state only after a successful empty response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ sessions: [] })),
    );
    render(<ResultsListScreen />);
    expect(
      await screen.findByText("עדיין אין תוצאות משחקים להצגה."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/שגיאה בטעינת התוצאות/)).not.toBeInTheDocument();
  });
  it("shows a Hebrew read error rather than the empty state or HTTP internals", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 500 })),
    );
    render(<ResultsListScreen />);
    expect(await screen.findByText(/שגיאה בטעינת התוצאות/)).toHaveTextContent(
      "לא הצלחנו לקרוא את התוצאות",
    );
    expect(
      screen.queryByText("עדיין אין תוצאות משחקים להצגה."),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/HTTP/)).not.toBeInTheDocument();
  });
});
