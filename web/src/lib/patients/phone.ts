/**
 * Pure phone normalisation, safe to import from client code (no crypto).
 *
 * Digits only; a leading `0` or `62` becomes `+62`. A number that is still
 * not an Indonesian-looking number after that returns null.
 */
export function normalisePmoContact(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D+/g, "");
  if (digits.length === 0) return null;
  if (digits.startsWith("62")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = digits.slice(1);
  // Mobile numbers: 8xx followed by 6 to 10 digits.
  if (!/^8\d{7,11}$/.test(digits)) return null;
  return `+62${digits}`;
}
