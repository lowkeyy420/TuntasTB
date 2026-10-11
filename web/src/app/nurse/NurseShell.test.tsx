// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { copy } from "@/copy/nurse.id";

let pathname = "/nurse/patients";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn() }),
}));

import { NurseShell } from "@/app/nurse/NurseShell";

const alertItem = (id: string, acknowledged = false) => ({
  id,
  patientId: `p-${id}`,
  code: `KODE-${id}`,
  day: 9,
  flags: ["Penglihatan kabur"],
  time: "07.42",
  createdAt: `2026-03-20T00:4${id.length}:00.000Z`,
  acknowledged,
  acknowledgedBy: acknowledged ? "x@y.id" : null,
  acknowledgedAt: acknowledged ? "2026-03-20T00:50:00.000Z" : null,
  acknowledgedTime: acknowledged ? "07.50" : null,
});

let alertsOnServer: ReturnType<typeof alertItem>[];

beforeEach(() => {
  pathname = "/nurse/patients";
  alertsOnServer = [];
  // No EventSource: the console polls, which is all this test needs.
  vi.stubGlobal("EventSource", undefined);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ alerts: alertsOnServer }), { status: 200 })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("nurse console frame (nurse-queue 4.3)", () => {
  it("links to the queue and the alerts next to the patient list", async () => {
    render(<NurseShell>halaman</NurseShell>);
    const nav = screen.getByRole("navigation", { name: copy.nav.label });
    const hrefs = Array.from(nav.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/nurse", "/nurse/queue", "/nurse/alerts", "/nurse/patients", "/design"]);
    expect(screen.getByText("halaman")).toBeTruthy();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
  });

  it("shows no banner and no badge while every alert is taken", async () => {
    alertsOnServer = [alertItem("a", true)];
    render(<NurseShell>x</NurseShell>);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps an unacknowledged alert visible on any other page, with the count, until it is taken", async () => {
    alertsOnServer = [alertItem("a"), alertItem("bb")];
    render(<NurseShell>daftar pasien</NurseShell>);
    const banner = await screen.findByRole("alert");
    expect(banner.textContent).toContain(copy.alerts.banner.count(2));
    expect(banner.querySelector("a")!.getAttribute("href")).toBe("/nurse/alerts");
    expect(screen.getByRole("img", { name: copy.alerts.open(2) }).textContent).toBe("2");
  });

  it("says '1 peringatan' for one, and hides the banner on the inbox page itself (it has its own header)", async () => {
    alertsOnServer = [alertItem("a")];
    const { unmount } = render(<NurseShell>x</NurseShell>);
    expect((await screen.findByRole("alert")).textContent).toContain("1 peringatan MERAH belum ditanggapi");
    unmount();

    pathname = "/nurse/alerts";
    render(<NurseShell>x</NurseShell>);
    await waitFor(() => expect(screen.getByRole("img", { name: copy.alerts.open(1) })).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
