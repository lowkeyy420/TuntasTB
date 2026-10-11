import { and, eq } from "drizzle-orm";
import { patients } from "@/lib/db/schema";
import { readSession, SESSION_COOKIE, type SessionPayload } from "./session";

/**
 * Nurse authorization helper.
 *
 * `requireNurse` extracts and verifies the session cookie from a request and
 * returns the nurse and Puskesmas ids, or throws {@link UnauthorizedError}.
 * Every nurse route handler starts with it.
 */

export class UnauthorizedError extends Error {
  constructor() {
    super("unauthorized");
    this.name = "UnauthorizedError";
  }
}

/** Reads the `session` cookie value from a standard Request. */
function sessionCookie(request: Request): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return rest.join("=");
  }
  return undefined;
}

export async function requireNurse(
  request: Request,
  secret: string,
): Promise<SessionPayload> {
  const token = sessionCookie(request);
  const payload = await readSession(token, secret);
  if (!payload) throw new UnauthorizedError();
  return payload;
}

/**
 * Builds a WHERE condition that scopes a patient query to one patient AND the
 * nurse's own Puskesmas. The Puskesmas comes from the session, never from
 * request input, so a nurse can never read another Puskesmas's patient.
 */
export function scopedPatientWhere(patientId: string, puskesmasId: string) {
  return and(
    eq(patients.id, patientId),
    eq(patients.puskesmasId, puskesmasId),
  );
}
