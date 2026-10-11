import { db } from "@/lib/db";
import { authNurse, json } from "@/lib/patients/http";
import { nurseQueue } from "@/lib/queue/service";

export const dynamic = "force-dynamic";

/** The nurse's ranked queue for today, scoped to the session's Puskesmas. */
export async function GET(request: Request) {
  const auth = await authNurse(request);
  if ("response" in auth) return auth.response;
  return json(await nurseQueue(db, auth.session));
}
