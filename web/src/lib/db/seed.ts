import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, and } from "drizzle-orm";
import * as schema from "./schema";
import { puskesmas, nurses, patients } from "./schema";
import { hashPassword } from "@/lib/auth/password";

/**
 * Idempotent demo seed: one Puskesmas (with a contact number), one demo nurse
 * (from SEED_NURSE_EMAIL / SEED_NURSE_PASSWORD), and five synthetic patients.
 * Running it twice must not create duplicates. No real personal data.
 */

const PUSKESMAS_NAME = "Puskesmas Demo Jakarta";
const PUSKESMAS_PHONE = "021-5550123";

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

    // 3. Five synthetic patients (idempotent by code within the Puskesmas).
    const codes = ["DEMO-001", "DEMO-002", "DEMO-003", "DEMO-004", "DEMO-005"];
    const phases = ["intensive", "intensive", "continuation", "intensive", "continuation"];
    let created = 0;
    for (let i = 0; i < codes.length; i++) {
      const code = codes[i];
      const existing = await db.query.patients.findFirst({
        where: and(
          eq(patients.puskesmasId, pk!.id),
          eq(patients.code, code),
        ),
      });
      if (!existing) {
        await db.insert(patients).values({
          puskesmasId: pk!.id,
          code,
          startDate: "2024-06-01",
          phase: phases[i],
          // Consent granted for demo patients so family flows are usable.
          consentAt: new Date(),
        });
        created += 1;
      }
    }
    console.log(`patients: ${created} created, ${codes.length - created} existing`);

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
