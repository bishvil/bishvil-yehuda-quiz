import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  HostPlayerList,
  type HostPlayer,
} from "@/src/components/host/HostPlayerList";

const players: HostPlayer[] = Array.from({ length: 12 }, (_, index) => ({
  id: `player-${index}`,
  displayName: index === 11 ? "שירה לוי" : `משתתף ${index + 1}`,
  score: index * 10,
  answered: index % 2 === 0,
}));

describe("HostPlayerList", () => {
  it("gives each participant a readable answer state and a keyboard-focusable roster", () => {
    render(<HostPlayerList players={players.slice(0, 2)} />);
    const list = screen.getByRole("list", { name: "רשימת משתתפים" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("משתתף 1");
    expect(rows[0]).toHaveTextContent("ענה");
    expect(rows[1]).toHaveTextContent("ממתין");
    list.focus();
    expect(list).toHaveFocus();
  });

  it("finds participants in a large roster and combines the waiting filter", () => {
    render(<HostPlayerList players={players} />);
    const list = screen.getByRole("list", { name: "רשימת משתתפים" });
    fireEvent.click(screen.getByRole("checkbox", { name: "ממתינים בלבד" }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(6);
    expect(within(list).queryByText("משתתף 1")).not.toBeInTheDocument();
    fireEvent.change(
      screen.getByRole("searchbox", { name: "חיפוש משתתף ברשימה" }),
      {
        target: { value: "  שירה  " },
      },
    );
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(within(list).getByText("שירה לוי")).toBeVisible();
    expect(screen.getByLabelText("1 מתוך 12 משתתפים")).toHaveTextContent(
      "1/12",
    );
  });

  it("explains when everyone has answered without hiding the search control", () => {
    render(
      <HostPlayerList
        players={players.map((player) => ({ ...player, answered: true }))}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "ממתינים בלבד" }));
    expect(screen.getByText("כולם ענו לתחנה הזו.")).toBeVisible();
    fireEvent.click(screen.getByRole("checkbox", { name: "ממתינים בלבד" }));
    expect(
      within(screen.getByRole("list")).getAllByRole("listitem"),
    ).toHaveLength(12);
  });

  it("does not imply that informational stations require answers", () => {
    const { rerender } = render(<HostPlayerList players={players} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "ממתינים בלבד" }));
    rerender(<HostPlayerList players={players} hideAnsweredDot />);
    expect(
      screen.queryByRole("checkbox", { name: "ממתינים בלבד" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("ממתין")).not.toBeInTheDocument();
    expect(screen.queryByText("ענה")).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("list")).getAllByRole("listitem"),
    ).toHaveLength(12);
  });
});
