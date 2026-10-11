import { db } from "@/lib/db";
import { authNurse, isUuid, json, notFound } from "@/lib/patients/http";
import { getTimeline } from "@/lib/timeline/service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** A patient's check-ins, newest first. A patient of another Puskesmas is a 404. */
export async function GET(request: Request, context: Ctx) {
  const auth = await authNurse(request);
  if ("response" in auth) return auth.response;
  const { id } = await context.params;
  if (!isUuid(id)) return notFound();
  const timeline = await getTimeline(db, auth.session, id);
  if (!timeline) return notFound();
  return json(timeline);
}
