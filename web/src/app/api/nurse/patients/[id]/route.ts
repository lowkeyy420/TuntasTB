import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { patients } from "@/lib/db/schema";
import { config } from "@/lib/config";
import { requireNurse, UnauthorizedError } from "@/lib/auth/requireNurse";
import { audit } from "@/lib/audit/audit";
import { fieldErrors, updateSchema } from "@/lib/patients/schema";
import { getPatient, updatePatient } from "@/lib/patients/service";
import { authNurse, isUuid, json, notFound, readJson } from "@/lib/patients/http";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  let session;
  try {
    session = await requireNurse(request, config.SESSION_SECRET);
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    throw e;
  }

  const { id } = await context.params;

  // Scope strictly to the nurse's own Puskesmas (taken from the session).
  const patient = await db.query.patients.findFirst({
    where: eq(patients.id, id),
    columns: { id: true, puskesmasId: true },
  });

  if (!patient || patient.puskesmasId !== session.puskesmasId) {
    // Reveal nothing about patients of other Puskesmas.
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Cascade delete (checkins, alerts, pickups) + keep an audit entry.
  await db.transaction(async (tx) => {
    await tx.delete(patients).where(eq(patients.id, id));
    await audit(tx, {
      actor: `nurse:${session.nurseId}`,
      action: "patient.delete",
      target: id,
      meta: { puskesmasId: session.puskesmasId },
    });
  });

  return NextResponse.json({ ok: true });
}


type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Ctx) {
  const auth = await authNurse(request);
  if ("response" in auth) return auth.response;
  const { id } = await context.params;
  if (!isUuid(id)) return notFound();
  const patient = await getPatient(db, auth.session, id);
  if (!patient) return notFound();
  return json({ patient });
}

export async function PATCH(request: Request, context: Ctx) {
  const auth = await authNurse(request);
  if ("response" in auth) return auth.response;
  const { id } = await context.params;
  if (!isUuid(id)) return notFound();

  const body = await readJson(request);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "validation", fields: fieldErrors(parsed.error) }, 400);
  }
  const patient = await updatePatient(db, auth.session, id, parsed.data);
  if (!patient) return notFound();
  return json({ patient });
}
