import { db } from "@/lib/db";
import { bearerToken, resolveFamilyToken } from "@/lib/family-token";
import { ConsentRequiredError, requireConsent } from "@/lib/consent/requireConsent";
import { json, notFound } from "@/lib/patients/http";
import { familyPickup } from "@/lib/pickups/service";

export const dynamic = "force-dynamic";

/**
 * The next pickup of the token's patient: `{ pickup: { dueDate, daysUntil,
 * state, daysOverdue } | null, contact }`.
 *  - unknown, revoked or malformed token: 404 (same body as every family route)
 *  - no consent: 403
 */
export async function GET(request: Request) {
  const patient = await resolveFamilyToken(db, bearerToken(request));
  if (!patient) return notFound();
  try {
    await requireConsent({ getConsentAt: async () => patient.consentAt }, patient.id);
  } catch (e) {
    if (e instanceof ConsentRequiredError) return json({ error: "consent_required" }, 403);
    throw e;
  }
  return json(await familyPickup(db, patient));
}
