import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, inArray } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";

/**
 * Route tests for `POST /api/checkins` and `GET /api/family/rules`
 * (daily-checkin 3.1 to 3.3). Database-backed: run only when TEST_DATABASE_URL is set.
 */
const url = process.env.TEST_DATABASE_URL;

// Config is parsed lazily from env; set it before the routes are imported.
process.env.SESSION_SECRET = "s".repeat(48);
process.env.HASH_PEPPER = "p".repeat(48);
process.env.APP_BASE_URL = "http://localhost:3000";
process.env.DATABASE_URL = url ?? "postgres://localhost:5432/none";

type Handler = (req: Request) => Promise<Response>;

describe.skipIf(!url)("POST /api/checkins", () => {
  const client = postgres(url ?? "postgres://unused", { max: 3 });
  const d = drizzle(client, { schema });
  const tag = `CR${Date.now().toString(36).toUpperCase()}`;
  let puskesmasId: string;
  let checkinsRoute: { POST: Handler };
  let rulesRoute: { GET: Handler };
  let tokens: typeof import("@/lib/family-token");
  const patientIds: string[] = [];
  let seq = 0;

  async function newPatient(over: Partial<typeof schema.patients.$inferInsert> = {}) {
    const token = tokens.generateFamilyToken();
    const [p] = await d
      .insert(schema.patients)
      .values({
        puskesmasId,
        code: `${tag}-${++seq}`.slice(0, 20),
        startDate: "2026-03-01",
        phase: "intensive",
        pmoContactHash: "hash",
        familyTokenHash: tokens.hashFamilyToken(token),
        consentAt: new Date(),
        ...over,
      })
      .returning();
    patientIds.push(p.id);
    return { id: p.id, token };
  }

  const uuid = () => crypto.randomUUID();
  const post = (token: string | null, body: unknown, raw?: string) =>
    checkinsRoute.POST(
      new Request("http://localhost/api/checkins", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: raw ?? JSON.stringify(body),
      }),
    );
  const countRows = async (patientId: string) =>
    (await d.select().from(schema.checkins).where(eq(schema.checkins.patientId, patientId))).length;

  beforeAll(async () => {
    tokens = await import("@/lib/family-token");
    checkinsRoute = await import("@/app/api/checkins/route");
    rulesRoute = await import("@/app/api/family/rules/route");
    const [p] = await d
      .insert(schema.puskesmas)
      .values({ name: `${tag} Puskesmas`, phone: "021-888" })
      .returning();
    puskesmasId = p.id;
  });

  afterAll(async () => {
    if (patientIds.length > 0) {
      await d.delete(schema.auditLog).where(
        inArray(
          schema.auditLog.actor,
          patientIds.map((id) => `family:${id}`),
        ),
      );
    }
    await d.delete(schema.puskesmas).where(eq(schema.puskesmas.id, puskesmasId));
    await client.end();
  });

  it("stores a successful submission and returns the reply without the risk score", async () => {
    const { id, token } = await newPatient();
    const res = await post(token, { clientId: uuid(), doseStatus: "yes", chips: ["urine_orange"] });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const reply = await res.json();
    expect(reply).toMatchObject({
      level: "GREEN",
      contact: { name: `${tag} Puskesmas`, phone: "021-888" },
      fallbackUsed: true,
    });
    expect(typeof reply.checkinId).toBe("string");
    expect(reply.message).not.toBe("");
    expect(reply.action).toBe("Tetap minum obat sesuai jadwal.");
    expect(reply.citations).toHaveLength(1);
    expect(JSON.stringify(reply)).not.toMatch(/risk|score|band/i);
    expect(JSON.stringify(reply)).not.toMatch(/\baman\b/i);
    expect(await countRows(id)).toBe(1);
  });

  it("rejects a revoked, unknown, malformed or missing token and stores nothing", async () => {
    const { id, token } = await newPatient({ tokenRevokedAt: new Date() });
    const body = { clientId: uuid(), doseStatus: "yes" };
    const revoked = await post(token, body);
    expect(revoked.status).toBe(404);
    expect((await post(tokens.generateFamilyToken(), body)).status).toBe(404);
    expect((await post("short", body)).status).toBe(404);
    expect((await post(null, body)).status).toBe(404);
    expect(await countRows(id)).toBe(0);
    // The body of the rejection reveals nothing about the patient.
    expect(await revoked.json()).toEqual({ error: "not found" });
  });

  it("rejects a patient without consent and stores nothing", async () => {
    const { id, token } = await newPatient({ consentAt: null });
    const res = await post(token, { clientId: uuid(), doseStatus: "yes" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "consent_required" });
    expect(await countRows(id)).toBe(0);
  });

  it("rejects invalid bodies with 400 and stores nothing", async () => {
    const { id, token } = await newPatient();
    const ok = { clientId: uuid(), doseStatus: "yes" };
    const bad: [string, unknown, string?][] = [
      ["dose maybe", { ...ok, doseStatus: "maybe" }],
      ["501 characters", { ...ok, text: "a".repeat(501) }],
      ["a patient id", { ...ok, patientId: uuid() }],
      ["a treatment day", { ...ok, treatmentDay: 99 }],
      ["chips not a list", { ...ok, chips: "nausea_mild" }],
      ["no client id", { doseStatus: "yes" }],
      ["not json", null, "{not json"],
      ["an array", [ok]],
    ];
    for (const [name, body, raw] of bad) {
      const res = await post(token, body, raw);
      expect(res.status, name).toBe(400);
    }
    expect(await countRows(id)).toBe(0);
  });

  it("computes the treatment day on the server", async () => {
    const { id, token } = await newPatient({ startDate: "2026-03-01" });
    const res = await post(token, { clientId: uuid(), doseStatus: "yes" });
    expect(res.status).toBe(200);
    const [row] = await d.select().from(schema.checkins).where(eq(schema.checkins.patientId, id));
    const { treatmentDay, todayJakarta } = await import("@/lib/time");
    expect(row.treatmentDay).toBe(treatmentDay("2026-03-01", todayJakarta()));
  });

  it("accepts an unknown chip code and stores a level of at least YELLOW (3.3)", async () => {
    const { id, token } = await newPatient();
    const res = await post(token, { clientId: uuid(), doseStatus: "yes", chips: ["sesuatu_baru"] });
    expect(res.status).toBe(200);
    expect(["YELLOW", "RED"]).toContain((await res.json()).level);
    const [row] = await d.select().from(schema.checkins).where(eq(schema.checkins.patientId, id));
    expect(row.symptomsJson).toMatchObject({ chips: ["sesuatu_baru"], unknown: ["sesuatu_baru"] });
  });

  it("answers the twenty-first submission of the day with 429 and stores nothing (3.2)", async () => {
    const { id, token } = await newPatient();
    for (let i = 0; i < 20; i++) {
      expect((await post(token, { clientId: uuid(), doseStatus: "yes" })).status).toBe(200);
    }
    const over = await post(token, { clientId: uuid(), doseStatus: "yes" });
    expect(over.status).toBe(429);
    expect(await countRows(id)).toBe(20);
  });

  it("a RED submission returns the Puskesmas/IGD action and creates one alert", async () => {
    const { id, token } = await newPatient();
    const res = await post(token, { clientId: uuid(), doseStatus: "yes", text: "matanya kuning" });
    const reply = await res.json();
    expect(reply.level).toBe("RED");
    expect(reply.action).toMatch(/Puskesmas atau IGD hari ini/);
    expect(reply.message).toMatch(/Perawat sudah diberi tahu/);
    const alerts = await d.select().from(schema.alerts).where(eq(schema.alerts.patientId, id));
    expect(alerts).toHaveLength(1);
  });

  it.each([
    "rumah di Jalan Mawar mata kuning",
    "nama saya Budi mata kuning",
    "Jl. Mawar 3, pandangan buram",
  ])("a note with an address or name next to a red flag stays RED and is stored redacted: %s", async (text) => {
    const { id, token } = await newPatient();
    const res = await post(token, { clientId: uuid(), doseStatus: "yes", text });
    expect((await res.json()).level).toBe("RED");
    const [row] = await d.select().from(schema.checkins).where(eq(schema.checkins.patientId, id));
    expect(row.triageLevel).toBe("RED");
    expect(row.textRedacted).not.toMatch(/Mawar|Budi/);
    expect(await d.select().from(schema.alerts).where(eq(schema.alerts.patientId, id))).toHaveLength(1);
  });

  describe("GET /api/family/rules", () => {
    it("returns the triage table and lexicon to a valid link, 404 otherwise", async () => {
      const { token } = await newPatient();
      const ok = await rulesRoute.GET(
        new Request("http://localhost/api/family/rules", { headers: { authorization: `Bearer ${token}` } }),
      );
      expect(ok.status).toBe(200);
      const bundle = await ok.json();
      expect(bundle.table.symptoms.length).toBeGreaterThan(0);
      expect(bundle.lexicon.symptoms).toBeTruthy();
      expect(typeof bundle.version).toBe("string");

      const none = await rulesRoute.GET(new Request("http://localhost/api/family/rules"));
      expect(none.status).toBe(404);
    });
  });
});
