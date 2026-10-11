/**
 * In-memory sliding-window limiter: at most `limit` hits per key within
 * `windowMs`. Like the login throttle it lives in the one web container, and
 * a restart clearing it is tolerated for the MVP.
 */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Records a hit and returns true, or returns false (recording nothing) when the key is at its limit. */
  tryHit(key: string, now: number = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }

  reset(): void {
    this.hits.clear();
  }
}

export const QUESTIONS_PER_HOUR = 10;

/** Process-wide limiter of `POST /api/ask`, keyed by patient id. */
export const askLimiter = new SlidingWindowLimiter(QUESTIONS_PER_HOUR, 60 * 60 * 1000);
