import { db } from "@/lib/db";
import { bearerToken, resolveFamilyToken } from "@/lib/family-token";
import {
  ConsentRequiredError,
  requireConsent,
} from "@/lib/consent/requireConsent";
import { json, notFound, readJson } from "@/lib/patients/http";
import { checkinBodySchema } from "@/lib/checkin/schema";
import { submitCheckin } from "@/lib/checkin/service";

export const dynamic = "force-dynamic";

/**
 * Stores one daily check-in for the token's patient.
 *
 *  - unknown, revoked or malformed token: 404 (same body as every family route)
 *  - no consent: 403, nothing stored
 *  - invalid body (including a `patientId` or `treatmentDay`): 400, nothing stored
 *  - more than 20 check-ins today: 429, nothing stored
 *  - a repeated `clientId`: 200 with the stored result
 *
 * Request bodies are never logged: they carry free text about health.
 */
export async function POST(request: Request) {
  const patient = await resolveFamilyToken(db, bearerToken(request));
  if (!patient) return notFound();

  try {
    // The token lookup just read the patient row, so its consent time is current.
    await requireConsent({ getConsentAt: async () => patient.consentAt }, patient.id);
  } catch (e) {
    if (e instanceof ConsentRequiredError) return json({ error: "consent_required" }, 403);
    throw e;
  }

  const parsed = checkinBodySchema.safeParse(await readJson(request));
  if (!parsed.success) return json({ error: "validation" }, 400);

  try {
    const result = await submitCheckin(db, patient, parsed.data);
    if (result.kind === "limit") return json({ error: "too_many" }, 429);
    return json(result.reply);
  } catch {
    // The transaction rolled back (for example the RED alert could not be
    // stored): report failure so the device keeps the check-in and retries.
    return json({ error: "server" }, 500);
  }
}
