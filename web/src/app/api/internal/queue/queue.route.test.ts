import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { dbFixtures } from "@/test-utils/dbFixtures";
import { internalTokenValid } from "@/lib/auth/internalToken";

const url = process.env.TEST_DATABASE_URL;
const SECRET = "s".repeat(48);
const TOKEN = "internal-token-for-tests-internal-token-0123";

process.env.SESSION_SECRET = SECRET;
process.env.HASH_PEPPER = "p".repeat(48);
process.env.APP_BASE_URL = "http://localhost:3000";
process.env.DATABASE_URL = url ?? "postgres://localhost:5432/none";

describe("internalTokenValid (constant-time compare)", () => {
  it("accepts only the exact configured token", () => {
    expect(internalTokenValid(TOKEN, TOKEN)).toBe(true);
    expect(internalTokenValid(`${TOKEN}x`, TOKEN)).toBe(false);
    expect(internalTokenValid(TOKEN.slice(1), TOKEN)).toBe(false);
    expect(internalTokenValid("", TOKEN)).toBe(false);
    expect(internalTokenValid(null, TOKEN)).toBe(false);
    expect(internalTokenValid(undefined, TOKEN)).toBe(false);
  });

  it("rejects everything when no token is configured", () => {
    expect(internalTokenValid("anything", undefined)).toBe(false);
    expect(internalTokenValid("anything", "")).toBe(false);
    expect(internalTokenValid("", "")).toBe(false);
    expect(internalTokenValid(null, null)).toBe(false);
  });
});

type Get = (req: Request) => Promise<Response>;

describe.skipIf(!url)("GET /api/internal/queue and GET /api/nurse/queue", () => {
  const fx = dbFixtures(url ?? "postgres://unused");
  let pkId: string;
  let otherPk: string;
  let cookie: string;
  let internalRoute: { GET: Get };
  let nurseRoute: { GET: Get };

  const iso = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
  const internalGet = (query: string, token?: string) =>
    internalRoute.GET(
      new Request(`http://localhost/api/internal/queue${query}`, {
        headers: token === undefined ? {} : { "x-internal-token": token },
      }),
    );

  beforeAll(async () => {
    process.env.INTERNAL_API_TOKEN = TOKEN;
    vi.resetModules();
    internalRoute = await import("@/app/api/internal/queue/route");
    nurseRoute = await import("@/app/api/nurse/queue/route");
    const { createSession } = await import("@/lib/auth/session");

    pkId = (await fx.puskesmas()).id;
    otherPk = (await fx.puskesmas()).id;
    const nurse = await fx.nurse(pkId);
    cookie = `session=${await createSession({ nurseId: nurse.id, puskesmasId: pkId }, SECRET)}`;
    const p = await fx.patient(pkId, { pmoContactHash: "HASH-DO-NOT-LEAK", code: `${fx.tag}-R1`.slice(0, 20) });
    await fx.checkin(p.id, {
      occurredOn: iso(0),
      triageLevel: "YELLOW",
      textRedacted: "catatan pribadi keluarga",
      nurseLine: "kalimat pribadi tersimpan",
      createdAt: new Date(),
    });
    await fx.patient(otherPk, { code: `${fx.tag}-OT`.slice(0, 20) });
  });

  afterAll(async () => {
    delete process.env.INTERNAL_API_TOKEN;
    await fx.cleanup();
  });

  it("valid token: the ranked list with code, score, band, level, reason and suggested action", async () => {
    const res = await internalGet(`?puskesmas_id=${pkId}&date=${iso(0)}`, TOKEN);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.puskesmas_id).toBe(pkId);
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0]).toMatchObject({
      rank: 1,
      code: `${fx.tag}-R1`.slice(0, 20),
      score: 1,
      band: "low",
      level: "YELLOW",
      suggested_action: "telepon",
    });
    expect(typeof body.entries[0].reason).toBe("string");
  });

  it("defaults the date to today", async () => {
    const res = await internalGet(`?puskesmas_id=${pkId}`, TOKEN);
    expect((await res.json()).date).toBe(iso(0));
  });

  it.each([
    ["no token", undefined],
    ["a wrong token", "wrong-token"],
    ["an empty token", ""],
  ])("%s: 401 and no patient data", async (_label, token) => {
    const res = await internalGet(`?puskesmas_id=${pkId}&date=${iso(0)}`, token);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("the response has no note text, contact hash, family token or ids", async () => {
    const text = JSON.stringify(await (await internalGet(`?puskesmas_id=${pkId}`, TOKEN)).json());
    for (const secret of ["catatan pribadi", "kalimat pribadi", "HASH-DO-NOT-LEAK", "familyToken", "patientId"]) {
      expect(text).not.toContain(secret);
    }
  });

  it("rejects a malformed Puskesmas id or date with 400 (token checked first)", async () => {
    expect((await internalGet("?puskesmas_id=nope", TOKEN)).status).toBe(400);
    expect((await internalGet(`?puskesmas_id=${pkId}&date=20-03-2026`, TOKEN)).status).toBe(400);
    expect((await internalGet(`?puskesmas_id=${pkId}&date=2026-02-30`, TOKEN)).status).toBe(400);
    expect((await internalGet("")).status).toBe(401);
  });

  it("an unknown Puskesmas gives an empty list, not an error", async () => {
    const res = await internalGet(`?puskesmas_id=${crypto.randomUUID()}`, TOKEN);
    expect(res.status).toBe(200);
    expect((await res.json()).entries).toEqual([]);
  });

  it("with no INTERNAL_API_TOKEN configured the endpoint rejects every request", async () => {
    delete process.env.INTERNAL_API_TOKEN;
    vi.resetModules();
    const unconfigured = (await import("@/app/api/internal/queue/route")) as { GET: Get };
    for (const token of [TOKEN, "", "anything"]) {
      const res = await unconfigured.GET(
        new Request(`http://localhost/api/internal/queue?puskesmas_id=${pkId}`, { headers: { "x-internal-token": token } }),
      );
      expect(res.status).toBe(401);
    }
    process.env.INTERNAL_API_TOKEN = TOKEN;
  });

  it("the nurse queue needs a session and returns only the session's Puskesmas", async () => {
    const anon = await nurseRoute.GET(new Request("http://localhost/api/nurse/queue"));
    expect(anon.status).toBe(401);
    const res = await nurseRoute.GET(new Request("http://localhost/api/nurse/queue", { headers: { cookie } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries.map((e: { code: string }) => e.code)).toEqual([`${fx.tag}-R1`.slice(0, 20)]);
    expect(body.entries[0].reason).not.toBe("");
  });
});
