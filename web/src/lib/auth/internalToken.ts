import { createHash, timingSafeEqual } from "node:crypto";

/** Header carrying the shared secret of the server-to-server routes. */
export const INTERNAL_TOKEN_HEADER = "x-internal-token";

/**
 * Constant-time comparison of the presented internal token with the configured
 * one. Both sides are hashed first so the comparison always runs over
 * equal-length buffers and never leaks the length. When no token is configured
 * (unset or empty) every request is rejected.
 */
export function internalTokenValid(
  provided: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  if (!expected) return false;
  if (!provided) return false;
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(provided), digest(expected));
}
