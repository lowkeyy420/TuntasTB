/**
 * In-memory login throttle: 5 failures per email per 15 minutes.
 *
 * Acceptable for the single-container MVP; a restart clearing the counter is
 * tolerated. Keyed by lower-cased email.
 */

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;

interface Attempt {
  count: number;
  firstAt: number;
}

export class LoginThrottle {
  private readonly attempts = new Map<string, Attempt>();

  private key(email: string): string {
    return email.trim().toLowerCase();
  }

  /** True when the email has already reached the failure limit in the window. */
  isBlocked(email: string, now: number = Date.now()): boolean {
    const a = this.attempts.get(this.key(email));
    if (!a) return false;
    if (now - a.firstAt > WINDOW_MS) {
      this.attempts.delete(this.key(email));
      return false;
    }
    return a.count >= MAX_FAILURES;
  }

  /** Records a failed attempt. */
  recordFailure(email: string, now: number = Date.now()): void {
    const k = this.key(email);
    const a = this.attempts.get(k);
    if (!a || now - a.firstAt > WINDOW_MS) {
      this.attempts.set(k, { count: 1, firstAt: now });
      return;
    }
    a.count += 1;
  }

  /** Clears the counter after a successful login. */
  reset(email: string): void {
    this.attempts.delete(this.key(email));
  }
}

/** Process-wide throttle shared by the login route. */
export const loginThrottle = new LoginThrottle();
