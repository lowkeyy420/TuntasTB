import { db } from "@/lib/db";
import { authNurse, isUuid, json, notFound } from "@/lib/patients/http";
import { acknowledgeAlert } from "@/lib/alerts/service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Acknowledges an alert of the session's Puskesmas. The first nurse wins: a
 * second acknowledgement returns 200 with the stored one and
 * `alreadyAcknowledged: true`. An alert of another Puskesmas is a 404 and unchanged.
 */
export async function POST(request: Request, context: Ctx) {
  const auth = await authNurse(request);
  if ("response" in auth) return auth.response;
  const { id } = await context.params;
  if (!isUuid(id)) return notFound();

  const result = await acknowledgeAlert(db, auth.session, id);
  if (result.kind === "not_found") return notFound();
  return json({ alert: result.alert, alreadyAcknowledged: result.kind === "already" });
}
