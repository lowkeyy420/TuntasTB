import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { puskesmas, patients, checkins } from "@/lib/db/schema";

/**
 * DB-backed test for DELETE /api/nurse/patients/[id].
 * Runs only when TEST_DATABASE_URL is set.
 */

const url = process.env.TEST_DATABASE_URL;
const run = Boolean(url);

const SECRET = "s".repeat(48);
const PEPPER = "p".repeat(48);

// Config is parsed at import time; set env before importing server modules.
process.env.SESSION_SECRET = SECRET;
process.env.HASH_PEPPER = PEPPER;
process.env.APP_BASE_URL = "http://localhost:3000";
process.env.DATABASE_URL = url ?? "postgres://localhost:5432/none";

let client: ReturnType<typeof postgres> | undefined;
let d: ReturnType<typeof drizzle<typeof schema>>;

const tag = `del-${Date.now()}`;

describe.skipIf(!run)("DELETE /api/nurse/patients/[id]", () => {
  let pkA: string;
  let pkB: string;
  let patientA: string;
  let patientB: string;
  let createSession: typeof import("@/lib/auth/session").createSession;
  let DELETE: typeof import("@/app/api/nurse/patients/[id]/route").DELETE;

  beforeAll(async () => {
    client = postgres(url!, { max: 1 });
    d = drizzle(client, { schema });

    const [a] = await d
      .insert(puskesmas)
      .values({ name: `${tag}-A`, phone: "021-1" })
      .returning();
    const [b] = await d
      .insert(puskesmas)
      .values({ name: `${tag}-B`, phone: "021-2" })
      .returning();
    pkA = a.id;
    pkB = b.id;

    const [pa] = await d
      .insert(patients)
      .values({ puskesmasId: pkA, code: `${tag}-PA`, startDate: "2024-01-01", phase: "intensive" })
      .returning();
    const [pb] = await d
      .insert(patients)
      .values({ puskesmasId: pkB, code: `${tag}-PB`, startDate: "2024-01-01", phase: "intensive" })
      .returning();
    patientA = pa.id;
    patientB = pb.id;

    // A dependent checkin to prove cascade.
    await d.insert(checkins).values({
      patientId: patientA,
      clientId: `${tag}-c1`,
      occurredOn: "2024-01-02",
    });

    ({ createSession } = await import("@/lib/auth/session"));
    ({ DELETE } = await import("@/app/api/nurse/patients/[id]/route"));
  });

  afterAll(async () => {
    if (d) {
      await d.delete(puskesmas).where(eq(puskesmas.id, pkA));
      await d.delete(puskesmas).where(eq(puskesmas.id, pkB));
    }
    await client?.end();
    vi.restoreAllMocks();
  });

  function noSessionReq(): Request {
    return new Request("http://localhost/api/nurse/patients/x", {
      method: "DELETE",
      headers: { cookie: "" },
    });
  }

  async function cookieReq(pid: string): Promise<Request> {
    const token = await createSession({ nurseId: "n-test", puskesmasId: pid }, SECRET);
    return new Request("http://localhost/api/nurse/patients/x", {
      method: "DELETE",
      headers: { cookie: `session=${token}` },
    });
  }

  it("deletes a patient of the nurse's own Puskesmas and cascades", async () => {
    const request = await cookieReq(pkA);
    const res = await DELETE(request, { params: Promise.resolve({ id: patientA }) });
    expect(res.status).toBe(200);

    const left = await d.select().from(patients).where(eq(patients.id, patientA));
    expect(left).toHaveLength(0);
    const cks = await d.select().from(checkins).where(eq(checkins.patientId, patientA));
    expect(cks).toHaveLength(0);
  });

  it("returns 404 for a patient of another Puskesmas and keeps it", async () => {
    const request = await cookieReq(pkA); // nurse in A tries to delete B's patient
    const res = await DELETE(request, { params: Promise.resolve({ id: patientB }) });
    expect(res.status).toBe(404);

    const still = await d.select().from(patients).where(eq(patients.id, patientB));
    expect(still).toHaveLength(1);
  });

  it("returns 401 without a session", async () => {
    const res = await DELETE(noSessionReq(), {
      params: Promise.resolve({ id: patientB }),
    });
    expect(res.status).toBe(401);
  });
});
