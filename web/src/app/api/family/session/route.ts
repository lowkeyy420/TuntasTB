import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { puskesmas } from "@/lib/db/schema";
import { audit } from "@/lib/audit/audit";
import { bearerToken, resolveFamilyToken } from "@/lib/family-token";
import { json, notFound } from "@/lib/patients/http";
import { todayJakarta, treatmentDay } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * Resolves the bearer token. Unknown, revoked, malformed and missing tokens
 * all return the same 404 body.
 */
export async function GET(request: Request) {
  const patient = await resolveFamilyToken(db, bearerToken(request));
  if (!patient) return notFound();

  const [pk] = await db
    .select({ name: puskesmas.name, phone: puskesmas.phone })
    .from(puskesmas)
    .where(eq(puskesmas.id, patient.puskesmasId));

  await audit(db, {
    actor: `family:${patient.id}`,
    action: "family.open",
    target: patient.id,
  });

  return json({
    consented: patient.consentAt !== null,
    treatmentDay: treatmentDay(patient.startDate, todayJakarta()),
    puskesmasName: pk?.name ?? "",
    puskesmasPhone: pk?.phone ?? "",
  });
}
