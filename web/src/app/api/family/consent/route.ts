import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { patients } from "@/lib/db/schema";
import { bearerToken, resolveFamilyToken } from "@/lib/family-token";
import { recordConsent } from "@/lib/consent/requireConsent";
import { json, notFound } from "@/lib/patients/http";

export const dynamic = "force-dynamic";

/**
 * Records consent for the token's patient. The first call stores the consent
 * time and its audit entry in one transaction; later calls change nothing.
 * Consent belongs to the patient, so it survives link rotation.
 */
export async function POST(request: Request) {
  const patient = await resolveFamilyToken(db, bearerToken(request));
  if (!patient) return notFound();

  await db.transaction(async (tx) => {
    // Lock the row so two simultaneous taps cannot both record consent.
    const [row] = await tx
      .select({ consentAt: patients.consentAt })
      .from(patients)
      .where(eq(patients.id, patient.id))
      .for("update");
    if (row && row.consentAt === null) {
      await recordConsent(tx, patient.id, new Date(), `family:${patient.id}`);
    }
  });

  return json({ consented: true });
}
