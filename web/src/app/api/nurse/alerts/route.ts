import { db } from "@/lib/db";
import { authNurse, json } from "@/lib/patients/http";
import { listAlerts, type AlertStatus } from "@/lib/alerts/service";

export const dynamic = "force-dynamic";

const STATUSES: readonly string[] = ["open", "acknowledged", "all"];

/**
 * `GET /api/nurse/alerts?status=open|acknowledged|all` (default `open`) for the
 * session's Puskesmas. `poll=1` marks the console's timer-driven refresh,
 * which is not written to the audit log.
 */
export async function GET(request: Request) {
  const auth = await authNurse(request);
  if ("response" in auth) return auth.response;
  const params = new URL(request.url).searchParams;
  const status = params.get("status") ?? "open";
  if (!STATUSES.includes(status)) return json({ error: "validation" }, 400);
  const alerts = await listAlerts(db, auth.session, status as AlertStatus, { quiet: params.get("poll") === "1" });
  return json({ alerts });
}
