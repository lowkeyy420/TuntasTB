import { db } from "@/lib/db";
import { copy } from "@/copy/nurse.id";
import { fieldErrors } from "@/lib/patients/schema";
import { authNurse, isUuid, json, notFound, readJson } from "@/lib/patients/http";
import { rescheduleSchema } from "@/lib/pickups/schema";
import { reschedulePickup } from "@/lib/pickups/service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; pickupId: string }> };

/** Corrects the due date of an OPEN pickup. Body `{ dueDate }`. A pickup already done is 409. */
export async function PATCH(request: Request, context: Ctx) {
  const auth = await authNurse(request);
  if ("response" in auth) return auth.response;
  const { id, pickupId } = await context.params;
  if (!isUuid(id) || !isUuid(pickupId)) return notFound();

  const parsed = rescheduleSchema.safeParse(await readJson(request));
  if (!parsed.success) return json({ error: "validation", fields: fieldErrors(parsed.error) }, 400);

  const result = await reschedulePickup(db, auth.session, id, pickupId, parsed.data.dueDate);
  switch (result.kind) {
    case "not_found":
      return notFound();
    case "invalid_date":
      return json({ error: "validation", fields: { dueDate: copy.pickup.validation.dueRange } }, 400);
    case "closed":
      return json({ error: "closed" }, 409);
    case "ok":
      return json({ pickup: result.pickup });
  }
}
