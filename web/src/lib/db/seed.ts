import "dotenv/config";
import { createHash } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, and } from "drizzle-orm";
import * as schema from "./schema";
import { puskesmas, nurses, patients, checkins, pickups, alerts } from "./schema";
import type { Database } from "./index";
import { hashPassword } from "@/lib/auth/password";
import { hashFamilyToken } from "@/lib/family-token";
import { hashPmoContact } from "@/lib/patients/pmo";
import { submitCheckin, defaultServiceDeps } from "@/lib/checkin/service";
import type { CheckinBody } from "@/lib/checkin/schema";
import { addDays } from "@/lib/risk/dates";
import { todayJakarta } from "@/lib/time";

/**
 * Idempotent demo seed: one Puskesmas (with a contact number), one demo nurse
 * (from SEED_NURSE_EMAIL / SEED_NURSE_PASSWORD), and five synthetic patients
 * with a few days of check-ins so the nurse queue has a story. Running it
 * twice gives the same result: the demo patients' check-ins, alerts and
 * pickups are rebuilt relative to today. Fake data only; patients are codes.
 *
 * The check-ins go through the real pipeline (redaction, triage, risk, reply),
 * so the scores and reasons in the queue are the product's own.
 *
 *  DEMO-001  day 41, YELLOW, score 8 (high): nausea for 7 days, "sudah sembuh", wants to stop
 *  DEMO-002  day 23, RED "matanya kuning" this morning, alert waiting to be acknowledged
 *  DEMO-003  day 12, GREEN, reported this morning
 *  DEMO-004  day 58, GREEN, but the medicine pickup was missed 2 days ago
 *  DEMO-005  day 31, silent for 4 days, no PMO
 *
 * Pickups: DEMO-001, DEMO-003 and DEMO-005 upcoming, DEMO-002 inside the nudge
 * window (due in 2 days), DEMO-004 missed (2 days overdue).
 */

const PUSKESMAS_NAME = "Puskesmas Demo Jakarta";
const PUSKESMAS_PHONE = "021-5550123";

interface DemoCheckin {
  /** Days before today. */
  daysAgo: number;
  /** Clock time in Jakarta. */
  at: string;
  dose: CheckinBody["doseStatus"];
  chips?: string[];
  text?: string;
}

interface DemoPatient {
  code: string;
  /** Treatment day today (the start date is day 1). */
  day: number;
  phase: "intensive" | "continuation";
  intervalDays: number;
  /** Fake number, kept only as a keyed hash; null = no PMO. */
  pmoPhone: string | null;
  /** Days from today until the open pickup is due (negative: missed). */
  pickupDueIn: number;
  checkins: DemoCheckin[];
}

const nausea = ["nausea_mild"];

const DEMO: DemoPatient[] = [
  {
    code: "DEMO-001",
    day: 41,
    phase: "intensive",
    intervalDays: 14,
    pmoPhone: "081200000001",
    pickupDueIn: 5,
    checkins: [
      ...[6, 5, 3, 2, 1].map((daysAgo): DemoCheckin => ({ daysAgo, at: "19:20", dose: "yes", chips: nausea })),
      { daysAgo: 4, at: "19:15", dose: "partial", chips: nausea },
      {
        // This morning: the day 41 check-in, seven days of nausea in a row.
        daysAgo: 0,
        at: "06:40",
        dose: "yes",
        chips: nausea,
        text: "mual terus seminggu, katanya sudah sembuh, mau berhenti",
      },
    ],
  },
  {
    code: "DEMO-002",
    day: 23,
    phase: "intensive",
    intervalDays: 14,
    pmoPhone: "081200000002",
    pickupDueIn: 2,
    checkins: [
      { daysAgo: 3, at: "07:10", dose: "yes", chips: ["urine_orange"] },
      { daysAgo: 2, at: "07:05", dose: "yes" },
      { daysAgo: 1, at: "07:08", dose: "yes" },
      // This morning: the day 23 RED, waiting to be acknowledged.
      { daysAgo: 0, at: "07:10", dose: "yes", text: "matanya kuning" },
    ],
  },
  {
    code: "DEMO-003",
    day: 12,
    phase: "intensive",
    intervalDays: 7,
    pmoPhone: "081200000003",
    pickupDueIn: 9,
    checkins: [
      { daysAgo: 2, at: "07:00", dose: "yes" },
      { daysAgo: 1, at: "07:02", dose: "yes" },
      { daysAgo: 0, at: "07:05", dose: "yes" },
    ],
  },
  {
    code: "DEMO-004",
    day: 58,
    phase: "intensive",
    intervalDays: 14,
    pmoPhone: "081200000004",
    pickupDueIn: -2,
    checkins: [
      { daysAgo: 2, at: "06:40", dose: "yes" },
      { daysAgo: 1, at: "06:45", dose: "yes" },
    ],
  },
  {
    code: "DEMO-005",
    day: 31,
    phase: "intensive",
    intervalDays: 14,
    pmoPhone: null,
    pickupDueIn: 4,
    checkins: [{ daysAgo: 4, at: "08:00", dose: "yes" }],
  },
];

