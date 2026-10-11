// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConsentScreen, FamilyHome, InvalidLink } from "./FamilyGate";
import { copy } from "@/copy/family.id";

const session = {
  consented: true,
  treatmentDay: 5,
  puskesmasName: "Contoh",
  puskesmasPhone: "021-555 0100",
};

const FORBIDDEN = /\b(TB|TBC|tuberkulosis|TuntasTB)\b/i;

const primary = (root: HTMLElement) =>
  Array.from(root.querySelectorAll("button, a")).filter((el) => el.classList.contains("bg-primary"));

describe("family home before the check-in exists", () => {
  it("says what is coming, that nothing is due today, and offers one action", () => {
    const { container } = render(<FamilyHome session={session} today="2026-10-12" />);

    expect(screen.getByRole("heading", { level: 1, name: copy.home.greeting })).toBeTruthy();
    expect(screen.getByText(copy.home.dayLabel(5))).toBeTruthy();
    expect(screen.getByText(copy.home.todayPrompt)).toBeTruthy();
    expect(screen.getByText(copy.home.notReadyTitle)).toBeTruthy();
    expect(screen.getByText(copy.home.notReadyBody)).toBeTruthy();
    for (const step of copy.home.nextSteps) expect(screen.getByText(step)).toBeTruthy();
    expect(screen.getByText("Puskesmas Contoh, telepon 021-555 0100.")).toBeTruthy();

    const call = screen.getByRole("link", { name: copy.call });
    expect(call.getAttribute("href")).toBe("tel:0215550100");
    expect(primary(container)).toEqual([call]);
  });

  it("shows today's date as a calendar sheet", () => {
    const { container } = render(<FamilyHome session={session} today="2026-10-12" />);
    expect(container.querySelector("time")?.getAttribute("datetime")).toBe("2026-10-12");
  });
});

describe("family screens", () => {
  const views = {
    home: <FamilyHome session={session} today="2026-10-12" />,
    consent: <ConsentScreen saving={false} failed={false} onAgree={() => {}} onDecline={() => {}} />,
    invalid: <InvalidLink />,
  };

  it.each(Object.entries(views))("%s names no illness and links to no staff page", (_name, view) => {
    const { container } = render(view);
    expect(container.textContent).not.toMatch(FORBIDDEN);
    expect(container.querySelector('a[href^="/design"], a[href^="/nurse"], a[href^="/login"]')).toBeNull();
  });

  it.each(Object.entries(views))("%s has at most one primary action", (_name, view) => {
    const { container } = render(view);
    expect(primary(container).length).toBeLessThanOrEqual(1);
  });

  it("consent shows which step of how many", () => {
    render(views.consent);
    expect(screen.getByRole("navigation", { name: "Langkah 1 dari 2" })).toBeTruthy();
    expect(document.querySelector('[aria-current="step"]')?.textContent).toBe("1. Persetujuan");
  });

  it("consent keeps at least 8px between the two stacked actions", () => {
    render(views.consent);
    const agree = screen.getByRole("button", { name: copy.consent.agree });
    // gap-3 is 12px.
    expect(agree.parentElement?.className).toMatch(/\bgap-3\b/);
  });
});
