// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { copy } from "@/copy/family.id";
import { FamilyGate } from "./FamilyGate";

const TOKEN = "T".repeat(43);

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify({ consented: true, treatmentDay: 5, puskesmasName: "Contoh", puskesmasPhone: "021-555" }), {
        status: 200,
      }),
    ),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("link from the check-in screen to the question screen (guideline-qa 4.2)", () => {
  it("is on the home screen of a consented link and keeps the one primary action", async () => {
    const { container } = render(<FamilyGate token={TOKEN} />);
    await screen.findByText(copy.home.todayPrompt);
    const link = screen.getByRole("link", { name: copy.ask.title });
    expect(link.getAttribute("href")).toBe(`/f/${TOKEN}/tanya`);
    expect(screen.getByText(copy.ask.linkTitle)).toBeTruthy();
    // The link is secondary: it must not compete with "Kirim" as a filled primary action.
    expect(link.classList.contains("bg-primary")).toBe(false);
    expect(container.querySelectorAll("a.bg-primary")).toHaveLength(0);
  });
});
