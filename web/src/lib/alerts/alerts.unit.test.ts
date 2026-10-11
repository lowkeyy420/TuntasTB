import { describe, expect, it, vi } from "vitest";
import { AlertRegistry, alertRegistry } from "./registry";
import { parseAlertEvent, type AlertEvent } from "./notify";
import { alertStream, sseFrame } from "./stream";
import { flagLabels, type AlertItem } from "./service";

const PK_A = "11111111-1111-4111-8111-111111111111";
const PK_B = "22222222-2222-4222-8222-222222222222";
const ALERT = "33333333-3333-4333-8333-333333333333";
const created = (puskesmasId = PK_A): AlertEvent => ({ type: "alert.created", alertId: ALERT, puskesmasId });

describe("AlertRegistry (nurse-queue 3.2)", () => {
  it("delivers an event to every subscriber of the matching Puskesmas only", () => {
    const registry = new AlertRegistry();
    const a1 = vi.fn();
    const a2 = vi.fn();
    const b = vi.fn();
    registry.subscribe(PK_A, a1);
    registry.subscribe(PK_A, a2);
    registry.subscribe(PK_B, b);
    expect(registry.publish(created(PK_A))).toBe(2);
    expect(a1).toHaveBeenCalledWith(created(PK_A));
    expect(a2).toHaveBeenCalledOnce();
    expect(b).not.toHaveBeenCalled();
  });

  it("stops delivering after unsubscribe and drops empty Puskesmas entries", () => {
    const registry = new AlertRegistry();
    const fn = vi.fn();
    const off = registry.subscribe(PK_A, fn);
    expect(registry.size(PK_A)).toBe(1);
    off();
    off(); // unsubscribing twice is harmless
    expect(registry.size(PK_A)).toBe(0);
    expect(registry.publish(created())).toBe(0);
    expect(fn).not.toHaveBeenCalled();
  });

  it("keeps delivering when one subscriber throws", () => {
    const registry = new AlertRegistry();
    const ok = vi.fn();
    registry.subscribe(PK_A, () => {
      throw new Error("broken stream");
    });
    registry.subscribe(PK_A, ok);
    expect(registry.publish(created())).toBe(1);
    expect(ok).toHaveBeenCalledOnce();
  });

  it("publishing to a Puskesmas nobody listens to reaches no one", () => {
    expect(new AlertRegistry().publish(created())).toBe(0);
  });

  it("the process-wide registry is a singleton", () => {
    expect(alertRegistry()).toBe(alertRegistry());
  });
});

describe("parseAlertEvent", () => {
  it("accepts a well-formed event and rejects everything else", () => {
    expect(parseAlertEvent(JSON.stringify(created()))).toEqual(created());
    expect(parseAlertEvent(JSON.stringify({ ...created(), type: "alert.acknowledged" }))?.type).toBe("alert.acknowledged");
    for (const bad of [
      "not json",
      "null",
      JSON.stringify({ ...created(), type: "other" }),
      JSON.stringify({ ...created(), alertId: "x" }),
      JSON.stringify({ ...created(), puskesmasId: 5 }),
      JSON.stringify({ type: "alert.created" }),
    ]) {
      expect(parseAlertEvent(bad), bad).toBeNull();
    }
  });
});

describe("flagLabels", () => {
  const table = {
    symptoms: [
      { code: "jaundice", level: "RED" as const, label_id: "Mata atau kulit kuning" },
      { code: "vision_change", level: "RED" as const, label_id: "Penglihatan kabur" },
      { code: "nausea_mild", level: "GREEN" as const, label_id: "Mual" },
    ],
  };

  it("lists the RED codes found in red flags, symptoms or chips, in table order", () => {
    expect(
      flagLabels({ chips: ["nausea_mild", "vision_change"], symptoms: ["nausea_mild"], redFlags: ["jaundice"] }, null, table),
    ).toEqual(["Mata atau kulit kuning", "Penglihatan kabur"]);
  });

  it("says so when a nurse override raised the level and nothing else is known", () => {
    expect(flagLabels({ chips: ["nausea_mild"] }, "RED", table)).toEqual(["Level dinaikkan oleh perawat"]);
  });

  it("falls back to a generic label for an old row or a missing payload", () => {
    expect(flagLabels(null, null, table)).toEqual(["Tanda bahaya (lihat riwayat)"]);
    expect(flagLabels({ symptoms: [1, "nausea_mild"], chips: "x" }, null, table)).toEqual(["Tanda bahaya (lihat riwayat)"]);
  });
});

