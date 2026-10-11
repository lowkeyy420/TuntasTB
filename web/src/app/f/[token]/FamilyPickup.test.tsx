// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { copy } from "@/copy/family.id";
import { closeDb, DB_NAME } from "@/lib/offline/idb";
import { loadPickup } from "@/lib/offline/cache";
import { FamilyPickup } from "./FamilyPickup";

const TOKEN = "T".repeat(43);
const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const show = (today: string) =>
  render(<FamilyPickup token={TOKEN} puskesmasName="Contoh" puskesmasPhone="021-555-0100" today={today} />);

beforeEach(async () => {
  await closeDb();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("family pickup card (pickup-planner 4.3, 4.4)", () => {
  it("online: shows the server's countdown, asks with the family token, and keeps the due date on the device", async () => {
    const fetchMock = vi.fn(async () =>
      jsonRes({ pickup: { dueDate: "2026-03-25", daysUntil: 5, state: "upcoming", daysOverdue: 0 }, contact: {} }),
    );
    vi.stubGlobal("fetch", fetchMock);
    show("2026-03-20");
    expect(await screen.findByText("Ambil obat 5 hari lagi")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/family/pickup", {
      headers: { authorization: `Bearer ${TOKEN}` },
      cache: "no-store",
    });
    expect(screen.getByRole("heading", { name: copy.pickup.title })).toBeTruthy();
    await waitFor(async () => expect(await loadPickup(TOKEN)).toEqual({ dueDate: "2026-03-25" }));
  });

  it("online and overdue: banner, days overdue, Puskesmas number and a call link", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonRes({ pickup: { dueDate: "2026-03-17", daysUntil: -3, state: "missed", daysOverdue: 3 } })),
    );
    show("2026-03-20");
    expect(await screen.findByText(copy.pickup.overdueDays(3))).toBeTruthy();
    expect(screen.getByText(copy.contact("Contoh", "021-555-0100"))).toBeTruthy();
    expect(screen.getByRole("link", { name: copy.call }).getAttribute("href")).toBe("tel:0215550100");
  });

  it("offline: counts the kept due date again against the device's date", async () => {
    // Online on 20 March: due 25 March (5 days).
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonRes({ pickup: { dueDate: "2026-03-25", daysUntil: 5, state: "upcoming", daysOverdue: 0 } })),
    );
    const first = show("2026-03-20");
    await screen.findByText("Ambil obat 5 hari lagi");
    await waitFor(async () => expect(await loadPickup(TOKEN)).not.toBeNull());
    first.unmount();

    // Offline two days later: the countdown moved, with the due date on the card.
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    show("2026-03-22");
    expect(await screen.findByText("Ambil obat 3 hari lagi")).toBeTruthy();
    expect(screen.getByText(/Jadwal: Rabu, 25 Maret 2026/)).toBeTruthy();
    cleanup();

    // Offline on 24 March: the nudge appears, tomorrow.
    show("2026-03-24");
    expect(await screen.findByText(copy.pickup.tomorrow)).toBeTruthy();
    expect(screen.getByText(copy.pickup.nudgeTitle)).toBeTruthy();
    cleanup();

    // Offline on 27 March: overdue.
    show("2026-03-27");
    expect(await screen.findByText(copy.pickup.overdueDays(2))).toBeTruthy();
  });

  it("shows nothing when no pickup is scheduled, and nothing offline with nothing kept", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonRes({ pickup: null, contact: {} })));
    const { container, unmount } = show("2026-03-20");
    await waitFor(async () => expect(await loadPickup(TOKEN)).toEqual({ dueDate: null }));
    expect(container.textContent).toBe("");
    unmount();

    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    const offline = show("2026-03-20");
    await new Promise((r) => setTimeout(r, 50));
    expect(offline.container.textContent).toBe("");
  });

  it("a rejected request (revoked link, no consent) falls back to what is kept, never to an error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonRes({ error: "not found" }, 404)));
    const { container } = show("2026-03-20");
    await new Promise((r) => setTimeout(r, 50));
    expect(container.textContent).toBe("");
  });
});
