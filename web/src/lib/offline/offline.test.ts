import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/copy/family.id";
import type { CheckinReply } from "@/lib/checkin/reply";
import { findRulesDir, loadRulesFromDir, readRuleJson } from "@/lib/triage/loadFiles";
import type { Lexicon, TriageTable } from "@/lib/triage/types";
import { closeDb, DB_NAME } from "./idb";
import { addEntry, countQueued, getEntry, listQueued, markSent, type OutboxEntry } from "./outbox";
import {
  compileBundle,
  loadRuleBundle,
  loadSession,
  saveRuleBundle,
  saveSession,
  type RuleBundle,
} from "./cache";
import { displayFromServer, provisionalReply, type DisplayReply } from "./provisional";
import { flush, newClientId, onOutboxChange, submit, type SubmitArgs } from "./sync";
import { loadRulesForScreen } from "./rules";

const rules = loadRulesFromDir();
const contact = { name: "Demo", phone: "021-5550123" };
const TOKEN_A = "A".repeat(43);
const TOKEN_B = "B".repeat(43);

const provisional: DisplayReply = {
  level: "GREEN",
  explanation: "x",
  action: "y",
  sourceLabel: null,
  contactLine: "z",
  warning: null,
};

function reply(over: Partial<CheckinReply> = {}): CheckinReply {
  return {
    checkinId: "c1",
    level: "GREEN",
    message: "Keluhan ini umum.",
    action: "Tetap minum obat sesuai jadwal.",
    citations: [{ id: "efek-samping-ringan#umum", label: "Panduan" }],
    contact,
    fallbackUsed: true,
    warning: rules.table.fallback_warning_id,
    ...over,
  };
}

const ok = (body: CheckinReply) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const status = (code: number) => new Response("{}", { status: code });

function args(over: Partial<SubmitArgs> = {}): SubmitArgs {
  return {
    token: TOKEN_A,
    doseStatus: "yes",
    chips: ["nausea_mild"],
    text: "mual",
    rules,
    contact,
    ...over,
  };
}

function entry(over: Partial<OutboxEntry> = {}): OutboxEntry {
  return {
    clientId: newClientId(),
    token: TOKEN_A,
    occurredOn: "2026-03-18",
    payload: { clientId: "x", doseStatus: "yes", chips: [], text: "" },
    status: "queued",
    createdAt: Date.now(),
    provisional,
    reply: null,
    sentAt: null,
    ...over,
  };
}

