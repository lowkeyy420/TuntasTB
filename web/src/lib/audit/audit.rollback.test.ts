import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql, eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { puskesmas, auditLog } from "@/lib/db/schema";

/**
 * Integration test: a failing audit insert rolls back the surrounding write.
 *
 * Runs only when TEST_DATABASE_URL is set (the Docker Compose Postgres);
 * skipped otherwise so `npm test` stays hermetic on a bare machine.
 */

const url = process.env.TEST_DATABASE_URL;
const run = Boolean(url);

let client: ReturnType<typeof postgres> | undefined;
let db: ReturnType<typeof drizzle<typeof schema>> | undefined;

const marker = `rollback-test-${Date.now()}`;

describe.skipIf(!run)("audit write rolls back with the data change", () => {
  beforeAll(async () => {
    client = postgres(url!, { max: 1 });
    db = drizzle(client, { schema });
  });

  afterAll(async () => {
    if (db) {
      await db.delete(puskesmas).where(eq(puskesmas.name, marker));
    }
    await client?.end();
  });

  it("does not commit the puskesmas when the audit insert fails", async () => {
    const d = db!;

    await expect(
      d.transaction(async (tx) => {
        // 1. Legitimate write.
        await tx.insert(puskesmas).values({ name: marker, phone: "021-000" });
        // 2. Audit insert that violates the NOT NULL constraint on `action`,
        //    forcing the whole transaction to roll back.
        await tx.execute(
          sql`insert into ${auditLog} (actor, action, target) values ('system', NULL, ${marker})`,
        );
      }),
    ).rejects.toBeTruthy();

    // The puskesmas write must NOT have been committed.
    const rows = await d
      .select()
      .from(puskesmas)
      .where(eq(puskesmas.name, marker));
    expect(rows).toHaveLength(0);

    // And no audit entry for this marker either.
    const audits = await d
      .select()
      .from(auditLog)
      .where(eq(auditLog.target, marker));
    expect(audits).toHaveLength(0);
  });
});
