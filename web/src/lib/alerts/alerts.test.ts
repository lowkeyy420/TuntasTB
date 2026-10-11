import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";
import { dbFixtures } from "@/test-utils/dbFixtures";
import type { Database } from "@/lib/db";
import { ALERT_CHANNEL, notifyAlert, parseAlertEvent, type AlertEvent } from "./notify";

/**
 * Database-backed tests of alert delivery (nurse-queue 3.1, 3.3, 3.4, 4.1, 4.2).
 * Run only when TEST_DATABASE_URL points at a migrated Postgres.
 */
const url = process.env.TEST_DATABASE_URL;
const SECRET = "s".repeat(48);

process.env.SESSION_SECRET = SECRET;
process.env.HASH_PEPPER = "p".repeat(48);
process.env.APP_BASE_URL = "http://localhost:3000";
process.env.DATABASE_URL = url ?? "postgres://localhost:5432/none";

type Handler = (req: Request) => Promise<Response>;
type CtxHandler = (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!url)("alert delivery (database)", () => {
  const fx = dbFixtures(url ?? "postgres://unused");
  const db = fx.d as unknown as Database;
  const listenerClient = postgres(url ?? "postgres://unused", { max: 1 });
  const heard: AlertEvent[] = [];
  let unlisten: () => Promise<void>;

  let pkA: string;
  let pkB: string;
  let nurseA1: string;
  let nurseA2: string;
  let nurseB: string;
  let cookie: Record<string, string> = {};
  let listRoute: { GET: Handler };
  let ackRoute: { POST: CtxHandler };
  let streamRoute: { GET: Handler };
  let checkinsRoute: { POST: Handler };
  let tokens: typeof import("@/lib/family-token");

  const req = (path: string, who: string | null, init: RequestInit = {}) =>
    new Request(`http://localhost${path}`, {
      ...init,
      headers: { ...(who ? { cookie: cookie[who] } : {}), ...(init.headers as Record<string, string> | undefined) },
    });

  async function newPatient(puskesmasId: string) {
    const token = tokens.generateFamilyToken();
    const p = await fx.patient(puskesmasId, { familyTokenHash: tokens.hashFamilyToken(token), startDate: "2026-03-01" });
    return { id: p.id, token, code: p.code };
  }

  const redCheckin = (token: string, text = "matanya kuning") =>
    checkinsRoute.POST(
      new Request("http://localhost/api/checkins", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ clientId: crypto.randomUUID(), doseStatus: "yes", chips: [], text }),
      }),
    );

  beforeAll(async () => {
    const listener = await listenerClient.listen(ALERT_CHANNEL, (payload) => {
      const event = parseAlertEvent(payload);
      if (event && (event.puskesmasId === pkA || event.puskesmasId === pkB)) heard.push(event);
    });
    unlisten = () => listener.unlisten();

    tokens = await import("@/lib/family-token");
    const { createSession } = await import("@/lib/auth/session");
    pkA = (await fx.puskesmas("A")).id;
    pkB = (await fx.puskesmas("B")).id;
    nurseA1 = (await fx.nurse(pkA)).id;
    nurseA2 = (await fx.nurse(pkA)).id;
    nurseB = (await fx.nurse(pkB)).id;
    cookie = {
      a1: `session=${await createSession({ nurseId: nurseA1, puskesmasId: pkA }, SECRET)}`,
      a2: `session=${await createSession({ nurseId: nurseA2, puskesmasId: pkA }, SECRET)}`,
      b: `session=${await createSession({ nurseId: nurseB, puskesmasId: pkB }, SECRET)}`,
    };
    listRoute = await import("@/app/api/nurse/alerts/route");
    ackRoute = await import("@/app/api/nurse/alerts/[id]/ack/route");
    streamRoute = await import("@/app/api/nurse/alerts/stream/route");
    checkinsRoute = await import("@/app/api/checkins/route");
  });

  afterAll(async () => {
    await unlisten?.();
    await listenerClient.end();
    const { ensureAlertListener } = await import("./listener");
    await (await ensureAlertListener(url ?? "")).stop().catch(() => undefined);
    await fx.cleanup();
  });

  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

  describe("pg_notify (3.1)", () => {
    it("announces a committed RED check-in, with ids only", async () => {
      const p = await newPatient(pkA);
      heard.length = 0;
      const res = await redCheckin(p.token);
      expect((await res.json()).level).toBe("RED");
      await sleep(300);
      const [alert] = await fx.d.select().from(schema.alerts).where(eq(schema.alerts.patientId, p.id));
      expect(heard).toEqual([{ type: "alert.created", alertId: alert.id, puskesmasId: pkA }]);
    });

    it("never announces an alert whose transaction rolled back", async () => {
      heard.length = 0;
      await expect(
        db.transaction(async (tx) => {
          await notifyAlert(tx, { type: "alert.created", alertId: crypto.randomUUID(), puskesmasId: pkA });
          throw new Error("rolled back");
        }),
      ).rejects.toThrow("rolled back");
      await sleep(300);
      expect(heard).toEqual([]);
    });

    it("a GREEN check-in announces nothing", async () => {
      const p = await newPatient(pkA);
      heard.length = 0;
      await redCheckin(p.token, "tidak ada keluhan");
      await sleep(300);
      expect(heard).toEqual([]);
    });
  });

  describe("GET /api/nurse/alerts (3.4)", () => {
    it("needs a session, rejects an unknown status, lists open then acknowledged, scoped to the Puskesmas", async () => {
      expect((await listRoute.GET(req("/api/nurse/alerts", null))).status).toBe(401);
      expect((await listRoute.GET(req("/api/nurse/alerts?status=bogus", "a1"))).status).toBe(400);

      const mine = await newPatient(pkA);
      const theirs = await newPatient(pkB);
      await redCheckin(mine.token, "pandangan buram dan matanya kuning");
      await redCheckin(theirs.token);

      const open = await (await listRoute.GET(req("/api/nurse/alerts?status=open", "a1"))).json();
      const mineOpen = open.alerts.filter((a: { patientId: string }) => a.patientId === mine.id);
      expect(mineOpen).toHaveLength(1);
      expect(mineOpen[0]).toMatchObject({
        code: mine.code,
        acknowledged: false,
        acknowledgedBy: null,
        flags: expect.arrayContaining(["Mata atau kulit kuning", "Penglihatan kabur atau warna berubah"]),
      });
      expect(mineOpen[0].day).toBeGreaterThan(0);
      expect(JSON.stringify(open)).not.toMatch(/pmo|contact|hash|textRedacted/i);
      expect(open.alerts.some((a: { patientId: string }) => a.patientId === theirs.id)).toBe(false);

      const none = await (await listRoute.GET(req("/api/nurse/alerts?status=acknowledged", "a1"))).json();
      expect(none.alerts.some((a: { patientId: string }) => a.patientId === mine.id)).toBe(false);

      await ackRoute.POST(req(`/api/nurse/alerts/${mineOpen[0].id}/ack`, "a1", { method: "POST" }), ctx(mineOpen[0].id));
      const acked = await (await listRoute.GET(req("/api/nurse/alerts?status=acknowledged", "a1"))).json();
      expect(acked.alerts.find((a: { id: string }) => a.id === mineOpen[0].id)).toMatchObject({ acknowledged: true });
      const all = await (await listRoute.GET(req("/api/nurse/alerts?status=all", "a1"))).json();
      expect(all.alerts.some((a: { id: string }) => a.id === mineOpen[0].id)).toBe(true);
    });

    it("audits the list as alert.list, except the quiet timer-driven poll", async () => {
      const before = await fx.d.select().from(schema.auditLog).where(eq(schema.auditLog.actor, `nurse:${nurseA2}`));
      await listRoute.GET(req("/api/nurse/alerts?status=open&poll=1", "a2"));
      await listRoute.GET(req("/api/nurse/alerts?status=open", "a2"));
      const after = await fx.d.select().from(schema.auditLog).where(eq(schema.auditLog.actor, `nurse:${nurseA2}`));
      expect(after.length - before.length).toBe(1);
      expect(after.at(-1)).toMatchObject({ action: "alert.list", target: pkA });
    });
  });

  describe("POST /api/nurse/alerts/[id]/ack (4.1, 4.2)", () => {
    async function freshAlert(puskesmasId = pkA) {
      const p = await newPatient(puskesmasId);
      await redCheckin(p.token);
      const [a] = await fx.d.select().from(schema.alerts).where(eq(schema.alerts.patientId, p.id));
      return { ...a, patientCode: p.code };
    }
    const ack = (id: string, who: string | null) =>
      ackRoute.POST(req(`/api/nurse/alerts/${id}/ack`, who, { method: "POST" }), ctx(id));

    it("stores nurse and time, audits it, and notifies", async () => {
      const a = await freshAlert();
      heard.length = 0;
      const res = await ack(a.id, "a1");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.alreadyAcknowledged).toBe(false);
      expect(body.alert).toMatchObject({ id: a.id, acknowledged: true });
      expect(body.alert.acknowledgedBy).toMatch(/@test\.id$/);

      const [row] = await fx.d.select().from(schema.alerts).where(eq(schema.alerts.id, a.id));
      expect(row.acknowledgedBy).toBe(nurseA1);
      expect(row.acknowledgedAt).toBeInstanceOf(Date);

      const log = await fx.d.select().from(schema.auditLog).where(eq(schema.auditLog.target, `alert:${a.id}`));
      expect(log).toHaveLength(1);
      expect(log[0]).toMatchObject({ actor: `nurse:${nurseA1}`, action: "alert.ack" });

      await sleep(300);
      expect(heard).toEqual([{ type: "alert.acknowledged", alertId: a.id, puskesmasId: pkA }]);
    });

    it("keeps the first acknowledgement when a second nurse acknowledges", async () => {
      const a = await freshAlert();
      await ack(a.id, "a1");
      const [first] = await fx.d.select().from(schema.alerts).where(eq(schema.alerts.id, a.id));
      const res = await ack(a.id, "a2");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.alreadyAcknowledged).toBe(true);
      const [second] = await fx.d.select().from(schema.alerts).where(eq(schema.alerts.id, a.id));
      expect(second.acknowledgedBy).toBe(nurseA1);
      expect(second.acknowledgedAt?.getTime()).toBe(first.acknowledgedAt?.getTime());
      const log = await fx.d.select().from(schema.auditLog).where(eq(schema.auditLog.target, `alert:${a.id}`));
      expect(log).toHaveLength(1);
    });

    it("rejects another Puskesmas' nurse, an unknown id and a missing session; the alert is unchanged", async () => {
      const a = await freshAlert();
      expect((await ack(a.id, "b")).status).toBe(404);
      expect((await ack(crypto.randomUUID(), "a1")).status).toBe(404);
      expect((await ack("not-a-uuid", "a1")).status).toBe(404);
      expect((await ack(a.id, null)).status).toBe(401);
      const [row] = await fx.d.select().from(schema.alerts).where(eq(schema.alerts.id, a.id));
      expect(row.acknowledgedAt).toBeNull();
      expect(row.acknowledgedBy).toBeNull();
    });
  });

  describe("GET /api/nurse/alerts/stream (3.3, 4.2)", () => {
    async function open(who: string | null) {
      const res = await streamRoute.GET(req("/api/nurse/alerts/stream", who));
      return res;
    }

    /** Reads frames until one named `event` shows up; returns it with the elapsed time. */
    async function waitForEvent(reader: ReadableStreamDefaultReader<Uint8Array>, event: string, ms: number, state = { text: "" }) {
      const decoder = new TextDecoder();
      const started = Date.now();
      while (Date.now() - started < ms) {
        const next = await Promise.race([reader.read(), sleep(100).then(() => null)]);
        if (next === null) continue;
        if (next.done) throw new Error("stream ended");
        state.text += decoder.decode(next.value);
        const m = new RegExp(`event: ${event}\\ndata: (.*)\\n\\n`).exec(state.text);
        if (m) return { data: JSON.parse(m[1]), elapsed: Date.now() - started };
      }
      throw new Error(`no ${event} within ${ms} ms; got:\n${state.text}`);
    }

    it("needs a session", async () => {
      expect((await open(null)).status).toBe(401);
    });

    it("answers with an event stream and audits one alert.stream_open per connection", async () => {
      const before = (await fx.d.select().from(schema.auditLog).where(eq(schema.auditLog.actor, `nurse:${nurseA1}`))).length;
      const res = await open("a1");
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/event-stream");
      expect(res.headers.get("cache-control")).toContain("no-transform");
      const reader = res.body!.getReader();
      await waitForEvent(reader, "alerts.snapshot", 3000);
      await reader.cancel();
      const log = await fx.d.select().from(schema.auditLog).where(eq(schema.auditLog.actor, `nurse:${nurseA1}`));
      expect(log.length - before).toBe(1);
      expect(log.at(-1)).toMatchObject({ action: "alert.stream_open", target: pkA });
    });

    it("a stored RED check-in appears on the stream within 5 seconds; another Puskesmas hears nothing", async () => {
      const mine = await newPatient(pkA);
      const old = await newPatient(pkA);
      await redCheckin(old.token); // already open when the console connects

      const resA = await open("a1");
      const resB = await open("b");
      const readerA = resA.body!.getReader();
      const readerB = resB.body!.getReader();
      const stateA = { text: "" };
      const stateB = { text: "" };
      const snapshot = await waitForEvent(readerA, "alerts.snapshot", 3000, stateA);
      expect(snapshot.data.alerts.some((a: { patientId: string }) => a.patientId === old.id)).toBe(true);
      await waitForEvent(readerB, "alerts.snapshot", 3000, stateB);

      const sent = Date.now();
      await redCheckin(mine.token);
      const created = await waitForEvent(readerA, "alert.created", 5000, stateA);
      expect(Date.now() - sent).toBeLessThan(5000);
      expect(created.data.alert).toMatchObject({
        patientId: mine.id,
        code: mine.code,
        acknowledged: false,
        flags: ["Mata atau kulit kuning"],
      });
      expect(JSON.stringify(created.data)).not.toMatch(/pmo|contact|phone/i);

      // The other Puskesmas heard nothing about it.
      await sleep(300);
      expect(stateB.text).not.toContain("alert.created");

      await readerA.cancel();
      await readerB.cancel();
    });

    it("a second console of the same Puskesmas sees the acknowledgement (4.2)", async () => {
      const p = await newPatient(pkA);
      await redCheckin(p.token);
      const [a] = await fx.d.select().from(schema.alerts).where(eq(schema.alerts.patientId, p.id));

      const first = await open("a1");
      const second = await open("a2");
      const r1 = first.body!.getReader();
      const r2 = second.body!.getReader();
      const s1 = { text: "" };
      const s2 = { text: "" };
      await waitForEvent(r1, "alerts.snapshot", 3000, s1);
      await waitForEvent(r2, "alerts.snapshot", 3000, s2);

      await ackRoute.POST(req(`/api/nurse/alerts/${a.id}/ack`, "a1", { method: "POST" }), ctx(a.id));
      const seenByFirst = await waitForEvent(r1, "alert.acknowledged", 5000, s1);
      const seenBySecond = await waitForEvent(r2, "alert.acknowledged", 5000, s2);
      expect(seenBySecond.data.alert).toMatchObject({ id: a.id, acknowledged: true });
      expect(seenByFirst.data.alert.acknowledgedBy).toBe(seenBySecond.data.alert.acknowledgedBy);

      await r1.cancel();
      await r2.cancel();
    });
  });
});
