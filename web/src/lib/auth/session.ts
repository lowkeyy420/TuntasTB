import { SignJWT, jwtVerify } from "jose";

/**
 * Nurse session as an HS256 JWT signed with SESSION_SECRET.
 * Payload: { sub: nurseId, pid: puskesmasId, exp }. 12-hour lifetime.
 */

export const SESSION_COOKIE = "session";
export const SESSION_TTL_SECONDS = 12 * 60 * 60; // 12 hours

export interface SessionPayload {
  nurseId: string;
  puskesmasId: string;
}

function keyFrom(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

/** Signs a session token valid for 12 hours from `now`. */
export async function createSession(
  payload: SessionPayload,
  secret: string,
  now: Date = new Date(),
): Promise<string> {
  const iat = Math.floor(now.getTime() / 1000);
  return new SignJWT({ pid: payload.puskesmasId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.nurseId)
    .setIssuedAt(iat)
    .setExpirationTime(iat + SESSION_TTL_SECONDS)
    .sign(keyFrom(secret));
}

/**
 * Verifies a session token. Returns the payload or null when the token is
 * missing, tampered (bad signature) or expired.
 */
export async function readSession(
  token: string | undefined | null,
  secret: string,
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, keyFrom(secret), {
      algorithms: ["HS256"],
    });
    const nurseId = payload.sub;
    const puskesmasId = payload.pid;
    if (typeof nurseId !== "string" || typeof puskesmasId !== "string") {
      return null;
    }
    return { nurseId, puskesmasId };
  } catch {
    return null;
  }
}
