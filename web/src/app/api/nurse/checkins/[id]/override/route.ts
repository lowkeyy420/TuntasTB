import { db } from "@/lib/db";
import { copy } from "@/copy/nurse.id";
import { fieldErrors } from "@/lib/patients/schema";
import { authNurse, isUuid, json, notFound, readJson } from "@/lib/patients/http";
import { overrideCheckin, overrideSchema } from "@/lib/checkin/override";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * A nurse changes the level of a check-in. Body `{ level, note }`; the note must
 * have at least 10 characters. The original level is kept, the change is audited.
 */
export async function POST(request: Request, context: Ctx) {
  const auth = await authNurse(request);
  if ("response" in auth) return auth.response;
  const { id } = await context.params;
  if (!isUuid(id)) return notFound();

  const parsed = overrideSchema.safeParse(await readJson(request));
  if (!parsed.success) return json({ error: "validation", fields: fieldErrors(parsed.error) }, 400);

  const result = await overrideCheckin(db, auth.session, id, parsed.data);
  switch (result.kind) {
    case "not_found":
      return notFound();
    case "same_level":
      return json({ error: "validation", fields: { level: copy.timeline.override.sameLevel } }, 400);
    case "ok":
      return json({
        checkinId: result.checkinId,
        level: result.level,
        originalLevel: result.originalLevel,
        alertCreated: result.alertCreated,
      });
  }
}
