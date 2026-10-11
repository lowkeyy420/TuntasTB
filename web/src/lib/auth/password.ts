import bcrypt from "bcryptjs";

/**
 * Password hashing with bcryptjs (pure JS, no native build needed in the
 * container). A server-side pepper is appended before hashing so a leaked
 * database alone is not enough to attack the hashes offline.
 */

const BCRYPT_ROUNDS = 10;

/** A fixed dummy hash compared against for unknown emails, so login timing
 * does not reveal whether an email exists. */
export const DUMMY_HASH =
  "$2a$10$C6UzMDM.H6dfI/f/IKcEeO3q5p0VQ0f1c9yQp9x1yqf1yqf1yqf1y";

function withPepper(password: string, pepper: string): string {
  return `${password}${pepper}`;
}

export async function hashPassword(
  password: string,
  pepper: string,
): Promise<string> {
  return bcrypt.hash(withPepper(password, pepper), BCRYPT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string,
  pepper: string,
): Promise<boolean> {
  return bcrypt.compare(withPepper(password, pepper), hash);
}

/** Compares against the dummy hash to equalise timing for unknown emails.
 * Always returns false. */
export async function verifyAgainstDummy(
  password: string,
  pepper: string,
): Promise<boolean> {
  await bcrypt.compare(withPepper(password, pepper), DUMMY_HASH);
  return false;
}
