import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps, ImgHTMLAttributes } from "react";
import { describe, expect, it, vi } from "vitest";

import { JoinScreen } from "@/app/[pin]/join-screen";
import { DEFAULT_PARTICIPANT_BRAND } from "@/src/lib/participant/brands";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
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
      brand={DEFAULT_PARTICIPANT_BRAND}
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

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText(/מספר נייד/), {
    target: { value: "0501234567" },
  });
  fireEvent.change(screen.getByLabelText(/שם פרטי/), {
    target: { value: "דנה" },
  });
  fireEvent.change(screen.getByLabelText(/שם משפחה/), {
    target: { value: "כהן" },
  });
}

describe("JoinScreen", () => {
  it("prefills the PIN from a valid route param and enables submit after the other required fields are valid", () => {
    renderJoinScreen({ pin: "123456" });

    expect(codeCells().map((cell) => (cell as HTMLInputElement).value)).toEqual(
      ["1", "2", "3", "4", "5", "6"],
    );

    fillRequiredFields();

    expect(
      screen.getByRole("button", { name: /הצטרפות לחידון/ }),
    ).toBeEnabled();
  });

  it("leaves the PIN empty when the route param is not a six-digit code", () => {
    renderJoinScreen({ pin: "abc" });

    expect(codeCells().map((cell) => (cell as HTMLInputElement).value)).toEqual(
      ["", "", "", "", "", ""],
    );
  });

  it("shows an unavailable banner when the current session state blocks joining", () => {
    renderJoinScreen({ sessionStatus: "paused" });

    expect(screen.getByRole("status")).toHaveTextContent("אינו זמין");
    expect(
      screen.getByRole("button", { name: /הצטרפות לחידון/ }),
    ).toBeDisabled();
  });

  it("prefers the ended banner copy when the session has ended", () => {
    renderJoinScreen({ sessionStatus: "ended" });

    expect(screen.getByRole("status")).toHaveTextContent("הסתיים");
    expect(screen.getByRole("status")).not.toHaveTextContent("אינו זמין");
  });
});
