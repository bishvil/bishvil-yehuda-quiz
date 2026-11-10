import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/src/components/admin/AdminTopBar", () => ({
  AdminTopBar: () => null,
}));
import { ResultsListScreen } from "@/app/admin/results/results-list-screen";
import type { ResultsListRow } from "@/app/api/admin/results/route";

afterEach(() => {
  vi.unstubAllGlobals();
});

function session(overrides: Partial<ResultsListRow> = {}): ResultsListRow {
  return {
    id: "s1",
    pin: "123456",
    quizId: "q1",
    quizTitle: "משחק ראשון",
    brandId: "main",
    endedAt: null,
    startedAt: null,
    createdAt: "2026-05-10T09:30:00Z",
    status: "scheduled",
    gameMode: "async",
    participantCount: 12,
    averageScore: 875,
    topThree: [{ participantId: "p1", name: "יעל בדיקה", score: 1750 }],
    ...overrides,
  };
}
function page(sessions: ResultsListRow[], nextOffset: number | null = null) {
  return Response.json({ sessions, nextOffset });
}

describe("results overview read states", () => {
  it("shows an empty state only after a successful empty response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => page([])),
    );
    render(<ResultsListScreen />);
    expect(
      await screen.findByText("עדיין אין תוצאות משחקים להצגה."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/שגיאה בטעינת התוצאות/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "טעינת משחקים נוספים" }),
    ).not.toBeInTheDocument();
  });
  it("shows a Hebrew read error with retry rather than an empty state or HTTP internals", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(page([session()]));
    vi.stubGlobal("fetch", request);
    render(<ResultsListScreen />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "לא הצלחנו לקרוא את התוצאות",
    );
    expect(
      screen.queryByText("עדיין אין תוצאות משחקים להצגה."),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/HTTP/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ניסיון נוסף" }));
    expect(await screen.findByText("משחק ראשון")).toBeInTheDocument();
    expect(request.mock.calls.map(([url]) => url)).toEqual([
      "/api/admin/results",
      "/api/admin/results",
    ]);
  });
});

describe("results pagination", () => {
  it("appends older games, deduplicates IDs, and removes the button at the last page", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(page([session()], 50))
      .mockResolvedValueOnce(
        page([
          session(),
          session({ id: "s2", quizTitle: "המשחק הישן מיום ראשון" }),
        ]),
      );
    vi.stubGlobal("fetch", request);
    render(<ResultsListScreen />);
    fireEvent.click(
      await screen.findByRole("button", { name: "טעינת משחקים נוספים" }),
    );
    expect(
      await screen.findByText("המשחק הישן מיום ראשון"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("משחק ראשון")).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: "טעינת משחקים נוספים" }),
    ).not.toBeInTheDocument();
    expect(request).toHaveBeenLastCalledWith("/api/admin/results?offset=50", {
      cache: "no-store",
    });
    expect(screen.getByRole("status")).toHaveTextContent("2 משחקים נטענו");
  });
  it("keeps loaded games visible on failure and retries the same offset", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(page([session()], 50))
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(
        page([session({ id: "s2", quizTitle: "משחק נוסף" })]),
      );
    vi.stubGlobal("fetch", request);
    render(<ResultsListScreen />);
    fireEvent.click(
      await screen.findByRole("button", { name: "טעינת משחקים נוספים" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "התוצאות שכבר נטענו נשמרו",
    );
    expect(screen.getByText("משחק ראשון")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "ניסיון נוסף לטעינת משחקים נוספים" }),
    );
    expect(await screen.findByText("משחק נוסף")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(request.mock.calls.map(([url]) => url)).toEqual([
      "/api/admin/results",
      "/api/admin/results?offset=50",
      "/api/admin/results?offset=50",
    ]);
  });
  it("disables pagination while loading and prevents duplicate clicks", async () => {
    let finishPage!: (response: Response) => void;
    const request = vi
      .fn()
      .mockResolvedValueOnce(page([session()], 50))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finishPage = resolve;
          }),
      );
    vi.stubGlobal("fetch", request);
    render(<ResultsListScreen />);
    const button = await screen.findByRole("button", {
      name: "טעינת משחקים נוספים",
    });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveTextContent("טוען משחקים נוספים…");
    expect(request).toHaveBeenCalledTimes(2);
    expect(screen.getByText("משחק ראשון")).toBeInTheDocument();
    finishPage(page([], null));
    await waitFor(() => expect(button).not.toBeInTheDocument());
  });
});

