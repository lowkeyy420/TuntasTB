import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, inArray, like } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import {
  puskesmas,
  nurses,
  patients,
  checkins,
  alerts,
  pickups,
  auditLog,
} from "@/lib/db/schema";

/**
 * DB-backed integration tests for the onboarding API (tasks 1.1, 2.2 to 2.5,
 * 3.x, 4.x). Runs only when TEST_DATABASE_URL is set. Routes are called
 * directly with real Request objects.
 */

const url = process.env.TEST_DATABASE_URL;
const run = Boolean(url);

const SECRET = "s".repeat(48);
const PEPPER = "p".repeat(48);

// Config is parsed lazily from env; set it before the routes are imported.
process.env.SESSION_SECRET = SECRET;
process.env.HASH_PEPPER = PEPPER;
process.env.APP_BASE_URL = "http://localhost:3000";
process.env.DATABASE_URL = url ?? "postgres://localhost:5432/none";

const tag = `ONB${Date.now().toString(36).toUpperCase()}`;
const code = (s: string) => `${tag}-${s}`.slice(0, 20);

let client: ReturnType<typeof postgres> | undefined;
let d: ReturnType<typeof drizzle<typeof schema>>;

type Handler = (req: Request, ctx?: never) => Promise<Response>;
type CtxHandler = (
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) => Promise<Response>;