/** A stable UUID per (patient, day, position): the same check-in is never stored twice. */
function clientId(code: string, date: string, n: number): string {
  const h = createHash("sha256").update(`${code}|${date}|${n}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/**
 * Demo family link token: derived from the pepper and the code, so the same
 * link can be printed on every run. 32 bytes of SHA-256 as base64url = 43
 * characters, the format of a real token. Demo patients only.
 */
function demoToken(code: string, pepper: string): string {
  return createHash("sha256").update(`${pepper}:demo-family-link:${code}`).digest("base64url");
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required to seed");
    process.exit(1);
  }
  const pepper = process.env.HASH_PEPPER;
  if (!pepper || pepper.length < 32) {
    console.error("HASH_PEPPER (>=32 chars) is required to seed");
    process.exit(1);
  }
  const nurseEmail = (process.env.SEED_NURSE_EMAIL ?? "perawat@demo.id")
    .trim()
    .toLowerCase();
  const nursePassword = process.env.SEED_NURSE_PASSWORD ?? "demo12345";
  const baseUrl = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");

  const client = postgres(url, { max: 1 });
  const db = drizzle(client, { schema });

  try {
    // 1. Puskesmas (idempotent by name).
    let pk = await db.query.puskesmas.findFirst({
      where: eq(puskesmas.name, PUSKESMAS_NAME),
    });
    if (!pk) {
      [pk] = await db
        .insert(puskesmas)
        .values({ name: PUSKESMAS_NAME, phone: PUSKESMAS_PHONE })
        .returning();
      console.log("created puskesmas");
    } else {
      console.log("puskesmas exists");
    }

    // 2. Demo nurse (idempotent by unique email).
    const existingNurse = await db.query.nurses.findFirst({
      where: eq(nurses.email, nurseEmail),
    });
    if (!existingNurse) {
      const passwordHash = await hashPassword(nursePassword, pepper);
      await db.insert(nurses).values({
        puskesmasId: pk!.id,
        email: nurseEmail,
        passwordHash,
      });
      console.log(`created nurse ${nurseEmail}`);
    } else {
      console.log(`nurse ${nurseEmail} exists`);
    }

    // 3. The demo cast: patients by code, then their story relative to today.
    const today = todayJakarta();
    const now = new Date();
    const deps = defaultServiceDeps();
    const links: Array<[string, string]> = [];
    let created = 0;
    let checkinCount = 0;

    for (const demo of DEMO) {
      const values = {
        startDate: addDays(today, -(demo.day - 1)),
        phase: demo.phase,
        pickupIntervalDays: demo.intervalDays,
        pmoContactHash: hashPmoContact(demo.pmoPhone, pepper),
        familyTokenHash: hashFamilyToken(demoToken(demo.code, pepper)),
        tokenRevokedAt: null,
        // Consent granted for demo patients so family flows are usable.
        consentAt: new Date(now.getTime() - 86_400_000 * demo.day),
        // Registered at the start of treatment, so "never reported" is measured from there.
        createdAt: new Date(`${addDays(today, -(demo.day - 1))}T01:00:00+07:00`),
      };
      let patient = await db.query.patients.findFirst({
        where: and(eq(patients.puskesmasId, pk!.id), eq(patients.code, demo.code)),
      });
      if (!patient) {
        [patient] = await db.insert(patients).values({ puskesmasId: pk!.id, code: demo.code, ...values }).returning();
        created += 1;
      } else {
        [patient] = await db.update(patients).set(values).where(eq(patients.id, patient.id)).returning();
      }
      links.push([demo.code, `${baseUrl}/f/${demoToken(demo.code, pepper)}`]);

      // Rebuild the story: old check-ins (and their alerts) and pickups of this demo patient go first.
      await db.delete(checkins).where(eq(checkins.patientId, patient.id));
      await db.delete(pickups).where(eq(pickups.patientId, patient.id));
      await db.insert(pickups).values({ patientId: patient.id, dueDate: addDays(today, demo.pickupDueIn) });

      const familyPatient = {
        id: patient.id,
        puskesmasId: patient.puskesmasId,
        startDate: patient.startDate,
        consentAt: patient.consentAt,
      };
      const ordered = [...demo.checkins].sort((a, b) => b.daysAgo - a.daysAgo);
      for (const [i, c] of ordered.entries()) {
        const date = addDays(today, -c.daysAgo);
        // Never in the future (a seed run before the clock time of today's check-in).
        const at = new Date(Math.min(Date.parse(`${date}T${c.at}:00+07:00`), now.getTime() - 60_000));
        const result = await submitCheckin(
          db as unknown as Database,
          familyPatient,
          {
            clientId: clientId(demo.code, date, i),
            occurredOn: date,
            doseStatus: c.dose,
            chips: c.chips ?? [],
            text: c.text ?? "",
          },
          deps,
          at,
        );
        if (result.kind !== "ok") throw new Error(`seed check-in refused for ${demo.code}`);
        // The alert of a RED check-in is stamped like the check-in, not with the time of seeding.
        if (result.reply.level === "RED") {
          await db.update(alerts).set({ createdAt: at }).where(eq(alerts.checkinId, result.reply.checkinId));
        }
        checkinCount += 1;
      }
    }

    console.log(`patients: ${created} created, ${DEMO.length - created} refreshed`);
    console.log(`demo story: ${checkinCount} check-ins for ${DEMO.length} patients`);
    console.log("family links (demo):");
    for (const [code, link] of links) console.log(`  ${code}  ${link}`);

    // Summary counts.
    const pkCount = (await db.select().from(puskesmas)).length;
    const nurseCount = (await db.select().from(nurses)).length;
    const patientCount = (
      await db.select().from(patients).where(eq(patients.puskesmasId, pk!.id))
    ).length;
    console.log(
      `seed done. puskesmas=${pkCount} nurses=${nurseCount} patients(demo pk)=${patientCount}`,
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("seed failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