describe("legacy async result cards", () => {
  it("clearly labels scheduled async results as interim and preserves returned statistics", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => page([session()])),
    );
    render(<ResultsListScreen />);
    expect(
      await screen.findByText("תוצאות ביניים · משחק אסינכרוני"),
    ).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "תוצאות משחקים" });
    expect(within(list).getByText("12")).toBeInTheDocument();
    expect(within(list).getByText("875")).toBeInTheDocument();
    expect(within(list).getByText("1750")).toBeInTheDocument();
    expect(within(list).queryByText("0")).not.toBeInTheDocument();
  });
  const dateCases: Array<{
    name: string;
    overrides: Partial<ResultsListRow>;
    expected: string;
    label: string;
  }> = [
    {
      name: "actual November activity for a game created and ended in May",
      overrides: {
        status: "ended",
        createdAt: "2026-05-10T09:30:00Z",
        endedAt: "2026-05-17T09:00:00Z",
        lastPlayedAt: "2026-11-08T12:30:00Z",
        lastJoinedAt: "2026-11-09T12:30:00Z",
      },
      expected: "2026-11-08T12:30:00.000Z",
      label: "פעילות אחרונה",
    },
    {
      name: "participant join when there is no saved play activity",
      overrides: {
        lastPlayedAt: null,
        lastJoinedAt: "2026-11-08T11:30:00Z",
        endedAt: "2026-05-17T09:00:00Z",
      },
      expected: "2026-11-08T11:30:00.000Z",
      label: "הצטרפות אחרונה",
    },
    {
      name: "start for an active game whose endedAt is an expiry timestamp",
      overrides: {
        status: "live",
        endedAt: "2026-05-17T09:00:00Z",
        startedAt: "2026-05-11T09:00:00Z",
      },
      expected: "2026-05-11T09:00:00.000Z",
      label: "תחילת המשחק",
    },
    {
      name: "creation for a scheduled game whose endedAt is an expiry timestamp",
      overrides: { endedAt: "2026-05-17T09:00:00Z" },
      expected: "2026-05-10T09:30:00.000Z",
      label: "יצירת המשחק",
    },
    {
      name: "actual end for an ended game without activity or join data",
      overrides: {
        status: "ended",
        endedAt: "2026-05-12T09:00:00Z",
        startedAt: "2026-05-11T09:00:00Z",
      },
      expected: "2026-05-12T09:00:00.000Z",
      label: "סיום המשחק",
    },
    {
      name: "end for a legacy response with no status",
      overrides: { status: undefined, endedAt: "2026-05-12T09:00:00Z" },
      expected: "2026-05-12T09:00:00.000Z",
      label: "סיום המשחק",
    },
    {
      name: "valid join after an invalid activity timestamp",
      overrides: {
        lastPlayedAt: "invalid",
        lastJoinedAt: "2026-11-08T11:30:00Z",
      },
      expected: "2026-11-08T11:30:00.000Z",
      label: "הצטרפות אחרונה",
    },
    {
      name: "valid start after invalid optional and end timestamps",
      overrides: {
        status: "ended",
        lastPlayedAt: "invalid",
        lastJoinedAt: "invalid",
        endedAt: "invalid",
        startedAt: "2026-05-11T09:00:00Z",
      },
      expected: "2026-05-11T09:00:00.000Z",
      label: "תחילת המשחק",
    },
    {
      name: "creation after an invalid start timestamp",
      overrides: { startedAt: "invalid" },
      expected: "2026-05-10T09:30:00.000Z",
      label: "יצירת המשחק",
    },
  ];
  it.each(dateCases)(
    "shows a labeled, valid date: $name",
    async ({ overrides, expected, label }) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => page([session(overrides)])),
      );
      const { container } = render(<ResultsListScreen />);
      await screen.findByText("משחק ראשון");
      const time = container.querySelector("time");
      expect(time).toHaveAttribute("datetime", expected);
      expect(screen.getByText(label, { exact: true })).toBeVisible();
      expect(time).not.toHaveTextContent("Invalid Date");
      if (overrides.status && overrides.status !== "ended") {
        expect(
          screen.queryByText("סיום המשחק", { exact: true }),
        ).not.toBeInTheDocument();
      }
    },
  );
  it("does not invent a date if no valid timestamp is available", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        page([
          session({
            lastPlayedAt: "invalid",
            lastJoinedAt: "invalid",
            createdAt: "invalid",
            startedAt: null,
            endedAt: null,
          }),
        ]),
      ),
    );
    const { container } = render(<ResultsListScreen />);
    await screen.findByText("משחק ראשון");
    expect(container.querySelector("time")).toBeNull();
    expect(screen.queryByText("Invalid Date")).not.toBeInTheDocument();
  });
});