describe.skipIf(!run)("patient onboarding API", () => {
  let pkA: string;
  let pkB: string;
  let nurseA: string;
  let nurseB: string;
  let cookieA: string;
  let cookieB: string;

  let patientsRoute: { GET: Handler; POST: Handler };
  let idRoute: { GET: CtxHandler; PATCH: CtxHandler };
  let tokenRoute: { POST: CtxHandler; DELETE: CtxHandler };
  let familySession: { GET: Handler };
  let familyConsent: { POST: Handler };
  let service: typeof import("@/lib/patients/service");
  let resolveFamilyToken: typeof import("@/lib/family-token").resolveFamilyToken;

  const createdPatientIds: string[] = [];

  beforeAll(async () => {
    client = postgres(url!, { max: 2 });
    d = drizzle(client, { schema });

    const [a] = await d
      .insert(puskesmas)
      .values({ name: `${tag}-A`, phone: "021-111" })
      .returning();
    const [b] = await d
      .insert(puskesmas)
      .values({ name: `${tag}-B`, phone: "021-222" })
      .returning();
    pkA = a.id;
    pkB = b.id;
    const [na] = await d
      .insert(nurses)
      .values({ puskesmasId: pkA, email: `${tag.toLowerCase()}-a@test.id`, passwordHash: "x" })
      .returning();
    const [nb] = await d
      .insert(nurses)
      .values({ puskesmasId: pkB, email: `${tag.toLowerCase()}-b@test.id`, passwordHash: "x" })
      .returning();
    nurseA = na.id;
    nurseB = nb.id;

    const { createSession } = await import("@/lib/auth/session");
    cookieA = `session=${await createSession({ nurseId: nurseA, puskesmasId: pkA }, SECRET)}`;
    cookieB = `session=${await createSession({ nurseId: nurseB, puskesmasId: pkB }, SECRET)}`;

    patientsRoute = await import("@/app/api/nurse/patients/route");
    idRoute = await import("@/app/api/nurse/patients/[id]/route");
    tokenRoute = await import("@/app/api/nurse/patients/[id]/token/route");
    familySession = await import("@/app/api/family/session/route");
    familyConsent = await import("@/app/api/family/consent/route");
    service = await import("@/lib/patients/service");
    ({ resolveFamilyToken } = await import("@/lib/family-token"));
  });

  afterAll(async () => {
    if (d) {
      if (createdPatientIds.length > 0) {
        await d.delete(auditLog).where(inArray(auditLog.target, createdPatientIds));
      }
      await d.delete(auditLog).where(like(auditLog.actor, `nurse:${nurseA}`));
      await d.delete(auditLog).where(like(auditLog.actor, `nurse:${nurseB}`));
      await d.delete(puskesmas).where(eq(puskesmas.id, pkA));
      await d.delete(puskesmas).where(eq(puskesmas.id, pkB));
    }
    await client?.end();
  });

  // ---- request helpers -------------------------------------------------

  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

  function nurseReq(
    method: string,
    cookie: string | null,
    body?: unknown,
  ): Request {
    return new Request("http://localhost/api/nurse/patients", {
      method,
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  function familyReq(method: string, token: string | null): Request {
    return new Request("http://localhost/api/family/x", {
      method,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  }

  const base = (c: string) => ({
    code: c,
    startDate: "2024-03-01",
    phase: "intensive",
    pickupIntervalDays: 7,
  });

  async function register(c: string, cookie = cookieA, extra: object = {}) {
    const res = await patientsRoute.POST(
      nurseReq("POST", cookie, { ...base(c), ...extra }),
    );
    const body = await res.json();
    if (res.status === 201) createdPatientIds.push(body.patient.id);
    return { res, body };
  }

  const tokenOf = (link: string) => link.split("/f/")[1];

  async function auditFor(target: string, action?: string) {
    const rows = await d.select().from(auditLog).where(eq(auditLog.target, target));
    return action ? rows.filter((r) => r.action === action) : rows;
  }

  // ---- 1.1 resolveFamilyToken ------------------------------------------

  it("1.1 valid, unknown and revoked tokens: unknown and revoked are identical", async () => {
    const { body } = await register(code("RES"));
    const token = tokenOf(body.familyLink);

    const ok = await resolveFamilyToken(d, token);
    expect(ok?.id).toBe(body.patient.id);

    const unknown = await resolveFamilyToken(d, "A".repeat(43));
    expect(unknown).toBeNull();

    await tokenRoute.DELETE(nurseReq("DELETE", cookieA), ctx(body.patient.id));
    const revoked = await resolveFamilyToken(d, token);
    expect(revoked).toBeNull();
    expect(revoked).toEqual(unknown);

    // Malformed and missing tokens look the same too.
    expect(await resolveFamilyToken(d, "short")).toBeNull();
    expect(await resolveFamilyToken(d, null)).toBeNull();
  });

  // ---- 2.2 create ------------------------------------------------------

  it("2.2 creates a patient in the nurse's Puskesmas and issues a one-time link", async () => {
    const { res, body } = await register(code("OK1"));
    expect(res.status).toBe(201);
    expect(body.familyLink).toMatch(/^http:\/\/localhost:3000\/f\/[A-Za-z0-9_-]{43}$/);

    const [row] = await d.select().from(patients).where(eq(patients.id, body.patient.id));
    expect(row.puskesmasId).toBe(pkA);
    expect(row.code).toBe(code("OK1"));
    expect(row.familyTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.familyTokenHash).not.toContain(tokenOf(body.familyLink));
    expect(row.consentAt).toBeNull();
    expect(row.pmoContactHash).toBeNull();
    // The response never carries hashes.
    expect(JSON.stringify(body.patient)).not.toContain(row.familyTokenHash!);
    expect(body.patient).toMatchObject({ hasPmo: false, consented: false, linkStatus: "active" });
  });

  it("2.2 rejects a duplicate code in the same Puskesmas with 'Kode sudah dipakai'", async () => {
    await register(code("DUP"));
    const { res, body } = await register(code("DUP"));
    expect(res.status).toBe(409);
    expect(body.fields.code).toBe("Kode sudah dipakai");
    const rows = await d.select().from(patients).where(eq(patients.code, code("DUP")));
    expect(rows).toHaveLength(1);
  });

  it("2.2 accepts the same code in another Puskesmas", async () => {
    await register(code("SAME"), cookieA);
    const { res } = await register(code("SAME"), cookieB);
    expect(res.status).toBe(201);
    const rows = await d.select().from(patients).where(eq(patients.code, code("SAME")));
    expect(rows.map((r) => r.puskesmasId).sort()).toEqual([pkA, pkB].sort());
  });

  it("2.1/2.2 rejects an extra 'name' key and creates nothing", async () => {
    const before = await d.select().from(patients).where(eq(patients.puskesmasId, pkA));
    const { res } = await register(code("NM"), cookieA, { name: "Budi" });
    expect(res.status).toBe(400);
    const after = await d.select().from(patients).where(eq(patients.puskesmasId, pkA));
    expect(after).toHaveLength(before.length);
  });

  it("2.1/2.2 returns Bahasa field errors for a missing start date", async () => {
    const res = await patientsRoute.POST(
      nurseReq("POST", cookieA, { code: code("MISS"), phase: "intensive", pickupIntervalDays: 7 }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).fields.startDate).toBe("Tanggal mulai wajib diisi");
  });

  it("2.2 requires a nurse session", async () => {
    expect((await patientsRoute.POST(nurseReq("POST", null, base(code("NOAUTH"))))).status).toBe(401);
    expect((await patientsRoute.GET(nurseReq("GET", null))).status).toBe(401);
  });

  it("2.2/2.3 create is audited with identifiers only", async () => {
    const { body } = await register(code("AUD"), cookieA, { pmoPhone: "0812-3456-7890" });
    const rows = await auditFor(body.patient.id, "patient.create");
    expect(rows).toHaveLength(1);
    expect(rows[0].actor).toBe(`nurse:${nurseA}`);
    expect(rows[0].metaJson).toEqual({ puskesmasId: pkA, hasPmo: true });
  });

  // ---- 2.3 no leakage --------------------------------------------------

  it("2.3 neither the PMO phone nor the token appear in any table row or audit entry", async () => {
    const { body } = await register(code("PRIV"), cookieA, { pmoPhone: "0812-3456-7890" });
    const token = tokenOf(body.familyLink);

    // Exercise the other flows so their audit rows exist too.
    await tokenRoute.POST(nurseReq("POST", cookieA), ctx(body.patient.id));
    await patientsRoute.GET(nurseReq("GET", cookieA));
    await familySession.GET(familyReq("GET", token));

    const dump = JSON.stringify({
      puskesmas: await d.select().from(puskesmas),
      nurses: await d.select().from(nurses),
      patients: await d.select().from(patients),
      checkins: await d.select().from(checkins),
      alerts: await d.select().from(alerts),
      pickups: await d.select().from(pickups),
      audit: await d.select().from(auditLog),
    });
    for (const secret of [
      "081234567890",
      "81234567890",
      "6281234567890",
      "0812-3456-7890",
      "812 3456 7890",
      token,
      tokenOf(body.familyLink),
    ]) {
      expect(dump).not.toContain(secret);
    }

    const [row] = await d.select().from(patients).where(eq(patients.id, body.patient.id));
    expect(row.pmoContactHash).toMatch(/^[0-9a-f]{64}$/);
    expect(body.patient.hasPmo).toBe(true);
  });

  // ---- 2.4 list --------------------------------------------------------

  it("2.4 lists code, day, phase, PMO, consent and link status, scoped to the Puskesmas", async () => {
    await register(code("LST"), cookieA, { pmoPhone: "0812-3456-7890" });
    await register(code("LSTB"), cookieB);

    const resA = await patientsRoute.GET(nurseReq("GET", cookieA));
    const listA = (await resA.json()).patients as Array<Record<string, unknown>>;
    const mine = listA.find((p) => p.code === code("LST"))!;
    expect(mine).toMatchObject({
      phase: "intensive",
      hasPmo: true,
      consented: false,
      linkStatus: "active",
    });
    expect(typeof mine.treatmentDay).toBe("number");
    expect(listA.find((p) => p.code === code("LSTB"))).toBeUndefined();

    const listB = (await (await patientsRoute.GET(nurseReq("GET", cookieB))).json()).patients as Array<{ code: string }>;
    expect(listB.find((p) => p.code === code("LSTB"))).toBeDefined();
    expect(listB.find((p) => p.code === code("LST"))).toBeUndefined();

    const audits = await auditFor(pkA, "patient.list");
    expect(audits.length).toBeGreaterThan(0);
  });

  it("2.4 shows treatment day 18 on 18 March for a 1 March start", async () => {
    const [row] = await d
      .insert(patients)
      .values({ puskesmasId: pkA, code: code("DAY"), startDate: "2026-03-01", phase: "intensive" })
      .returning();
    const list = await service.listPatients(
      d,
      { nurseId: nurseA, puskesmasId: pkA },
      new Date("2026-03-18T05:00:00Z"),
    );
    expect(list.find((p) => p.id === row.id)?.treatmentDay).toBe(18);
    // A patient without a link shows "none".
    expect(list.find((p) => p.id === row.id)?.linkStatus).toBe("none");
    createdPatientIds.push(row.id);
  });

  it("2.4 reading one patient is audited and never shows a link", async () => {
    const { body } = await register(code("ONE"));
    const res = await idRoute.GET(nurseReq("GET", cookieA), ctx(body.patient.id));
    expect(res.status).toBe(200);
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain(tokenOf(body.familyLink));
    expect(text).not.toContain("familyLink");
    expect(await auditFor(body.patient.id, "patient.read")).toHaveLength(1);

    expect((await idRoute.GET(nurseReq("GET", cookieB), ctx(body.patient.id))).status).toBe(404);
    expect((await idRoute.GET(nurseReq("GET", cookieA), ctx("not-a-uuid"))).status).toBe(404);
  });

  // ---- 2.5 patch -------------------------------------------------------

  it("2.5 changes phase and pickup interval, audited; another Puskesmas gets 404", async () => {
    const { body } = await register(code("PAT"));
    const id = body.patient.id;

    const res = await idRoute.PATCH(
      nurseReq("PATCH", cookieA, { phase: "continuation", pickupIntervalDays: 30 }),
      ctx(id),
    );
    expect(res.status).toBe(200);
    const [row] = await d.select().from(patients).where(eq(patients.id, id));
    expect(row.phase).toBe("continuation");
    expect(row.pickupIntervalDays).toBe(30);
    expect(await auditFor(id, "patient.update")).toHaveLength(1);

    const other = await idRoute.PATCH(nurseReq("PATCH", cookieB, { phase: "intensive" }), ctx(id));
    expect(other.status).toBe(404);
    const [unchanged] = await d.select().from(patients).where(eq(patients.id, id));
    expect(unchanged.phase).toBe("continuation");

    expect((await idRoute.PATCH(nurseReq("PATCH", cookieA, { code: "X-1234" }), ctx(id))).status).toBe(400);
    expect((await idRoute.PATCH(nurseReq("PATCH", cookieA, { pickupIntervalDays: 99 }), ctx(id))).status).toBe(400);
  });

  // ---- 3.x rotate / revoke ---------------------------------------------

  it("3.1 rotate: old token stops resolving, new resolves, audited", async () => {
    const { body } = await register(code("ROT"));
    const id = body.patient.id;
    const oldToken = tokenOf(body.familyLink);

    const res = await tokenRoute.POST(nurseReq("POST", cookieA), ctx(id));
    expect(res.status).toBe(200);
    const newToken = tokenOf((await res.json()).familyLink);
    expect(newToken).not.toBe(oldToken);

    expect(await resolveFamilyToken(d, oldToken)).toBeNull();
    expect((await resolveFamilyToken(d, newToken))?.id).toBe(id);
    expect((await familySession.GET(familyReq("GET", oldToken))).status).toBe(404);
    expect((await familySession.GET(familyReq("GET", newToken))).status).toBe(200);

    const rows = await auditFor(id, "family_token.rotate");
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(newToken);
  });

  it("3.1 rotate after revoke issues a working link again", async () => {
    const { body } = await register(code("RVR"));
    const id = body.patient.id;
    await tokenRoute.DELETE(nurseReq("DELETE", cookieA), ctx(id));
    const res = await tokenRoute.POST(nurseReq("POST", cookieA), ctx(id));
    const token = tokenOf((await res.json()).familyLink);
    expect((await familySession.GET(familyReq("GET", token))).status).toBe(200);
  });

  it("3.2 revoke: token stops resolving, family calls 404, audited, status 'revoked'", async () => {
    const { body } = await register(code("REV"));
    const id = body.patient.id;
    const token = tokenOf(body.familyLink);

    const res = await tokenRoute.DELETE(nurseReq("DELETE", cookieA), ctx(id));
    expect(res.status).toBe(200);

    expect(await resolveFamilyToken(d, token)).toBeNull();
    expect((await familySession.GET(familyReq("GET", token))).status).toBe(404);
    expect((await familyConsent.POST(familyReq("POST", token))).status).toBe(404);
    expect(await auditFor(id, "family_token.revoke")).toHaveLength(1);

    const [row] = await d.select().from(patients).where(eq(patients.id, id));
    expect(row.tokenRevokedAt).not.toBeNull();
    expect(row.familyTokenHash).not.toBeNull(); // kept so "revoked" != "never issued"

    const view = await idRoute.GET(nurseReq("GET", cookieA), ctx(id));
    expect((await view.json()).patient.linkStatus).toBe("revoked");
  });

  it("3.2 a nurse of another Puskesmas is rejected and the link is unchanged", async () => {
    const { body } = await register(code("XPK"));
    const id = body.patient.id;
    const token = tokenOf(body.familyLink);

    expect((await tokenRoute.POST(nurseReq("POST", cookieB), ctx(id))).status).toBe(404);
    expect((await tokenRoute.DELETE(nurseReq("DELETE", cookieB), ctx(id))).status).toBe(404);
    expect((await tokenRoute.POST(nurseReq("POST", null), ctx(id))).status).toBe(401);

    expect((await resolveFamilyToken(d, token))?.id).toBe(id);
    expect(await auditFor(id, "family_token.rotate")).toHaveLength(0);
    expect(await auditFor(id, "family_token.revoke")).toHaveLength(0);
  });

  // ---- 4.x family session and consent -----------------------------------

  it("4.1 session: valid token works and is audited; unknown, revoked and missing give the same 404", async () => {
    const { body } = await register(code("SES"));
    const id = body.patient.id;
    const token = tokenOf(body.familyLink);

    const ok = await familySession.GET(familyReq("GET", token));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({
      consented: false,
      treatmentDay: expect.any(Number),
      puskesmasName: `${tag}-A`,
      puskesmasPhone: "021-111",
    });
    const opens = await auditFor(id, "family.open");
    expect(opens).toHaveLength(1);
    expect(opens[0].actor).toBe(`family:${id}`);
    expect(JSON.stringify(opens)).not.toContain(token);

    await tokenRoute.DELETE(nurseReq("DELETE", cookieA), ctx(id));
    const unknown = await familySession.GET(familyReq("GET", "B".repeat(43)));
    const revoked = await familySession.GET(familyReq("GET", token));
    const missing = await familySession.GET(familyReq("GET", null));
    for (const r of [unknown, revoked, missing]) expect(r.status).toBe(404);
    const bodies = await Promise.all([unknown, revoked, missing].map((r) => r.text()));
    expect(new Set(bodies).size).toBe(1);
  });

  it("4.2 consent: writes time and audit together; a second call does not change the time", async () => {
    const { body } = await register(code("CON"));
    const id = body.patient.id;
    const token = tokenOf(body.familyLink);

    const first = await familyConsent.POST(familyReq("POST", token));
    expect(first.status).toBe(200);
    const [r1] = await d.select().from(patients).where(eq(patients.id, id));
    expect(r1.consentAt).not.toBeNull();
    const audits = await auditFor(id, "patient.consent");
    expect(audits).toHaveLength(1);
    expect(audits[0].actor).toBe(`family:${id}`);

    await new Promise((r) => setTimeout(r, 20));
    const second = await familyConsent.POST(familyReq("POST", token));
    expect(second.status).toBe(200);
    const [r2] = await d.select().from(patients).where(eq(patients.id, id));
    expect(r2.consentAt!.getTime()).toBe(r1.consentAt!.getTime());
    expect(await auditFor(id, "patient.consent")).toHaveLength(1);

    const session = await (await familySession.GET(familyReq("GET", token))).json();
    expect(session.consented).toBe(true);

    const list = (await (await patientsRoute.GET(nurseReq("GET", cookieA))).json()).patients as Array<{ id: string; consented: boolean }>;
    expect(list.find((p) => p.id === id)?.consented).toBe(true);
  });

  it("4.2 consent with an unknown token is a 404 and records nothing", async () => {
    const res = await familyConsent.POST(familyReq("POST", "C".repeat(43)));
    expect(res.status).toBe(404);
  });

  it("4.3 consent remains after the link is rotated", async () => {
    const { body } = await register(code("CRT"));
    const id = body.patient.id;
    await familyConsent.POST(familyReq("POST", tokenOf(body.familyLink)));
    const [before] = await d.select().from(patients).where(eq(patients.id, id));

    const rot = await tokenRoute.POST(nurseReq("POST", cookieA), ctx(id));
    const newToken = tokenOf((await rot.json()).familyLink);

    const session = await (await familySession.GET(familyReq("GET", newToken))).json();
    expect(session.consented).toBe(true);
    const [after] = await d.select().from(patients).where(eq(patients.id, id));
    expect(after.consentAt!.getTime()).toBe(before.consentAt!.getTime());
  });
});
