import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ComponentProps, ImgHTMLAttributes } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { JoinScreen } from "@/app/[pin]/join-screen";
import type { ParticipantBrand } from "@/src/lib/participant/brands";

const { routerReplaceMock, searchParamsState, signInWithOAuthMock } =
  vi.hoisted(() => ({
    routerReplaceMock: vi.fn(),
    searchParamsState: { value: "" },
    signInWithOAuthMock: vi.fn(),
  }));

/** Inline fixture — mirrors the seeded yehuda system brand. */
const YEHUDA_BRAND: ParticipantBrand = {
  id: "yehuda",
  name: "בשביל יהודה",
  tagline: "מורשת בדרך ערך",
  logoUrl: "/logos/logo_yehuda.png",
  primary: "#306030",
  accent: "#A0C040",
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: routerReplaceMock,
    back: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(searchParamsState.value),
}));

vi.mock("@/src/lib/supabase/browser", () => ({
  createBrowserSupabaseClient: () => ({
    auth: {
      signInWithOAuth: signInWithOAuthMock,
    },
  }),
}));

vi.mock("next/image", () => ({
  default: ({
    alt,
    priority,
    src,
    ...props
  }: ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) => {
    void priority;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img alt={alt} src={typeof src === "string" ? src : ""} {...props} />
    );
  },
}));

function renderJoinScreen(
  overrides: Partial<ComponentProps<typeof JoinScreen>> = {},
) {
  return render(
    <JoinScreen
      pin="123456"
      brand={YEHUDA_BRAND}
      quizTitle="חידון בדיקה"
      customLogo={null}
      customLogoLabel={null}
      sessionStatus="scheduled"
      {...overrides}
    />,
  );
}

function codeCells() {
  return within(screen.getByRole("group", { name: "קוד החידון" })).getAllByRole(
    "textbox",
  );
}

function fillPhoneField() {
  fireEvent.change(screen.getByLabelText(/מספר נייד/), {
    target: { value: "0501234567" },
  });
}

describe("JoinScreen", () => {
  beforeEach(() => {
    routerReplaceMock.mockClear();
    signInWithOAuthMock.mockReset();
    searchParamsState.value = "";
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("prefills the PIN from a valid route param and enables Google join after phone is valid", () => {
    renderJoinScreen({ pin: "123456" });

    expect(codeCells().map((cell) => (cell as HTMLInputElement).value)).toEqual(
      ["1", "2", "3", "4", "5", "6"],
    );
    expect(screen.queryByLabelText(/שם פרטי/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/שם משפחה/)).not.toBeInTheDocument();

    fillPhoneField();

    expect(
      screen.getByRole("button", { name: /הצטרפות עם Google/ }),
    ).toBeEnabled();
  });

  it("leaves the PIN empty when the route param is not a six-digit code", () => {
    renderJoinScreen({ pin: "abc" });

    expect(codeCells().map((cell) => (cell as HTMLInputElement).value)).toEqual(
      ["", "", "", "", "", ""],
    );
  });

  it("shows an unavailable banner when the session has ended", () => {
    renderJoinScreen({ sessionStatus: "ended" });

    expect(screen.getByRole("status")).toHaveTextContent("הסתיים");
    expect(
      screen.getByRole("button", { name: /הצטרפות עם Google/ }),
    ).toBeDisabled();
  });

  it("prefers the ended banner copy when the session has ended", () => {
    renderJoinScreen({ sessionStatus: "ended" });

    expect(screen.getByRole("status")).toHaveTextContent("הסתיים");
    expect(screen.getByRole("status")).not.toHaveTextContent("אינו זמין");
  });

  it("starts Google OAuth with the edited PIN instead of the route PIN", async () => {
    signInWithOAuthMock.mockResolvedValue({ error: null });
    renderJoinScreen({ pin: "123456" });

    const cells = codeCells();
    "654321".split("").forEach((digit, index) => {
      fireEvent.keyDown(cells[index]!, { key: digit });
    });
    fillPhoneField();

    fireEvent.click(screen.getByRole("button", { name: /הצטרפות עם Google/ }));

    await waitFor(() => {
      expect(signInWithOAuthMock).toHaveBeenCalled();
    });

    const redirectTo = new URL(
      signInWithOAuthMock.mock.calls[0]![0].options.redirectTo,
    );
    expect(redirectTo.searchParams.get("pin")).toBe("654321");
  });

  it("starts Google OAuth with the current join draft", async () => {
    signInWithOAuthMock.mockResolvedValue({ error: null });
    renderJoinScreen({ pin: "123456" });

    fillPhoneField();
    fireEvent.click(screen.getByRole("button", { name: /הצטרפות עם Google/ }));

    await waitFor(() => {
      expect(signInWithOAuthMock).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "google",
          options: expect.objectContaining({
            redirectTo: expect.stringContaining("/auth/oauth/callback"),
          }),
        }),
      );
    });

    const redirectTo = new URL(
      signInWithOAuthMock.mock.calls[0]![0].options.redirectTo,
    );
    expect(redirectTo.searchParams.get("flow")).toBe("participant");
    expect(redirectTo.searchParams.get("pin")).toBe("123456");
    expect(
      window.sessionStorage.getItem("bsy:participant-google-join:123456"),
    ).toContain("0501234567");
  });

  it("submits a saved Google join draft after OAuth returns", async () => {
    searchParamsState.value = "google=connected";
    window.sessionStorage.setItem(
      "bsy:participant-google-join:123456",
      JSON.stringify({
        code: "123456",
        phone: "0501234567",
        unit: "גדוד 890",
        team: "צוות א׳",
      }),
    );
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      json: async () => ({
        participantId: "participant-1",
        sessionId: "session-1",
        accessToken: "token",
        tokenType: "bearer",
      }),
    } as Response);

    renderJoinScreen({ pin: "123456" });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/session/123456/join",
        expect.objectContaining({
          body: expect.stringContaining('"identityProvider":"google"'),
        }),
      );
    });
    expect(routerReplaceMock).toHaveBeenCalledWith("/123456/lobby");
  });
});
