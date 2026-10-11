import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { patients } from "@/lib/db/schema";
import type { Database } from "@/lib/db";

/**
 * Family link token.
 *
 * 32 random bytes (256 bits), base64url encoded: 43 characters. Only
 * SHA-256(token) is stored. A fast hash is correct here because the token
 * already carries 256 bits of entropy.
 */

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function generateFamilyToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashFamilyToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** The columns every family route needs about the token's patient. */
export interface FamilyPatient {
  id: string;
  puskesmasId: string;
  startDate: string;
  consentAt: Date | null;
}

/** Anything that can run a select: the Drizzle db or a transaction. */
export type FamilyTokenReader = Pick<Database, "select">;

/**
 * Resolves a family token to its patient, or null. A malformed, unknown and
 * revoked token all return null, so callers cannot tell them apart.
 */
export async function resolveFamilyToken(
  reader: FamilyTokenReader,
  token: string | null | undefined,
): Promise<FamilyPatient | null> {
  if (!token || !TOKEN_PATTERN.test(token)) return null;
  const rows = await reader
    .select({
      id: patients.id,
      puskesmasId: patients.puskesmasId,
      startDate: patients.startDate,
      consentAt: patients.consentAt,
    })
    .from(patients)
    .where(
      and(
        eq(patients.familyTokenHash, hashFamilyToken(token)),
        isNull(patients.tokenRevokedAt),
      ),
    );
  return rows[0] ?? null;
}

/** Reads `Authorization: Bearer <token>`; null when absent or malformed. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match ? match[1] : null;
}
