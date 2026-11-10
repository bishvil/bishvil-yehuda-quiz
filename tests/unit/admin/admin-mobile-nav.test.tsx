import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminMobileNav } from "@/src/components/admin/AdminMobileNav";

const navigation = vi.hoisted(() => ({ pathname: "/admin/quizzes" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));
vi.mock("next/image", () => ({ default: () => null }));

const props = {
  brandName: "בשביל יהודה",
  brandTagline: "בדרך",
  brandLogoUrl: "/logo.png",
};

afterEach(() => {
  navigation.pathname = "/admin/quizzes";
  document.body.style.overflow = "";
});

describe("admin mobile navigation keyboard behavior", () => {
  it("keeps the closed drawer inert, traps focus when open and restores it on Escape", () => {
    render(<AdminMobileNav {...props} />);
    const trigger = screen.getByRole("button", { name: "פתיחת תפריט הניהול" });
    const drawer = screen.getByRole("dialog", { hidden: true });
    expect(drawer).toHaveAttribute("inert");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    trigger.focus();
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(drawer).not.toHaveAttribute("inert");
    const close = within(drawer).getByRole("button", {
      name: "סגירת תפריט הניהול",
    });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    const lastTarget = document.activeElement;
    expect(lastTarget).not.toBe(close);
    expect(drawer.contains(lastTarget)).toBe(true);
    fireEvent.keyDown(lastTarget!, { key: "Tab" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: "Escape" });
    expect(trigger).toHaveFocus();
    expect(drawer).toHaveAttribute("inert");
    expect(document.body.style.overflow).toBe("");
  });

  it("closes after navigation and route changes", () => {
    const view = render(<AdminMobileNav {...props} />);
    const open = () =>
      fireEvent.click(
        screen.getByRole("button", { name: "פתיחת תפריט הניהול" }),
      );
    open();
    const link = within(screen.getByRole("dialog")).getAllByRole("link")[0]!;
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    open();
    navigation.pathname = "/admin/results";
    view.rerender(<AdminMobileNav {...props} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
