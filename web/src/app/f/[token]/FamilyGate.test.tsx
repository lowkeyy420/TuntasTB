// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FamilyGate } from "./FamilyGate";
import { copy } from "@/copy/family.id";

const TOKEN = "T".repeat(43);

const session = (consented: boolean) => ({
  consented,
  treatmentDay: 5,
  puskesmasName: "Contoh",
  puskesmasPhone: "021-555",
});

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("family consent screen (6.2)", () => {
  it("shows consent instead of the check-in when consent is missing", async () => {
    fetchSpy.mockResolvedValueOnce(jsonRes(session(false)));
    render(<FamilyGate token={TOKEN} />);
    await screen.findByRole("button", { name: copy.consent.agree });
    expect(screen.getByRole("button", { name: copy.consent.decline })).toBeTruthy();
    expect(screen.queryByText(copy.home.todayPrompt)).toBeNull();
    // The session call carries the token as a bearer header, never in the URL.
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/family/session");
    expect(init.headers.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("declining sends no network request and shows how to reach the Puskesmas", async () => {
    fetchSpy.mockResolvedValueOnce(jsonRes(session(false)));
    render(<FamilyGate token={TOKEN} />);
    const decline = await screen.findByRole("button", { name: copy.consent.decline });
    expect(fetchSpy).toHaveBeenCalledTimes(1); // only the session lookup

    fireEvent.click(decline);

    await screen.findByText(copy.declined.title);
    expect(fetchSpy).toHaveBeenCalledTimes(1); // nothing sent on decline
    expect(screen.getByText("Puskesmas Contoh, telepon 021-555.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: copy.consent.agree })).toBeNull();
  });

  it("agreeing posts consent with the bearer token and opens the check-in area", async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonRes(session(false)))
      .mockResolvedValueOnce(jsonRes({ consented: true }));
    render(<FamilyGate token={TOKEN} />);
    fireEvent.click(await screen.findByRole("button", { name: copy.consent.agree }));

    await screen.findByText(copy.home.todayPrompt);
    const [url, init] = fetchSpy.mock.calls[1];
    expect(url).toBe("/api/family/consent");
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("keeps the consent screen and shows an error when saving fails", async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonRes(session(false)))
      .mockResolvedValueOnce(jsonRes({ error: "x" }, 500));
    render(<FamilyGate token={TOKEN} />);
    fireEvent.click(await screen.findByRole("button", { name: copy.consent.agree }));
    await screen.findByText(copy.consent.saveFailed);
    expect(screen.queryByText(copy.home.todayPrompt)).toBeNull();
  });

  it("does not show consent again once it was given", async () => {
    fetchSpy.mockResolvedValueOnce(jsonRes(session(true)));
    render(<FamilyGate token={TOKEN} />);
    await screen.findByText(copy.home.todayPrompt);
    expect(screen.queryByRole("button", { name: copy.consent.agree })).toBeNull();
  });
});

describe("invalid-link page (6.3)", () => {
  async function renderFor404(body: unknown) {
    fetchSpy.mockResolvedValueOnce(jsonRes(body, 404));
    const view = render(<FamilyGate token={TOKEN} />);
    await screen.findByText(copy.invalidLink.body);
    return view.container.innerHTML;
  }

  it("renders the same page for unknown and revoked links", async () => {
    // The API gives one identical 404 body for both; the page is therefore identical.
    const unknown = await renderFor404({ error: "not found" });
    document.body.innerHTML = "";
    const revoked = await renderFor404({ error: "not found" });
    expect(unknown).toBe(revoked);
    expect(unknown).toContain("Tautan tidak berlaku. Hubungi petugas Puskesmas.");
  });

  it("reveals nothing about any patient or Puskesmas", async () => {
    const html = await renderFor404({ error: "not found" });
    expect(html).not.toMatch(/Puskesmas \w+, telepon/);
    expect(html).not.toMatch(/\b(TB|TBC|tuberkulosis)\b/i);
  });
});
