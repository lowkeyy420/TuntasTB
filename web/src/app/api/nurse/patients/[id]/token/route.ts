import { db } from "@/lib/db";
import { config } from "@/lib/config";
import { familyLinkUrl, revokeToken, rotateToken } from "@/lib/patients/service";
import { authNurse, isUuid, json, notFound } from "@/lib/patients/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Rotate: new one-time link; the old token stops working immediately. */
export async function POST(request: Request, context: Ctx) {
  const auth = await authNurse(request);
  if ("response" in auth) return auth.response;
  const { id } = await context.params;
  if (!isUuid(id)) return notFound();

  const result = await rotateToken(db, auth.session, id);
  if (!result) return notFound();
  return json({ familyLink: familyLinkUrl(config.APP_BASE_URL, result.token) });
}

/** Revoke: the patient is left with no working link. */
export async function DELETE(request: Request, context: Ctx) {
  const auth = await authNurse(request);
  if ("response" in auth) return auth.response;
  const { id } = await context.params;
  if (!isUuid(id)) return notFound();

  const ok = await revokeToken(db, auth.session, id);
  if (!ok) return notFound();
  return json({ ok: true });
}