beforeEach(async () => {
  await closeDb();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("outbox (6.2)", () => {
  it("adds, lists queued entries oldest first, and marks one sent", async () => {
    const a = entry({ createdAt: 2 });
    const b = entry({ createdAt: 1 });
    await addEntry(a);
    await addEntry(b);
    expect((await listQueued()).map((e) => e.clientId)).toEqual([b.clientId, a.clientId]);
    expect(await countQueued()).toBe(2);

    await markSent(a.clientId, reply(), 99);
    const sent = await getEntry(a.clientId);
    expect(sent).toMatchObject({ status: "sent", token: null, payload: null, sentAt: 99 });
    expect(sent?.reply?.level).toBe("GREEN");
    expect((await listQueued()).map((e) => e.clientId)).toEqual([b.clientId]);
  });

  it("keeps unsent entries across a simulated reload", async () => {
    const e = entry({ payload: { clientId: "x", doseStatus: "no", chips: ["jaundice"], text: "matanya kuning" } });
    await addEntry(e);
    await closeDb(); // the page is closed...
    const [back] = await listQueued(); // ...and opened again
    expect(back).toMatchObject({ clientId: e.clientId, status: "queued", token: TOKEN_A });
    expect(back.payload?.text).toBe("matanya kuning");
  });

  it("marking an unknown entry sent changes nothing, and old sent entries are pruned", async () => {
    await markSent("missing", reply(), 1);
    expect(await countQueued()).toBe(0);
    const ids: string[] = [];
    for (let i = 0; i < 23; i++) {
      const e = entry({ createdAt: i });
      ids.push(e.clientId);
      await addEntry(e);
      await markSent(e.clientId, reply(), i);
    }
    const present = await Promise.all(ids.map(async (id) => (await getEntry(id)) !== undefined));
    // The three oldest sent entries were pruned, the newest 20 kept.
    expect(present.slice(0, 3)).toEqual([false, false, false]);
    expect(present.filter(Boolean)).toHaveLength(20);
  });
});
describe("cache of rules and session (6.2)", () => {
  const bundle: RuleBundle = {
    version: rules.version,
    table: readRuleJson(findRulesDir(), "triage-table.json") as TriageTable,
    lexicon: readRuleJson(findRulesDir(), "lexicon.id.json") as Lexicon,
  };

  it("stores the rule bundle and compiles it back into working rules", async () => {
    expect(await loadRuleBundle()).toBeNull();
    await saveRuleBundle(bundle);
    const back = await loadRuleBundle();
    expect(back?.version).toBe(bundle.version);
    expect(compileBundle(back as RuleBundle)?.table.symptoms.length).toBe(rules.table.symptoms.length);
  });

  it("rejects a bundle that is not valid rules", () => {
    expect(compileBundle({ ...bundle, table: { ...bundle.table, symptoms: [] } })).toBeNull();
  });

  it("moves the cached treatment day forward by the days since it was saved", async () => {
    const session = { consented: true, treatmentDay: 18, puskesmasName: "Demo", puskesmasPhone: "021" };
    await saveSession(TOKEN_A, session, 1000);
    expect(await loadSession(TOKEN_A, () => 2)).toEqual({ ...session, treatmentDay: 20 });
    expect(await loadSession(TOKEN_A, () => -3)).toEqual(session);
    expect(await loadSession(TOKEN_B, () => 0)).toBeNull();
  });

  it("screen rules come from the network and are cached, or from the cache when offline", async () => {
    const online = vi.fn(async () => new Response(JSON.stringify(bundle), { status: 200 }));
    const fromNet = await loadRulesForScreen(TOKEN_A, online as unknown as typeof fetch);
    expect(fromNet?.table.symptoms.length).toBeGreaterThan(0);
    expect(online).toHaveBeenCalledWith(
      "/api/family/rules",
      expect.objectContaining({ headers: { authorization: `Bearer ${TOKEN_A}` } }),
    );

    const offline = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const fromCache = await loadRulesForScreen(TOKEN_A, offline as unknown as typeof fetch);
    expect(fromCache?.table.symptoms.length).toBe(fromNet?.table.symptoms.length);

    // A bad response falls back to the cache too.
    const broken = vi.fn(async () => status(500));
    expect(await loadRulesForScreen(TOKEN_A, broken as unknown as typeof fetch)).not.toBeNull();
  });

  it("returns null with no connection and nothing cached", async () => {
    const offline = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await loadRulesForScreen(TOKEN_A, offline as unknown as typeof fetch)).toBeNull();
  });
});

describe("submit and flush (6.3)", () => {
  it("writes to the outbox first, then sends; success marks it sent and drops the text and token", async () => {
    const seen: boolean[] = [];
    const fetchFn = vi.fn(async (_url: string, init: RequestInit) => {
      // By the time the request is made the entry is already on the device.
      const body = JSON.parse(init.body as string);
      seen.push((await getEntry(body.clientId))?.status === "queued");
      return ok(reply());
    });
    const out = await submit(args(), { fetchFn: fetchFn as unknown as typeof fetch });
    expect(out.kind).toBe("sent");
    expect(seen).toEqual([true]);
    const [, init] = fetchFn.mock.calls[0];
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${TOKEN_A}`);
    const body = JSON.parse(init.body as string);
    expect(Object.keys(body).sort()).toEqual(["chips", "clientId", "doseStatus", "occurredOn", "text"]);
    const stored = await getEntry(body.clientId);
    expect(stored).toMatchObject({ status: "sent", token: null, payload: null });
  });

  it("a network failure leaves the entry queued with a provisional reply; a later flush marks it sent", async () => {
    const down = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const out = await submit(args(), { fetchFn: down as unknown as typeof fetch });
    expect(out.kind).toBe("queued");
    expect(await countQueued()).toBe(1);

    const up = vi.fn(async () => ok(reply({ checkinId: "server-1" })));
    const result = await flush({ fetchFn: up as unknown as typeof fetch });
    expect(result).toEqual({ sent: 1, remaining: 0 });
    expect(await countQueued()).toBe(0);
    const clientId = (out as { clientId: string }).clientId;
    expect((await getEntry(clientId))?.reply?.checkinId).toBe("server-1");
  });

  it("a server error (5xx) keeps it queued; the same client id is sent again on retry", async () => {
    const broken = vi.fn(async () => status(503));
    const out = await submit(args(), { fetchFn: broken as unknown as typeof fetch });
    expect(out.kind).toBe("queued");
    const sent: string[] = [];
    const up = vi.fn(async (_u: string, init: RequestInit) => {
      sent.push(JSON.parse(init.body as string).clientId);
      return ok(reply());
    });
    await flush({ fetchFn: up as unknown as typeof fetch });
    expect(sent).toEqual([(out as { clientId: string }).clientId]);
  });

  it("flushes oldest first, each with its own token, and stops at the first failure", async () => {
    await addEntry(entry({ clientId: "old", token: TOKEN_A, createdAt: 1, payload: { clientId: "old", doseStatus: "yes" } }));
    await addEntry(entry({ clientId: "new", token: TOKEN_B, createdAt: 2, payload: { clientId: "new", doseStatus: "no" } }));
    const calls: string[] = [];
    const partial = vi.fn(async (_u: string, init: RequestInit) => {
      const h = init.headers as Record<string, string>;
      calls.push(`${JSON.parse(init.body as string).clientId}:${h.authorization.slice(7, 8)}`);
      if (calls.length === 1) return ok(reply());
      throw new TypeError("Failed to fetch");
    });
    expect(await flush({ fetchFn: partial as unknown as typeof fetch })).toEqual({ sent: 1, remaining: 1 });
    expect(calls).toEqual(["old:A", "new:B"]);
    expect((await listQueued()).map((e) => e.clientId)).toEqual(["new"]);
  });

  it("drops entries that cannot be sent, and ones the server refuses for good", async () => {
    await addEntry(entry({ clientId: "no-token", token: null, createdAt: 1 }));
    await addEntry(entry({ clientId: "revoked", createdAt: 2, payload: { clientId: "revoked", doseStatus: "yes" } }));
    const refuse = vi.fn(async () => status(404));
    expect(await flush({ fetchFn: refuse as unknown as typeof fetch })).toEqual({ sent: 0, remaining: 0 });
    expect(await countQueued()).toBe(0);
    expect(refuse).toHaveBeenCalledTimes(1);
  });

  it("a 429 or 400 is rejected for good and not kept", async () => {
    const tooMany = vi.fn(async () => status(429));
    const a = await submit(args(), { fetchFn: tooMany as unknown as typeof fetch });
    expect(a).toMatchObject({ kind: "rejected", reason: "too_many" });
    const bad = vi.fn(async () => status(400));
    const b = await submit(args(), { fetchFn: bad as unknown as typeof fetch });
    expect(b).toMatchObject({ kind: "rejected", reason: "invalid" });
    expect(await countQueued()).toBe(0);
  });

  it("overlapping flushes share one run", async () => {
    await addEntry(entry({ clientId: "one", payload: { clientId: "one", doseStatus: "yes" } }));
    const up = vi.fn(async () => ok(reply()));
    const [a, b] = await Promise.all([
      flush({ fetchFn: up as unknown as typeof fetch }),
      flush({ fetchFn: up as unknown as typeof fetch }),
    ]);
    expect(a).toBe(b);
    expect(up).toHaveBeenCalledTimes(1);
  });

  it("flushing an empty outbox sends nothing", async () => {
    const up = vi.fn();
    expect(await flush({ fetchFn: up as unknown as typeof fetch })).toEqual({ sent: 0, remaining: 0 });
    expect(up).not.toHaveBeenCalled();
  });

  it("an unreadable success body is retried, not lost", async () => {
    const garbled = vi.fn(async () => new Response("not json", { status: 200 }));
    const out = await submit(args(), { fetchFn: garbled as unknown as typeof fetch });
    expect(out.kind).toBe("queued");
  });

  it("tells listeners when the outbox changed", async () => {
    const listener = vi.fn();
    const off = onOutboxChange(listener);
    await submit(args(), { fetchFn: (async () => ok(reply())) as unknown as typeof fetch });
    expect(listener).toHaveBeenCalled();
    off();
    listener.mockClear();
    await submit(args(), { fetchFn: (async () => ok(reply())) as unknown as typeof fetch });
    expect(listener).not.toHaveBeenCalled();
  });

  it("without IndexedDB it still sends, and reports failure when the network is down too", async () => {
    vi.stubGlobal("indexedDB", undefined);
    const up = vi.fn(async () => ok(reply()));
    expect((await submit(args(), { fetchFn: up as unknown as typeof fetch })).kind).toBe("sent");
    const down = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect((await submit(args(), { fetchFn: down as unknown as typeof fetch })).kind).toBe("failed");
    expect(await flush({ fetchFn: up as unknown as typeof fetch })).toEqual({ sent: 0, remaining: 0 });
  });

  it("dates the check-in with the Jakarta day of the device clock", async () => {
    const up = vi.fn(async () => ok(reply()));
    // 23:30 UTC on 17 March is already 18 March in Jakarta.
    await submit(args(), { fetchFn: up as unknown as typeof fetch, now: () => Date.parse("2026-03-17T23:30:00Z") });
    const init = (up.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(init.body as string).occurredOn).toBe("2026-03-18");
  });

  it("generates well-formed ids even without crypto.randomUUID", () => {
    vi.stubGlobal("crypto", { getRandomValues: (a: Uint8Array) => a.fill(7) });
    expect(newClientId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe("provisional reply (6.4)", () => {
  const run = (text: string, chips: string[] = [], doseStatus: "yes" | "no" | "partial" = "yes") =>
    provisionalReply({ doseStatus, chips, text }, rules, contact);

  it("offline RED: go today, the nurse has not been told, and the number to call", () => {
    const r = run("matanya kuning");
    expect(r.level).toBe("RED");
    expect(r.action).toBe("Segera ke Puskesmas atau IGD hari ini.");
    expect(r.explanation).toBe("Laporan ini belum sampai ke perawat.");
    expect(r.contactLine).toBe("Telepon Puskesmas: 021-5550123.");
    // Together they read exactly as the specified text.
    expect(`${r.action} ${r.explanation} ${r.contactLine}`).toBe(copy.reply.offline.redAction + " " + copy.reply.offline.redNotice + " " + copy.reply.offline.redCall("021-5550123"));
    expect(JSON.stringify(r)).not.toMatch(/sudah diberi tahu/);
  });

  it("RED from a chip alone is also RED", () => {
    expect(run("", ["jaundice"]).level).toBe("RED");
  });

  it("non-RED carries the standing warning, the level's text and a source", () => {
    for (const [text, chips, level] of [
      ["kencingnya merah", [], "GREEN"],
      ["", ["tingling_feet"], "YELLOW"],
      ["", [], "GREEN"],
    ] as const) {
      const r = run(text, [...chips]);
      expect(r.level).toBe(level);
      expect(r.warning).toBe("Kalau ada mata/kulit kuning, ruam, atau gangguan penglihatan, segera ke Puskesmas.");
      expect(r.action).toBe(rules.table.levels[level].action_id);
      expect(r.sourceLabel).not.toBeNull();
      expect(r.contactLine).toBe("Puskesmas Demo, telepon 021-5550123.");
    }
  });

  it("stop intent on YELLOW says not to stop yet", () => {
    const r = run("mual terus seminggu, mau berhenti", ["nausea_mild"]);
    expect(r.level).toBe("YELLOW");
    expect(r.action).toMatch(/^Jangan berhenti dulu/);
  });

  it("no provisional reply contains 'aman'", () => {
    for (const text of ["matanya kuning", "kencingnya merah", "mual", "", "sesuatu yang aneh"]) {
      for (const doseStatus of ["yes", "no", "partial"] as const) {
        expect(JSON.stringify(run(text, [], doseStatus))).not.toMatch(/\baman\b/i);
      }
    }
  });

  it("a server reply is shown as the server wrote it", () => {
    const shown = displayFromServer(reply({ level: "YELLOW", message: "M", action: "A" }));
    expect(shown).toMatchObject({
      level: "YELLOW",
      explanation: "M",
      action: "A",
      sourceLabel: "Panduan",
      contactLine: "Puskesmas Demo, telepon 021-5550123.",
    });
    expect(displayFromServer(reply({ citations: [] })).sourceLabel).toBeNull();
  });
});
