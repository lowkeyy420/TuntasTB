import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { patients } from "@/lib/db/schema";
import { config } from "@/lib/config";
import { requireNurse, UnauthorizedError } from "@/lib/auth/requireNurse";
import { audit } from "@/lib/audit/audit";

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
