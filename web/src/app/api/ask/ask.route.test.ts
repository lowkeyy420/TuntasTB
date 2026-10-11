import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq, inArray } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";

/**
 * Route tests for `POST /api/ask` (guideline-qa 2.3 to 2.6). Database-backed:
 * run only when TEST_DATABASE_URL is set. The flow call is mocked.
 */
const url = process.env.TEST_DATABASE_URL;

process.env.SESSION_SECRET = "s".repeat(48);
process.env.HASH_PEPPER = "p".repeat(48);
process.env.APP_BASE_URL = "http://localhost:3000";
process.env.DATABASE_URL = url ?? "postgres://localhost:5432/none";

const runAskFlow = vi.fn();
vi.mock("@/lib/ask/flow", () => ({ runAskFlow: (p: unknown) => runAskFlow(p) }));

type Handler = (req: Request) => Promise<Response>;

const ID = "efek-samping-ringan#urin-merah";
const goodFlow = {
  answer: "Air kencing merah atau oranye sering terjadi karena obat. Hubungi perawat kalau ragu.",
  citations: [{ id: ID, label: "dari flow" }],
  retrieved_ids: [ID],
  abstained: false,
};

describe.skipIf(!url)("POST /api/ask", () => {
  const client = postgres(url ?? "postgres://unused", { max: 3 });
  const d = drizzle(client, { schema });
  const tag = `AK${Date.now().toString(36).toUpperCase()}`;
  let puskesmasId: string;
  let route: { POST: Handler };
  let askLimiter: typeof import("@/lib/ask/limiter").askLimiter;
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

  const ask = (token: string | null, body: unknown, raw?: string) =>
    route.POST(
      new Request("http://localhost/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: raw ?? JSON.stringify(body),
      }),
    );

  beforeAll(async () => {
    tokens = await import("@/lib/family-token");
    route = await import("@/app/api/ask/route");
    askLimiter = (await import("@/lib/ask/limiter")).askLimiter;
    const [p] = await d.insert(schema.puskesmas).values({ name: `${tag} Puskesmas`, phone: "021-888" }).returning();
    puskesmasId = p.id;
  });

  beforeEach(() => {
    runAskFlow.mockReset();
    askLimiter.reset();
  });

  afterAll(async () => {
    if (patientIds.length > 0) {
      await d.delete(schema.auditLog).where(inArray(schema.auditLog.actor, patientIds.map((id) => `family:${id}`)));
    }
    await d.delete(schema.puskesmas).where(eq(schema.puskesmas.id, puskesmasId));
    await client.end();
  });

  it("answers a question with its source and the contact", async () => {
    runAskFlow.mockResolvedValue(goodFlow);
    const { token } = await newPatient();
    const res = await ask(token, { question: "kenapa kencingnya jadi merah?" });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.kind).toBe("answer");
    expect(body.text).toBe(goodFlow.answer);
    expect(body.citations).toHaveLength(1);
    expect(body.citations[0].id).toBe(ID);
    expect(body.citations[0].label).not.toBe("dari flow");
    expect(body.contact).toEqual({ name: `${tag} Puskesmas`, phone: "021-888" });
  });

  it("rejects a revoked token with 404 and calls no flow", async () => {
    const { token } = await newPatient({ tokenRevokedAt: new Date() });
    const res = await ask(token, { question: "kenapa kencingnya jadi merah?" });
    expect(res.status).toBe(404);
    expect(runAskFlow).not.toHaveBeenCalled();
  });

  it("rejects an unknown, malformed or missing token with 404", async () => {
    for (const token of [tokens.generateFamilyToken(), "short", null]) {
      const res = await ask(token, { question: "kenapa kencingnya jadi merah?" });
      expect(res.status).toBe(404);
    }
    expect(runAskFlow).not.toHaveBeenCalled();
  });

  it("rejects a patient without consent with 403 and calls no flow", async () => {
    const { token } = await newPatient({ consentAt: null });
    const res = await ask(token, { question: "kenapa kencingnya jadi merah?" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "consent_required" });
    expect(runAskFlow).not.toHaveBeenCalled();
  });

  it("answers with the abstain message when Langflow is unreachable", async () => {
    runAskFlow.mockRejectedValue(new Error("ECONNREFUSED"));
    const { token } = await newPatient();
    const body = await (await ask(token, { question: "kenapa kencingnya jadi merah?" })).json();
    expect(body).toEqual({
      kind: "abstain",
      text: "Saya belum bisa menjawab ini, tanyakan ke perawat",
      citations: [],
      contact: { name: `${tag} Puskesmas`, phone: "021-888" },
    });
  });

  it("answers a red-flag question with the go-today instruction even when Langflow is unreachable", async () => {
    runAskFlow.mockRejectedValue(new Error("ECONNREFUSED"));
    const { token } = await newPatient();
    const body = await (await ask(token, { question: "matanya kuning itu normal?" })).json();
    expect(body.kind).toBe("urgent");
    expect(body.text).toContain("Segera ke Puskesmas atau IGD");
    expect(body.contact.phone).toBe("021-888");
    expect(runAskFlow).not.toHaveBeenCalled();
  });

  it("abstains on a dosing question without calling the flow", async () => {
    const { token } = await newPatient();
    const body = await (await ask(token, { question: "boleh dikurangi jadi 2 tablet?" })).json();
    expect(body.kind).toBe("abstain");
    expect(runAskFlow).not.toHaveBeenCalled();
  });

  it("sends the flow only the redacted question", async () => {
    runAskFlow.mockResolvedValue({ ...goodFlow, abstained: true, answer: "", citations: [] });
    const { id, token } = await newPatient();
    await ask(token, { question: "nama saya Budi 081234567890, boleh puasa?" });
    expect(runAskFlow).toHaveBeenCalledTimes(1);
    const payload = runAskFlow.mock.calls[0][0];
    expect(Object.keys(payload)).toEqual(["question"]);
    expect(payload.question).toContain("[NAMA]");
    expect(payload.question).toContain("[TELEPON]");
    expect(JSON.stringify(payload)).not.toContain(id);
    expect(JSON.stringify(payload)).not.toContain(tag);
  });

  it.each([
    ["an empty question", { question: "" }],
    ["a question over 300 characters", { question: "a".repeat(301) }],
    ["an extra key", { question: "boleh puasa?", patientId: "x" }],
    ["no question", {}],
  ])("rejects %s with 400 and calls no flow", async (_n, body) => {
    const { token } = await newPatient();
    expect((await ask(token, body)).status).toBe(400);
    expect(runAskFlow).not.toHaveBeenCalled();
  });

  it("rejects a body that is not JSON with 400", async () => {
    const { token } = await newPatient();
    expect((await ask(token, null, "{nope")).status).toBe(400);
  });

  it("returns 429 for the eleventh question within an hour", async () => {
    runAskFlow.mockResolvedValue(goodFlow);
    const { token } = await newPatient();
    for (let i = 1; i <= 10; i++) {
      expect((await ask(token, { question: "kenapa kencingnya jadi merah?" })).status, `question ${i}`).toBe(200);
    }
    const res = await ask(token, { question: "kenapa kencingnya jadi merah?" });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "too_many" });
    expect(runAskFlow).toHaveBeenCalledTimes(10);
    // Another patient is not affected.
    const other = await newPatient();
    expect((await ask(other.token, { question: "kenapa kencingnya jadi merah?" })).status).toBe(200);
  });

  it("audits each question with the outcome and reason, and stores the question text nowhere", async () => {
    const marker = "zq9marker";
    runAskFlow.mockResolvedValue({ ...goodFlow, abstained: true, answer: "", citations: [] });
    const { id, token } = await newPatient();
    await ask(token, { question: `${marker} apakah boleh puasa?` });
    runAskFlow.mockResolvedValue(goodFlow);
    await ask(token, { question: `${marker} kenapa kencingnya jadi merah?` });
    await ask(token, { question: `${marker} matanya kuning itu normal?` });
    await ask(token, { question: `${marker} boleh dikurangi jadi 2 tablet?` });

    const rows = await d
      .select()
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.actor, `family:${id}`), eq(schema.auditLog.action, "ask.create")))
      .orderBy(schema.auditLog.id);
    expect(rows.map((r) => r.metaJson)).toEqual([
      { outcome: "abstain", abstain_reason: "flow_abstained" },
      { outcome: "answer" },
      { outcome: "urgent" },
      { outcome: "abstain", abstain_reason: "forbidden_topic" },
    ]);
    for (const r of rows) {
      expect(r.target).toBe(id);
      expect(r.at).toBeInstanceOf(Date);
    }

    // The question is in no table of the database.
    const tables = await client`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`;
    expect(tables.length).toBeGreaterThan(5);
    for (const { table_name } of tables) {
      const hit = await client.unsafe(`select count(*)::int as n from "${table_name}" t where t::text ilike $1`, [`%${marker}%`]);
      expect(hit[0].n, `table ${table_name}`).toBe(0);
    }
    // ... nor the answer text.
    const answerHit = await client`select count(*)::int as n from audit_log where meta_json::text ilike '%sering terjadi karena obat%'`;
    expect(answerHit[0].n).toBe(0);
  });
});
