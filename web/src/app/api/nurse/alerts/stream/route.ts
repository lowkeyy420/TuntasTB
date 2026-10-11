import { db } from "@/lib/db";
import { config } from "@/lib/config";
import { audit } from "@/lib/audit/audit";
import { authNurse, json } from "@/lib/patients/http";
import { ensureAlertListener } from "@/lib/alerts/listener";
import { alertRegistry } from "@/lib/alerts/registry";
import { getAlertItem, openAlerts } from "@/lib/alerts/service";
import { alertStream } from "@/lib/alerts/stream";

// Needs a long-lived Node connection (LISTEN) and a streamed body.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-sent events for the nurse console. Events: `alerts.snapshot` (the open
 * alerts, once on connect), `alert.created`, `alert.acknowledged`. Only the
 * session's Puskesmas is ever streamed. One `alert.stream_open` audit entry per
 * connection, none per event.
 */
export async function GET(request: Request) {
  const auth = await authNurse(request);
  if ("response" in auth) return auth.response;
  const { session } = auth;

  try {
    await ensureAlertListener(config.DATABASE_URL);
  } catch {
    return json({ error: "unavailable" }, 503);
  }
  await audit(db, {
    actor: `nurse:${session.nurseId}`,
    action: "alert.stream_open",
    target: session.puskesmasId,
  });

  const body = alertStream({
    puskesmasId: session.puskesmasId,
    registry: alertRegistry(),
    loadOpen: () => openAlerts(db, session.puskesmasId),
    loadOne: (id) => getAlertItem(db, id, session.puskesmasId),
    signal: request.signal,
  });
  return new Response(body, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      // no-transform keeps compression middleware from buffering the stream.
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
