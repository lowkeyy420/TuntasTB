import { createHmac } from "node:crypto";
import { normalisePmoContact } from "./phone";

export class InvalidPmoContactError extends Error {
  constructor() {
    super("invalid PMO contact");
    this.name = "InvalidPmoContactError";
  }
}

/**
 * Keyed hash of a PMO phone number: HMAC-SHA256(pepper, normalised number).
 * A keyed hash is required because phone numbers have low entropy; a plain
 * hash could be reversed by enumeration. Empty input gives null. The raw
 * number is never stored anywhere.
 */
export function hashPmoContact(
  raw: string | null | undefined,
  pepper: string,
): string | null {
  if (raw === null || raw === undefined || raw.trim() === "") return null;
  const normalised = normalisePmoContact(raw);
  if (!normalised) throw new InvalidPmoContactError();
  return createHmac("sha256", pepper).update(normalised).digest("hex");
}
