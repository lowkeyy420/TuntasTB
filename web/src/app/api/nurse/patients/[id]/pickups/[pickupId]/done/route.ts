import { db } from "@/lib/db";
import { copy } from "@/copy/nurse.id";
import { fieldErrors } from "@/lib/patients/schema";
import { authNurse, isUuid, json, notFound, readJson } from "@/lib/patients/http";
import { doneSchema } from "@/lib/pickups/schema";
import { markPickupDone } from "@/lib/pickups/service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; pickupId: string }> };

/**
 * A nurse confirms that the patient collected the medicine. Body `{ doneOn? }`
 * (default today, never in the future). Schedules the next pickup. A family
 * link token has no nurse session and gets 401.
 */
export async function POST(request: Request, context: Ctx) {
  const auth = await authNurse(request);
  if ("response" in auth) return auth.response;
  const { id, pickupId } = await context.params;
  if (!isUuid(id) || !isUuid(pickupId)) return notFound();

  const raw = await readJson(request);
  const body = raw === undefined ? {} : raw;
  const parsed = doneSchema.safeParse(body);
  if (!parsed.success) return json({ error: "validation", fields: fieldErrors(parsed.error) }, 400);

  const result = await markPickupDone(db, auth.session, id, pickupId, parsed.data.doneOn);
  switch (result.kind) {
    case "not_found":
      return notFound();
    case "invalid_date":
      return json({ error: "validation", fields: { doneOn: copy.pickup.validation.doneRange } }, 400);
    case "already_done":
      return json({ alreadyDone: true, next: result.next });
    case "done":
      return json({ alreadyDone: false, completed: result.completed, next: result.next });
  }
}
