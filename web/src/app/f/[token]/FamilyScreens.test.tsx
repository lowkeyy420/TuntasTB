// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConsentScreen, InvalidLink } from "./FamilyGate";

const FORBIDDEN = /\b(TB|TBC|tuberkulosis|TuntasTB)\b/i;

const primary = (root: HTMLElement) =>
  Array.from(root.querySelectorAll("button, a")).filter((el) => el.classList.contains("bg-primary"));

describe("family screens", () => {
  const views = {
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
    const agree = screen.getByRole("button", { name: "Saya setuju" });
    // gap-3 is 12px.
    expect(agree.parentElement?.className).toMatch(/\bgap-3\b/);
  });
});
