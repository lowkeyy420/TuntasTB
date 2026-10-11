import { drizzle } from "drizzle-orm/postgres-js";
import { inArray, or } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";

/**
 * Helpers for the database-backed tests of the nurse console and pickups.
 * Every test creates its own Puskesmas (so queues and inboxes never mix) and
 * `cleanup()` removes it, which cascades to everything below it, plus the
 * audit rows written for those ids (the audit table has no foreign keys).
 */
export function dbFixtures(url: string, onQuery?: () => void) {
  const client = postgres(url, { max: 4 });
  const d = drizzle(client, {
    schema,
    logger: onQuery ? { logQuery: () => onQuery() } : undefined,
  });
  const tag = `T${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
  let seq = 0;
  const puskesmasIds: string[] = [];
  const nurseIds: string[] = [];
  const patientIds: string[] = [];

  return {
    d,
    tag,
    async puskesmas(label = "pk") {
      const [row] = await d
        .insert(schema.puskesmas)
        .values({ name: `${tag}-${label}-${++seq}`, phone: "021-555-0100" })
        .returning();
      puskesmasIds.push(row.id);
      return row;
    },
    async nurse(puskesmasId: string) {
      const [row] = await d
        .insert(schema.nurses)
        .values({ puskesmasId, email: `${tag.toLowerCase()}-${++seq}@test.id`, passwordHash: "x" })
        .returning();
      nurseIds.push(row.id);
      return row;
    },
    async patient(puskesmasId: string, over: Partial<typeof schema.patients.$inferInsert> = {}) {
      const [row] = await d
        .insert(schema.patients)
        .values({
          puskesmasId,
          code: `${tag}-${++seq}`.slice(0, 20),
          startDate: "2026-02-01",
          phase: "intensive",
          pmoContactHash: "hash",
          consentAt: new Date("2026-02-01T00:00:00Z"),
          createdAt: new Date("2026-02-01T00:00:00Z"),
          ...over,
        })
        .returning();
      patientIds.push(row.id);
      return row;
    },
    async checkin(patientId: string, over: Partial<typeof schema.checkins.$inferInsert> & { occurredOn: string }) {
      const [row] = await d
        .insert(schema.checkins)
        .values({
          patientId,
          clientId: crypto.randomUUID(),
          doseStatus: "yes",
          symptomsJson: { chips: [], symptoms: [], unknown: [] },
          triageLevel: "GREEN",
          createdAt: new Date(`${over.occurredOn}T02:00:00Z`),
          ...over,
        })
        .returning();
      return row;
    },
    async cleanup() {
      const targets = [...puskesmasIds, ...patientIds];
      const actors = [...nurseIds.map((id) => `nurse:${id}`), ...patientIds.map((id) => `family:${id}`)];
      const conditions = [
        ...(targets.length > 0 ? [inArray(schema.auditLog.target, targets)] : []),
        ...(actors.length > 0 ? [inArray(schema.auditLog.actor, actors)] : []),
      ];
      if (conditions.length > 0) await d.delete(schema.auditLog).where(or(...conditions));
      if (puskesmasIds.length > 0) {
        await d.delete(schema.puskesmas).where(inArray(schema.puskesmas.id, puskesmasIds));
      }
      await client.end();
    },
  };
}
