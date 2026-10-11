import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { puskesmas, nurses, auditLog } from "@/lib/db/schema";

const url = process.env.TEST_DATABASE_URL;
const run = Boolean(url);

const SECRET = "s".repeat(48);
const PEPPER = "p".repeat(48);
process.env.SESSION_SECRET = SECRET;
process.env.HASH_PEPPER = PEPPER;
process.env.APP_BASE_URL = "http://localhost:3000";
process.env.DATABASE_URL = url ?? "postgres://localhost:5432/none";

const tag = `login-${Date.now()}`;
const email = `${tag}@demo.id`;
const password = "demo12345";

let client: ReturnType<typeof postgres> | undefined;
let d: ReturnType<typeof drizzle<typeof schema>>;

function loginReq(body: unknown): Request {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe.skipIf(!run)("POST /api/auth/login", () => {
  let POST: typeof import("@/app/api/auth/login/route").POST;
  let pkId: string;

  beforeAll(async () => {
    client = postgres(url!, { max: 1 });
    d = drizzle(client, { schema });

    const { hashPassword } = await import("@/lib/auth/password");
    const [pk] = await d
      .insert(puskesmas)
      .values({ name: `${tag}-pk`, phone: "021-9" })
      .returning();
    pkId = pk.id;
    await d.insert(nurses).values({
      puskesmasId: pkId,
      email,
      passwordHash: await hashPassword(password, PEPPER),
    });

    ({ POST } = await import("@/app/api/auth/login/route"));
  });

  afterAll(async () => {
    if (d) {
      await d.delete(auditLog).where(eq(auditLog.target, `nurse:test`));
      await d.delete(puskesmas).where(eq(puskesmas.id, pkId));
    }
    await client?.end();
  });

  it("logs in with correct credentials and sets an httpOnly cookie", async () => {
    const res = await POST(loginReq({ email, password }));
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("session=");
    expect(setCookie.toLowerCase()).toContain("httponly");

    // A login audit entry exists for this nurse; it stores no password.
    const nurse = await d.query.nurses.findFirst({ where: eq(nurses.email, email) });
    const audits = await d
      .select()
      .from(auditLog)
      .where(eq(auditLog.target, `nurse:${nurse!.id}`));
    expect(audits.some((a) => a.action === "auth.login")).toBe(true);
    for (const a of audits) {
      expect(JSON.stringify(a.metaJson ?? {})).not.toContain(password);
    }
  });

  it("rejects a wrong password with 401 and no cookie", async () => {
    const res = await POST(loginReq({ email, password: "wrong-pass" }));
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
    const body = await res.json();
    expect(body.error).toBe("Email atau kata sandi salah");
  });

  it("gives the same 401 for an unknown email", async () => {
    const res = await POST(loginReq({ email: `nobody-${tag}@demo.id`, password }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Email atau kata sandi salah");
  });

  it("throttles the 6th attempt with 429 even with the correct password", async () => {
    const throttleEmail = `throttle-${tag}@demo.id`;
    // 5 failed attempts (unknown email counts as failures).
    for (let i = 0; i < 5; i++) {
      await POST(loginReq({ email: throttleEmail, password: "x" }));
    }
    const res = await POST(loginReq({ email: throttleEmail, password }));
    expect(res.status).toBe(429);
  });

  it("records a failed-login audit entry", async () => {
    const before = await d.select().from(auditLog).where(eq(auditLog.action, "auth.login_failed"));
    await POST(loginReq({ email, password: "nope-again" }));
    const after = await d.select().from(auditLog).where(eq(auditLog.action, "auth.login_failed"));
    expect(after.length).toBeGreaterThan(before.length);
  });
});
