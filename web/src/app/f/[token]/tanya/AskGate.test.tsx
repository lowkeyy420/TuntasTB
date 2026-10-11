// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { copy } from "@/copy/family.id";
import { AskLink } from "@/components/ask/AskLink";
import { AskGate } from "./AskGate";

vi.mock("@/lib/offline/cache", () => ({
  saveSession: vi.fn(async () => undefined),
  loadSession: vi.fn(),
}));
import { loadSession } from "@/lib/offline/cache";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.mocked(loadSession).mockReset();
});

const TOKEN = "t".repeat(43);
const session = { consented: true, treatmentDay: 12, puskesmasName: "Kebon Jeruk", puskesmasPhone: "021-555-0100" };

describe("AskLink", () => {
  it("links the check-in screen to the question screen of the same link", () => {
    render(<AskLink token={TOKEN} />);
    expect(screen.getByText(copy.ask.linkTitle)).toBeTruthy();
    expect(screen.getByRole("link", { name: copy.ask.title }).getAttribute("href")).toBe(`/f/${TOKEN}/tanya`);
  });
});

describe("AskGate", () => {
  it("opens the question screen for a consented link", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(session), { status: 200 })));
    render(<AskGate token={TOKEN} />);
    expect(await screen.findByLabelText(copy.ask.label)).toBeTruthy();
  });

  it("shows the invalid-link page for a revoked link", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    render(<AskGate token={TOKEN} />);
    expect(await screen.findByText(copy.invalidLink.title)).toBeTruthy();
  });

  it("sends a link without consent to the home page of the link", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ...session, consented: false }), { status: 200 })));
    render(<AskGate token={TOKEN} />);
    const link = await screen.findByRole("link", { name: copy.consent.title });
    expect(link.getAttribute("href")).toBe(`/f/${TOKEN}`);
  });

  it("offline, opens from the session kept on the device, with the Puskesmas number", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }));
    vi.mocked(loadSession).mockResolvedValue(session);
    render(<AskGate token={TOKEN} />);
    expect(await screen.findByLabelText(copy.ask.label)).toBeTruthy();
    expect(loadSession).toHaveBeenCalled();
  });

  it("offline with nothing kept on the device, offers a retry", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }));
    vi.mocked(loadSession).mockResolvedValue(null);
    render(<AskGate token={TOKEN} />);
    expect(await screen.findByText(copy.loadFailedTitle)).toBeTruthy();
    expect(screen.getByRole("button", { name: copy.retry })).toBeTruthy();
  });

  it("a server error offers a retry", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    render(<AskGate token={TOKEN} />);
    expect(await screen.findByText(copy.loadFailedTitle)).toBeTruthy();
  });
});
