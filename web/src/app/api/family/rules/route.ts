import { db } from "@/lib/db";
import { bearerToken, resolveFamilyToken } from "@/lib/family-token";
import { json, notFound } from "@/lib/patients/http";
import { defaultRules } from "@/lib/triage/loadFiles";

export const dynamic = "force-dynamic";

/**
 * The rule bundle the check-in screen needs: the triage table (symptom chips
 * and level texts) and the lexicon. The browser caches it so the screen works
 * offline and computes the provisional reply from the very same files the
 * server uses. Requires a valid family token (same 404 as every family route).
 */
export async function GET(request: Request) {
  const patient = await resolveFamilyToken(db, bearerToken(request));
  if (!patient) return notFound();
  const rules = defaultRules();
  return json({ version: rules.version, table: rules.table, lexicon: rules.lexicon });
}
