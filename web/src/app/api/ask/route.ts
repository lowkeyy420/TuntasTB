import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { puskesmas } from "@/lib/db/schema";
import { audit } from "@/lib/audit/audit";
import { bearerToken, resolveFamilyToken } from "@/lib/family-token";
import { ConsentRequiredError, requireConsent } from "@/lib/consent/requireConsent";
import { json, notFound, readJson } from "@/lib/patients/http";
import { forbiddenFromLexicon } from "@/lib/reply/forbidden";
import { defaultRules } from "@/lib/triage/loadFiles";
import { askRequestSchema } from "@/lib/ask/schema";
import { runAskFlow } from "@/lib/ask/flow";
import { askLimiter } from "@/lib/ask/limiter";
import { corpusManifest } from "@/lib/ask/manifest";
import { answerQuestion } from "@/lib/ask/service";

export const dynamic = "force-dynamic";

/**
 * A family question answered from the guideline corpus, or not at all.
 *
 *  - unknown, revoked or malformed token: 404 (same body as every family route)
 *  - no consent: 403, nothing processed
 *  - more than 10 questions in an hour for the patient: 429
 *  - invalid body (empty, under 3 or over 300 characters, extra keys): 400, no flow call
 *  - otherwise 200 `{ kind: "answer" | "abstain" | "urgent", text, citations, contact }`
 *
 * The question and the answer are never stored or logged. The audit entry
 * records only the actor, the outcome and the abstain reason code.
 */
export async function POST(request: Request) {
  const patient = await resolveFamilyToken(db, bearerToken(request));
  if (!patient) return notFound();

  try {
    await requireConsent({ getConsentAt: async () => patient.consentAt }, patient.id);
  } catch (e) {
    if (e instanceof ConsentRequiredError) return json({ error: "consent_required" }, 403);
    throw e;
  }

  if (!askLimiter.tryHit(patient.id)) return json({ error: "too_many" }, 429);

  const parsed = askRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) return json({ error: "validation" }, 400);

  const [pk] = await db
    .select({ name: puskesmas.name, phone: puskesmas.phone })
    .from(puskesmas)
    .where(eq(puskesmas.id, patient.puskesmasId));
  const contact = { name: pk?.name ?? "", phone: pk?.phone ?? "" };

  const rules = defaultRules();
  const { response, reason } = await answerQuestion(parsed.data.question, contact, {
    rules,
    manifest: corpusManifest(),
    forbidden: forbiddenFromLexicon(rules.lexicon),
    runFlow: runAskFlow,
  });

  try {
    await audit(db, {
      actor: `family:${patient.id}`,
      action: "ask.create",
      target: patient.id,
      meta: { outcome: response.kind, ...(reason ? { abstain_reason: reason } : {}) },
    });
  } catch {
    // An audit failure must not hide a go-today instruction. The error carries no question text.
    console.error("ask.create audit entry failed");
  }

  return json(response);
}
