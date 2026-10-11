// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { copy } from "@/copy/family.id";
import { findRulesDir, readRuleJson } from "@/lib/triage/loadFiles";
import { closeDb, DB_NAME } from "@/lib/offline/idb";
import { FamilyGate } from "./FamilyGate";

const TOKEN = "T".repeat(43);
const bundle = {
  version: "t",
  table: readRuleJson(findRulesDir(), "triage-table.json"),
  lexicon: readRuleJson(findRulesDir(), "lexicon.id.json"),
};
const session = { consented: true, treatmentDay: 5, puskesmasName: "Demo", puskesmasPhone: "021-555" };

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

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

describe("opening the link without a connection (6.1 at component level)", () => {
  it("shows the usable check-in screen from what the device kept after an online visit", async () => {
    // Online visit: session and rules are fetched and kept on the device.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => (url === "/api/family/session" ? jsonRes(session) : jsonRes(bundle))),
    );
    const first = render(<FamilyGate token={TOKEN} />);
    await screen.findAllByRole("checkbox");
    first.unmount();

    // Later, no signal at all.
    const offline = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", offline);
    render(<FamilyGate token={TOKEN} />);

    expect(await screen.findByText(copy.home.todayPrompt)).toBeTruthy();
    expect((await screen.findAllByRole("checkbox")).length).toBeGreaterThan(0);
    expect(screen.getByRole("group", { name: copy.checkin.doseQuestion })).toBeTruthy();
    expect(screen.getByText(copy.home.dayLabel(5))).toBeTruthy();
  });

  it("does not open a link that was never opened online", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    render(<FamilyGate token={TOKEN} />);
    await screen.findByText(copy.loadFailedTitle);
    expect(screen.queryByText(copy.home.todayPrompt)).toBeNull();
  });

  it("does not skip consent offline: a link not yet agreed to shows the error page", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonRes({ ...session, consented: false })));
    const first = render(<FamilyGate token={TOKEN} />);
    await screen.findByRole("button", { name: copy.consent.agree });
    first.unmount();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    render(<FamilyGate token={TOKEN} />);
    await screen.findByText(copy.loadFailedTitle);
  });
});