describe("alertStream (unit)", () => {
  const item = (id: string): AlertItem => ({
    id,
    patientId: "p",
    code: "KODE-1",
    day: 9,
    flags: ["Penglihatan kabur"],
    time: "07.42",
    createdAt: "2026-03-20T00:42:00.000Z",
    acknowledged: false,
    acknowledgedBy: null,
    acknowledgedAt: null,
    acknowledgedTime: null,
  });

  /** Reads chunks until `until` matches the text so far; fails after `ms`. */
  async function readText(reader: ReadableStreamDefaultReader<Uint8Array>, until: RegExp, ms = 1000): Promise<string> {
    const decoder = new TextDecoder();
    let text = "";
    const deadline = Date.now() + ms;
    while (!until.test(text)) {
      if (Date.now() > deadline) throw new Error(`timeout waiting for ${until}; got:\n${text}`);
      const next = await Promise.race([
        reader.read(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 50)),
      ]);
      if (next === null) continue;
      if (next.done) throw new Error(`stream ended before ${until}; got:\n${text}`);
      text += decoder.decode(next.value);
    }
    return text;
  }

  it("sends the snapshot first, then events for its Puskesmas only, then cleans up on abort", async () => {
    const registry = new AlertRegistry();
    const controller = new AbortController();
    const stream = alertStream({
      puskesmasId: PK_A,
      registry,
      loadOpen: async () => [item("old")],
      loadOne: async (id) => item(id),
      signal: controller.signal,
    });
    const reader = stream.getReader();
    const first = await readText(reader, /alerts\.snapshot[\s\S]*\n\n/);
    expect(first).toContain("retry: 3000");
    expect(first).toContain('event: alerts.snapshot\ndata: {"alerts":[{"id":"old"');
    expect(registry.size(PK_A)).toBe(1);

    registry.publish(created(PK_B)); // another Puskesmas: never streamed
    registry.publish({ type: "alert.created", alertId: "new", puskesmasId: PK_A });
    registry.publish({ type: "alert.acknowledged", alertId: "new", puskesmasId: PK_A });
    const rest = await readText(reader, /alert\.acknowledged/);
    expect(rest.match(/event: alert\.(created|acknowledged)/g)).toEqual(["event: alert.created", "event: alert.acknowledged"]);
    expect(rest).not.toContain(ALERT);

    controller.abort();
    expect(registry.size(PK_A)).toBe(0);
    expect((await reader.read()).done).toBe(true);
  });

  it("holds events that arrive while the snapshot is loading and sends them after it", async () => {
    const registry = new AlertRegistry();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const stream = alertStream({
      puskesmasId: PK_A,
      registry,
      loadOpen: async () => {
        await gate;
        return [];
      },
      loadOne: async (id) => item(id),
    });
    const reader = stream.getReader();
    await readText(reader, /connected/);
    registry.publish({ type: "alert.created", alertId: "during", puskesmasId: PK_A });
    release();
    const text = await readText(reader, /alert\.created/);
    expect(text.indexOf("alerts.snapshot")).toBeLessThan(text.indexOf("event: alert.created"));
    await reader.cancel();
    expect(registry.size(PK_A)).toBe(0);
  });

  it("sends a heartbeat comment while idle", async () => {
    const stream = alertStream({
      puskesmasId: PK_A,
      registry: new AlertRegistry(),
      loadOpen: async () => [],
      loadOne: async () => null,
      heartbeatMs: 20,
    });
    const reader = stream.getReader();
    expect(await readText(reader, /: ping/)).toContain(": ping");
    await reader.cancel();
  });

  it("skips an event whose alert is gone, and closes if the snapshot cannot be read", async () => {
    const registry = new AlertRegistry();
    const gone = alertStream({
      puskesmasId: PK_A,
      registry,
      loadOpen: async () => [],
      loadOne: async () => null,
    });
    const r1 = gone.getReader();
    await readText(r1, /alerts\.snapshot/);
    registry.publish(created());
    registry.publish({ type: "alert.created", alertId: "x", puskesmasId: PK_A });
    await new Promise((r) => setTimeout(r, 30));
    await r1.cancel();

    const broken = alertStream({
      puskesmasId: PK_A,
      registry,
      loadOpen: async () => {
        throw new Error("db down");
      },
      loadOne: async () => null,
    });
    const r2 = broken.getReader();
    const chunks: string[] = [];
    for (;;) {
      const { value, done } = await r2.read();
      if (done) break;
      chunks.push(new TextDecoder().decode(value));
    }
    expect(chunks.join("")).not.toContain("alerts.snapshot");
    expect(registry.size(PK_A)).toBe(0);
  });

  it("an already aborted request opens nothing", async () => {
    const registry = new AlertRegistry();
    const controller = new AbortController();
    controller.abort();
    const reader = alertStream({
      puskesmasId: PK_A,
      registry,
      loadOpen: async () => [],
      loadOne: async () => null,
      signal: controller.signal,
    }).getReader();
    expect((await reader.read()).done).toBe(true);
    expect(registry.size(PK_A)).toBe(0);
  });

  it("frames follow the server-sent events format", () => {
    expect(sseFrame("alert.created", { a: 1 })).toBe('event: alert.created\ndata: {"a":1}\n\n');
  });
});
