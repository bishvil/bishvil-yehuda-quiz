import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HostHomeContent } from "@/src/components/host/HostHomeContent";
import type { HostSessionRow } from "@/src/lib/sessions/host-sessions";

function makeRow(overrides: Partial<HostSessionRow>): HostSessionRow {
  return {
    id: "row-id",
    pin: "123456",
    status: "scheduled",
    quizId: "q1",
    quizTitle: "Quiz One",
    brandId: "yehuda",
    startedAt: null,
    endedAt: null,
    createdAt: "2026-04-30T20:00:00Z",
    ...overrides,
  };
}

describe("HostHomeContent", () => {
  it("renders empty state when no sessions are assigned", () => {
    render(
      <HostHomeContent
        email="host@bishvil.test"
        sessions={[]}
        isAdmin={false}
        signOutHref={null}
      />,
    );
    const empty = screen.getByTestId("host-home-empty");
    expect(empty).toBeTruthy();
    expect(empty.textContent).toContain("אין כרגע חידונים");
    // Admin link is hidden for non-admin host
    expect(screen.queryByText("ניהול חידונים ←")).toBeNull();
  });

  it("shows admin shortcut in empty state when user is also admin", () => {
    render(
      <HostHomeContent
        email="admin@bishvil.test"
        sessions={[]}
        isAdmin
        signOutHref={null}
      />,
    );
    expect(screen.getByText("ניהול חידונים ←")).toBeTruthy();
  });

  it("renders cards grouped by status with PIN LTR-isolated", () => {
    const sessions: HostSessionRow[] = [
      makeRow({ id: "live-1", pin: "100001", status: "live", quizTitle: "Live Quiz" }),
      makeRow({
        id: "scheduled-1",
        pin: "200002",
        status: "scheduled",
        quizTitle: "Scheduled Quiz",
      }),
      makeRow({
        id: "ended-1",
        pin: "300003",
        status: "ended",
        quizTitle: "Old Quiz",
      }),
    ];

    render(
      <HostHomeContent
        email="host@bishvil.test"
        sessions={sessions}
        isAdmin={false}
        signOutHref={null}
      />,
    );

    // Active group only contains live + scheduled
    const active = screen.getByTestId("host-home-active");
    const activeCards = within(active).getAllByTestId("host-home-card");
    expect(activeCards).toHaveLength(2);
    expect(activeCards[0]?.textContent ?? "").toContain("Live Quiz");
    expect(activeCards[1]?.textContent ?? "").toContain("Scheduled Quiz");

    // Ended sessions sit in collapsed details
    expect(screen.getByTestId("host-home-ended")).toBeTruthy();

    // PINs are LTR-isolated
    const pins = screen.getAllByTestId("host-home-pin");
    expect(pins.length).toBeGreaterThan(0);
    for (const pin of pins) {
      expect(pin.getAttribute("dir")).toBe("ltr");
    }
  });

  it("status pill text is Hebrew", () => {
    const sessions: HostSessionRow[] = [
      makeRow({ id: "l", status: "live", pin: "111111" }),
      makeRow({ id: "s", status: "scheduled", pin: "222222" }),
    ];
    render(
      <HostHomeContent
        email="host@bishvil.test"
        sessions={sessions}
        isAdmin={false}
        signOutHref={null}
      />,
    );
    expect(screen.getByText("פעיל")).toBeTruthy();
    expect(screen.getByText("מתוזמן")).toBeTruthy();
  });
});
