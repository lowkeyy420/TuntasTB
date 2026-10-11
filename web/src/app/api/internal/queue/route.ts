import { z } from "zod";
import { db } from "@/lib/db";
import { config } from "@/lib/config";
import { INTERNAL_TOKEN_HEADER, internalTokenValid } from "@/lib/auth/internalToken";
import { isUuid, json } from "@/lib/patients/http";
import { internalQueue } from "@/lib/queue/service";
import { todayJakarta } from "@/lib/time";

export const dynamic = "force-dynamic";

const isDate = (s: string) => {
  const d = new Date(`${s}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};
const dateSchema = z.string().refine(isDate);

/**
 * `GET /api/internal/queue?puskesmas_id=&date=` for the Langflow `nurse_digest`
 * flow. Header `x-internal-token` must equal INTERNAL_API_TOKEN (constant-time
 * compare); with no token configured every request is 401. Nothing about a
 * patient is returned before the token is checked.
 */
export async function GET(request: Request) {
  if (!internalTokenValid(request.headers.get(INTERNAL_TOKEN_HEADER), config.INTERNAL_API_TOKEN)) {
    return json({ error: "unauthorized" }, 401);
  }
  const url = new URL(request.url);
  const puskesmasId = url.searchParams.get("puskesmas_id") ?? "";
  const dateParam = url.searchParams.get("date");
  const date = dateParam === null || dateParam === "" ? todayJakarta() : dateParam;
  if (!isUuid(puskesmasId) || !dateSchema.safeParse(date).success) {
    return json({ error: "validation" }, 400);
  }
  return json(await internalQueue(db, puskesmasId, date));
}
